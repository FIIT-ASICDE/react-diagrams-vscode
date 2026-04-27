import { type Node, type Edge } from "@xyflow/react";
import { START_EDGE_SOURCE_ID, type FuncArg } from "../shared/types";
import { indent, normalize, sanitizeStatement, stringifyLabel } from "../shared/string-utils";
import { formatFunctionHeader, looksAsync } from "../graph/node-utils";
import { findLabeledEdge, getOutgoingEdges } from "../graph/traversal";
import type { Construct } from "../shared/construct";

// ─── Types ─────────────────────────────────────────────────────────────────

type AnyNodeData = {
	label?: unknown;
	sourceText?: unknown;
	construct?: unknown;
	loopLabel?: unknown;
	loopKind?: unknown;
	forHeader?: unknown;
	forOfBinding?: unknown;
	forEachIterable?: unknown;
	forEachCallee?: unknown;
	forEachParams?: unknown;
};

/**
 * What a construct's emit ended with:
 *
 *   fall      — control falls out the bottom; sequence continues with `next`.
 *   return    — `return` or `throw` happened; sequence STOPS.
 *   break     — `break` happened. Surrounding loop / switch absorbs.
 *   continue  — `continue` happened. Surrounding loop absorbs.
 */
type Outcome =
	| { kind: "fall" }
	| { kind: "return" }
	| { kind: "break"; label?: string }
	| { kind: "continue"; label?: string };

const FALL: Outcome = { kind: "fall" };
const RETURN: Outcome = { kind: "return" };

const getData = (node: Node): AnyNodeData => (node.data as AnyNodeData | undefined) ?? {};
const getStr = (value: unknown): string => (typeof value === "string" ? value : "");

function getConstruct(node: Node): Construct | undefined {
	const value = getStr(getData(node).construct);
	return value ? (value as Construct) : undefined;
}

const EXCEPTION_LABELS = new Set(["exception", "catch", "error"]);

const isExceptionEdge = (label: unknown): boolean => EXCEPTION_LABELS.has(normalize(label));
const isBackEdge = (edge: Edge): boolean => edge.type === "back";

// ─── Generator ─────────────────────────────────────────────────────────────

/**
 * Skeleton-quality JS / TS generator from an activity-diagram-style
 * control-flow graph.
 *
 * Design choices:
 *
 *   - Per-construct structural emission. Each construct (if / switch /
 *     loop / try) emits its surface syntax and walks its inner subgraph
 *     as a sequence; non-fall outcomes (return / break / continue)
 *     bubble up.
 *
 *   - `try` is just `try { ... } catch (err) { ... }` — driven by the
 *     `'exception'` edge alone. Finally is NOT explicitly emitted as a
 *     `finally { ... }` block. `'finally'` edges are treated as ordinary
 *     fall-through, so finally-body statements appear inline.
 *
 *   - Break / continue are scoped: emitted only when there's a valid
 *     surrounding loop (for `continue`) or loop / switch (for `break`).
 *     Outside any such context they're silently dropped — JS would
 *     reject them as syntax errors. This keeps the skeleton output
 *     syntactically valid even when the source graph is partial.
 */
export class CodeGenerator {
	private readonly nodeById: Map<string, Node>;
	private readonly asyncMode: boolean;

	private code = "";

	/**
	 * Loop nodes currently being emitted. Tracked so a back-edge into
	 * an active loop terminates the inner sequence cleanly, AND so
	 * `continue` and `break` know whether they have a surrounding loop
	 * to target.
	 */
	private readonly activeLoops = new Set<string>();

	/**
	 * Counter of "break-absorbing" contexts on the emission stack —
	 * incremented when entering a loop OR a switch, decremented on exit.
	 *
	 * `break;` is valid only when this counter > 0. We use a counter
	 * rather than a set because a switch doesn't have a meaningful "id"
	 * in the graph that differentiates it from other switches; we just
	 * need to know "are we inside SOMETHING that can catch break".
	 */
	private breakDepth = 0;

	private readonly maxDepth = 1500;
	private depth = 0;

	constructor(
		private readonly nodes: Node[],
		private readonly edges: Edge[],
	) {
		this.nodeById = new Map(nodes.map((node) => [String(node.id), node]));
		this.asyncMode = looksAsync(nodes);
	}

	generate(funcName: string, funcArgs: FuncArg[]): string {
		const startEdge = this.findStartEdge();
		if (!startEdge) {
			return formatFunctionHeader(funcName, funcArgs, this.asyncMode)
				+ "  // Build a diagram and click Convert.\n}";
		}
		this.code = formatFunctionHeader(funcName, funcArgs, this.asyncMode);
		this.emitSequence(String(startEdge.target), 1, undefined);
		this.code += "}";
		return this.code;
	}

	generateBodyOnly(): string {
		const startEdge = this.findStartEdge();
		if (!startEdge) return "";
		this.code = "";
		this.emitSequence(String(startEdge.target), 0, undefined);
		return this.code;
	}

	private findStartEdge(): Edge | undefined {
		return (
			this.edges.find((e) => String(e.source) === START_EDGE_SOURCE_ID) ??
			this.edges.find((e) => {
				const src = this.nodeById.get(String(e.source));
				return src?.type === "start" || src?.type === "initial";
			})
		);
	}

	// ── Scope helpers ─────────────────────────────────────────────────────

	private isInLoop(): boolean {
		return this.activeLoops.size > 0;
	}

	private canBreak(): boolean {
		return this.breakDepth > 0;
	}

	// ── Sequence emission ─────────────────────────────────────────────────

	/**
	 * Emit nodes from `startId` until:
	 *   - cursor === stopAt
	 *   - cursor is an `end` node (RETURN)
	 *   - cursor is a back-edge target into an active loop (FALL)
	 *   - cursor was visited in this sequence already (cycle guard)
	 *   - a construct returns a non-fall outcome
	 *
	 * Defensive scope check: if a non-fall outcome is `break` or
	 * `continue` and there's no surrounding loop / switch to absorb it
	 * (the AST said `break;` but the parser handed us a graph where
	 * we're not actually inside a loop), convert it to FALL so the
	 * outer sequence keeps going. The terminator's text was already
	 * written into `code` by `emitTerminator`, but at this point the
	 * sequence wouldn't otherwise propagate it as a structural
	 * statement — see `emitTerminator` for the gate that prevents
	 * those texts from being emitted in the first place.
	 */
	private emitSequence(startId: string, level: number, stopAt: string | undefined): Outcome {
		const localSeen = new Set<string>();
		let cursor: string | undefined = startId;

		while (cursor !== undefined) {
			if (stopAt !== undefined && cursor === stopAt) return FALL;
			if (this.activeLoops.has(cursor)) return FALL;

			const node = this.nodeById.get(cursor);
			if (!node) return FALL;
			if (node.type === "end") return RETURN;

			if (localSeen.has(cursor)) return FALL;
			localSeen.add(cursor);

			this.depth += 1;
			let outcome: Outcome;
			let next: string | undefined;
			try {
				if (this.depth > this.maxDepth) {
					this.code += `${indent(level)}// recursion limit\n`;
					return FALL;
				}
				const visited = this.emitNode(node, level);
				outcome = visited.outcome;
				next = visited.next;
			} finally {
				this.depth -= 1;
			}

			if (outcome.kind !== "fall") {
				// Defensive scope check: an unlabeled break/continue
				// outside any loop/switch is invalid JS. Treat as FALL
				// so the outer sequence keeps going and we don't
				// propagate a syntax-invalid construct.
				if (outcome.kind === "break" && !outcome.label && !this.canBreak()) {
					// Sequence continues from `next` (the construct's
					// natural successor) as if the break never happened.
					cursor = next;
					continue;
				}
				if (outcome.kind === "continue" && !outcome.label && !this.isInLoop()) {
					cursor = next;
					continue;
				}
				return outcome;
			}

			cursor = next;
		}

		return FALL;
	}

	// ── Node dispatch ─────────────────────────────────────────────────────

	private emitNode(node: Node, level: number): { outcome: Outcome; next: string | undefined } {
		const id = String(node.id);
		const construct = getConstruct(node);

		if (construct) {
			switch (construct) {
				case "if": return this.emitIf(node, level);
				case "switch": return this.emitSwitch(node, level);
				case "try": return this.emitTry(node, level);
				case "while":
				case "do-while":
				case "for":
				case "for-of":
				case "for-in":
				case "foreach":
					return this.emitLoop(node, construct, level);
				case "function":
				case "hook":
					this.emitInlineSnippet(node, level);
					return { outcome: FALL, next: this.fallthroughSuccessor(id) };
				case "return":
				case "throw":
				case "break":
				case "continue":
					return this.emitTerminator(node, construct, level);
			}
		}

		switch (node.type) {
			case "merge":
			case "initial":
			case "start":
				return { outcome: FALL, next: this.fallthroughSuccessor(id) };
			case "expandable":
				this.emitInlineSnippet(node, level);
				return { outcome: FALL, next: this.fallthroughSuccessor(id) };
			case "decision":
				return this.emitIf(node, level);
			case "loop": {
				const legacyKind = (getStr(getData(node).loopKind) || "while") as Construct;
				return this.emitLoop(node, legacyKind, level);
			}
			case "action":
			default:
				return this.emitAction(node, level);
		}
	}

	// ── Action / inline / terminator ──────────────────────────────────────

	private emitAction(node: Node, level: number): { outcome: Outcome; next: string | undefined } {
		const text = this.actionText(node);
		this.writeStatement(text, level);

		const sniffed = this.sniffTerminator(text);
		if (sniffed) {
			// Apply the same scope gate as for explicit terminator nodes.
			if (sniffed.kind === "break" && !sniffed.label && !this.canBreak()) {
				return { outcome: FALL, next: this.fallthroughSuccessor(String(node.id)) };
			}
			if (sniffed.kind === "continue" && !sniffed.label && !this.isInLoop()) {
				return { outcome: FALL, next: this.fallthroughSuccessor(String(node.id)) };
			}
			return { outcome: sniffed, next: undefined };
		}

		return { outcome: FALL, next: this.fallthroughSuccessor(String(node.id)) };
	}

	private emitInlineSnippet(node: Node, level: number): void {
		const text = getStr(getData(node).sourceText);
		if (text.trim()) this.writeSnippet(text, level);
	}

	/**
	 * Emit a terminator (`return` / `throw` / `break` / `continue`).
	 *
	 * Scope gate for break/continue: if the surrounding context can't
	 * absorb the unlabeled form, we don't write the keyword at all and
	 * return FALL with the natural successor. Without this gate, a
	 * partial graph or a misplaced break/continue node would produce
	 * syntactically invalid JS.
	 */
	private emitTerminator(
		node: Node,
		construct: Construct,
		level: number,
	): { outcome: Outcome; next: string | undefined } {
		const text = this.actionText(node);

		switch (construct) {
			case "return":
			case "throw":
				this.writeStatement(text, level);
				return { outcome: RETURN, next: undefined };

			case "break": {
				const label = this.extractLabel(text, "break");
				// Unlabeled break must be inside a loop or switch.
				// Labeled break is always emitted (the labelled construct
				// is the responsibility of the surrounding emitter to
				// match — if it doesn't, the JS will be invalid, but
				// that's a graph-correctness issue beyond our skeleton).
				if (!label && !this.canBreak()) {
					return { outcome: FALL, next: this.fallthroughSuccessor(String(node.id)) };
				}
				this.writeStatement(text, level);
				return { outcome: { kind: "break", label }, next: undefined };
			}

			case "continue": {
				const label = this.extractLabel(text, "continue");
				if (!label && !this.isInLoop()) {
					return { outcome: FALL, next: this.fallthroughSuccessor(String(node.id)) };
				}
				this.writeStatement(text, level);
				return { outcome: { kind: "continue", label }, next: undefined };
			}
		}
		return { outcome: FALL, next: undefined };
	}

	private actionText(node: Node): string {
		const data = getData(node);
		return getStr(data.sourceText).trim() || sanitizeStatement(getStr(data.label).trim());
	}

	private writeStatement(text: string, level: number): void {
		if (!text) return;
		if (text.includes("\n")) this.writeSnippet(text, level);
		else this.code += `${indent(level)}${text}\n`;
	}

	private extractLabel(text: string, keyword: "break" | "continue"): string | undefined {
		const m = text.match(new RegExp(`^${keyword}\\s+([A-Za-z_$][\\w$]*)`));
		return m ? m[1] : undefined;
	}

	private sniffTerminator(text: string): Outcome | undefined {
		const t = text.trim();
		if (/^return\b/.test(t) || /^throw\b/.test(t)) return RETURN;
		if (/^break\b/.test(t)) return { kind: "break", label: this.extractLabel(t, "break") };
		if (/^continue\b/.test(t)) return { kind: "continue", label: this.extractLabel(t, "continue") };
		return undefined;
	}

	// ── If ────────────────────────────────────────────────────────────────

	private emitIf(node: Node, level: number): { outcome: Outcome; next: string | undefined } {
	const id = String(node.id);
	const data = getData(node);
	const condition =
		getStr(data.sourceText).trim() ||
		getStr(data.label).trim() ||
		"condition";

	const outgoing = this.outgoingForwardEdges(id);
	const yesEdge = this.pickEdge(outgoing, ["yes", "true"]);
	const noEdge =
		this.pickEdge(outgoing, ["no", "false", "done"]) ??
		outgoing.find((e) => e !== yesEdge);

	const yesTarget = yesEdge ? String(yesEdge.target) : undefined;
	const noTarget = noEdge ? String(noEdge.target) : undefined;

	if (yesTarget && yesTarget === noTarget) {
		return { outcome: FALL, next: yesTarget };
	}

	const joinId =
		yesTarget && noTarget
			? this.findBranchJoin(yesTarget, noTarget)
			: undefined;

	const shouldEmitElse =
		Boolean(yesTarget && noTarget && yesTarget !== noTarget && joinId);

	this.code += `${indent(level)}if (${condition}) {\n`;

	let yesOutcome: Outcome = FALL;
	let noOutcome: Outcome = FALL;

	if (yesTarget) {
		yesOutcome = this.emitSequence(
			yesTarget,
			level + 1,
			shouldEmitElse ? joinId : noTarget,
		);
	}

	if (shouldEmitElse && noTarget) {
		this.code += `${indent(level)}} else {\n`;
		noOutcome = this.emitSequence(noTarget, level + 1, joinId);
	}

	this.code += `${indent(level)}}\n`;

	if (shouldEmitElse && yesOutcome.kind !== "fall" && noOutcome.kind !== "fall") {
		return {
			outcome: chooseDominant(yesOutcome, noOutcome),
			next: undefined,
		};
	}

	if (joinId) {
		return {
			outcome: FALL,
			next: this.fallthroughSuccessor(joinId),
		};
	}

	return { outcome: FALL, next: noTarget };
}

private findBranchJoin(a: string, b: string): string | undefined {
	const aReachable = this.collectReachableDistances(a, 80);
	const bReachable = this.collectReachableDistances(b, 80);

	const common = [...aReachable.keys()].filter((id) => bReachable.has(id));
	if (common.length === 0) return undefined;

	const mergeCommon = common.filter((id) => this.nodeById.get(id)?.type === "merge");
	const candidates = mergeCommon.length > 0 ? mergeCommon : common;

	candidates.sort((left, right) => {
		const leftScore = (aReachable.get(left) ?? 9999) + (bReachable.get(left) ?? 9999);
		const rightScore = (aReachable.get(right) ?? 9999) + (bReachable.get(right) ?? 9999);
		return leftScore - rightScore;
	});

	return candidates[0];
}

private collectReachableDistances(startId: string, limit: number): Map<string, number> {
	const distances = new Map<string, number>();
	const queue: Array<{ id: string; distance: number }> = [{ id: startId, distance: 0 }];

	while (queue.length > 0 && distances.size < limit) {
		const current = queue.shift()!;
		if (distances.has(current.id)) continue;

		distances.set(current.id, current.distance);

		const node = this.nodeById.get(current.id);
		if (!node || node.type === "end") continue;

		// CRITICAL:
		// For join detection, do not look past control-flow terminators.
		// A break/continue/return/throw may have outgoing graph edges
		// to visual/semantic destinations, but those are NOT normal
		// fall-through for branch-join detection.
		if (this.isTerminatorNode(node)) continue;

		// Also don't walk through active loop headers while searching
		// for local branch joins.
		if (this.activeLoops.has(current.id)) continue;

		for (const edge of this.outgoingForwardEdges(current.id)) {
			queue.push({
				id: String(edge.target),
				distance: current.distance + 1,
			});
		}
	}

	return distances;
}

	// ── Switch ────────────────────────────────────────────────────────────
private findSwitchJoin(caseTargets: string[]): string | undefined {
	if (caseTargets.length < 2) return undefined;

	const reachability = caseTargets.map((target) =>
		this.collectReachableDistances(target, 120),
	);

	const first = reachability[0];
	const common = [...first.keys()].filter((id) =>
		reachability.every((map) => map.has(id)),
	);

	if (common.length === 0) return undefined;

	const mergeCommon = common.filter((id) => this.nodeById.get(id)?.type === "merge");
	const candidates = mergeCommon.length > 0 ? mergeCommon : common;

	candidates.sort((a, b) => {
		const scoreA = reachability.reduce((sum, map) => sum + (map.get(a) ?? 9999), 0);
		const scoreB = reachability.reduce((sum, map) => sum + (map.get(b) ?? 9999), 0);
		return scoreA - scoreB;
	});

	return candidates[0];
}

private hasDirectFallthroughToCase(
	from: string,
	nextCaseTarget: string,
	stopBoundary?: string,
): boolean {
	const seen = new Set<string>();
	const stack = [from];

	while (stack.length > 0) {
		const id = stack.pop()!;
		if (seen.has(id)) continue;
		seen.add(id);

		if (id === nextCaseTarget) return true;
		if (stopBoundary && id === stopBoundary) continue;

		const node = this.nodeById.get(id);
		if (!node || node.type === "end") continue;

		if (id !== from) {
			if (node.type === "merge") continue;
			if (this.isTerminatorNode(node)) continue;
		}

		for (const edge of this.outgoingForwardEdges(id)) {
			stack.push(String(edge.target));
		}
	}

	return false;
}

private isTerminatorNode(node: Node): boolean {
	const construct = getConstruct(node);

	if (
		construct === "return" ||
		construct === "throw" ||
		construct === "break" ||
		construct === "continue"
	) {
		return true;
	}

	const text = this.actionText(node);
	return Boolean(this.sniffTerminator(text));
}

private lastMeaningfulLineTerminatesAtLevel(level: number): boolean {
	const expectedIndent = indent(level);

	const lines = this.code
		.split(/\r?\n/)
		.filter((line) => line.trim().length > 0);

	for (let i = lines.length - 1; i >= 0; i -= 1) {
		const line = lines[i];
		const trimmed = line.trim();

		if (/^(case\b|default:)/.test(trimmed)) {
			return false;
		}

		if (!line.startsWith(expectedIndent)) {
			continue;
		}

		const withoutExpectedIndent = line.slice(expectedIndent.length);

		// Ignore nested statements deeper than this case body level.
		if (/^\s/.test(withoutExpectedIndent)) {
			continue;
		}

		return (
			/^return\b/.test(trimmed) ||
			/^throw\b/.test(trimmed) ||
			/^break\b/.test(trimmed) ||
			/^continue\b/.test(trimmed)
		);
	}

	return false;
}

private emitSwitch(node: Node, level: number): { outcome: Outcome; next: string | undefined } {
	const id = String(node.id);
	const data = getData(node);
	const expr =
		getStr(data.sourceText).trim() ||
		getStr(data.label).trim() ||
		"value";

	const outgoing = this.outgoingForwardEdges(id);
	const caseEdges = outgoing.filter((e) => this.parseSwitchLabels(e.label).length > 0);
	const fallEdge = outgoing.find((e) => this.parseSwitchLabels(e.label).length === 0);

	const caseTargets = caseEdges.map((e) => String(e.target));

	// Switch exit / post-switch target.
	// Ak parser dal explicitný fall-through edge, použi ten.
	// Inak skús nájsť spoločný join všetkých case vetiev.
	const afterSwitch =
		fallEdge ? String(fallEdge.target) : this.findSwitchJoin(caseTargets);

	this.code += `${indent(level)}switch (${expr}) {\n`;

	this.breakDepth += 1;

	const outcomes: Outcome[] = [];

	try {
		for (let i = 0; i < caseEdges.length; i += 1) {
			const headers = this.parseSwitchLabels(caseEdges[i].label);

			for (const header of headers) {
				this.code += `${indent(level + 1)}${header}\n`;
			}

			const target = caseTargets[i];
			const isDefaultCase = headers.some((h) => h === "default:");

			let outcome = this.emitSequence(target, level + 2, afterSwitch);

			// Switch absorbuje obyčajný break.
			if (outcome.kind === "break" && !outcome.label) {
				outcome = FALL;
			}

			// Skeleton rule:
			// Každý case berieme ako samostatnú vetvu.
			// Nepokúšame sa zachovať JS fallthrough.
			// Ak case normálne dobehne, pridáme break.
			const caseBodyLevel = level + 2;

			if (!isDefaultCase && !this.lastMeaningfulLineTerminatesAtLevel(caseBodyLevel)) {
				this.code += `${indent(caseBodyLevel)}break;\n`;
			}

			outcomes.push(outcome);
		}
	} finally {
		this.breakDepth -= 1;
	}

	this.code += `${indent(level)}}\n`;

	const allDiverge =
		outcomes.length > 0 &&
		outcomes.every((outcome) => outcome.kind !== "fall");

	if (allDiverge && !afterSwitch) {
		let dominant: Outcome = outcomes[0];

		for (let i = 1; i < outcomes.length; i += 1) {
			dominant = chooseDominant(dominant, outcomes[i]);
		}

		if (dominant.kind === "break" && !dominant.label) {
			return { outcome: FALL, next: afterSwitch };
		}

		return { outcome: dominant, next: undefined };
	}

	return { outcome: FALL, next: afterSwitch };
}
	private parseSwitchLabels(rawLabel: unknown): string[] {
		const text = stringifyLabel(rawLabel).trim();
		if (!text) return [];
		const parts = text.split(",").map((p) => p.trim()).filter(Boolean);
		if (parts.length === 0) return [];
		const first = parts[0].toLowerCase();
		if (!first.startsWith("case ") && first !== "default" && first !== "default:") return [];
		return parts.map((part, i) => {
			const lower = part.toLowerCase();
			if (lower === "default" || lower === "default:") return "default:";
			let header = i === 0 && part.startsWith("case ") ? part : `case ${part}`;
			return header.endsWith(":") ? header : `${header}:`;
		});
	}

	// ── Loop ──────────────────────────────────────────────────────────────

	private emitLoop(
		node: Node,
		construct: Construct,
		level: number,
	): { outcome: Outcome; next: string | undefined } {
		const id = String(node.id);

		if (this.activeLoops.has(id)) {
			return { outcome: FALL, next: undefined };
		}

		const data = getData(node);
		const sourceText = getStr(data.sourceText).trim();
		const label = getStr(data.label).trim();
		const loopLabel = getStr(data.loopLabel).trim();

		const outgoing = this.outgoingForwardEdges(id);
		const bodyEdge = this.pickEdge(outgoing, ["yes", "each", "true", "body", "next"]);
		const exitEdge =
			this.pickEdge(outgoing, ["no", "false", "done", "exit"]) ??
			outgoing.find((e) => String(e.target) !== String(bodyEdge?.target));
		const bodyTarget = bodyEdge ? String(bodyEdge.target) : undefined;
		const exitTarget = exitEdge ? String(exitEdge.target) : undefined;

		if (loopLabel) this.code += `${indent(level)}${loopLabel}:\n`;

		const header = this.formatLoopHeader(construct, data, sourceText, label);
		this.code += `${indent(level)}${header.open} {\n`;

		// Loop absorbs both break and continue.
		this.activeLoops.add(id);
		this.breakDepth += 1;
		let bodyOutcome: Outcome = FALL;
		try {
			if (bodyTarget) bodyOutcome = this.emitSequence(bodyTarget, level + 1, id);
		} finally {
			this.breakDepth -= 1;
			this.activeLoops.delete(id);
		}

		this.code += `${indent(level)}${header.close}\n`;

		const propagated = this.translateLoopBodyOutcome(bodyOutcome, loopLabel);
		if (propagated.kind !== "fall") return { outcome: propagated, next: undefined };

		return { outcome: FALL, next: exitTarget };
	}

	private formatLoopHeader(
		construct: Construct,
		data: AnyNodeData,
		sourceText: string,
		label: string,
	): { open: string; close: string } {
		switch (construct) {
			case "foreach": {
				const iterable = getStr(data.forEachIterable).trim() || sourceText || "items";
				const callee = getStr(data.forEachCallee).trim() || "forEach";
				const params = getStr(data.forEachParams).trim() || "(item)";
				return { open: `${iterable}.${callee}(${params} =>`, close: `});` };
			}
			case "for": {
				const headerText = getStr(data.forHeader).trim() || sourceText || ";;";
				return { open: `for (${headerText})`, close: `}` };
			}
			case "for-of":
			case "for-in": {
				const keyword = construct === "for-of" ? "of" : "in";
				const binding = getStr(data.forOfBinding).trim() || (keyword === "of" ? "const item" : "const key");
				const iterable = sourceText || "items";
				return { open: `for (${binding} ${keyword} ${iterable})`, close: `}` };
			}
			case "do-while": {
				const cond = sourceText || label || "true";
				return { open: `do`, close: `} while (${cond});` };
			}
			case "while":
			default: {
				const cond = sourceText || label || "true";
				return { open: `while (${cond})`, close: `}` };
			}
		}
	}

	private translateLoopBodyOutcome(o: Outcome, loopLabel: string): Outcome {
		switch (o.kind) {
			case "fall":
			case "return":
				return o;
			case "break":
				return !o.label || o.label === loopLabel ? FALL : o;
			case "continue":
				return !o.label || o.label === loopLabel ? FALL : o;
		}
	}

	// ── Try / catch ───────────────────────────────────────────────────────

	private findTryAfterTarget(tryId: string): string | undefined {
	const outgoing = getOutgoingEdges(this.edges, tryId).filter((e) => !isBackEdge(e));

	const tryBodyEdge = outgoing.find(
		(e) => !isExceptionEdge(e.label) && normalize(e.label) !== "finally",
	);

	const catchEdge = outgoing.find((e) => isExceptionEdge(e.label));

	const tryTarget = tryBodyEdge ? String(tryBodyEdge.target) : undefined;
	const catchTarget = catchEdge ? String(catchEdge.target) : undefined;

	if (tryTarget && catchTarget) {
		return this.findBranchJoin(tryTarget, catchTarget);
	}

	if (tryTarget) {
		return this.findLinearAfterTry(tryTarget);
	}

	return undefined;
}

private findLinearAfterTry(startId: string): string | undefined {
	const reachable = this.collectReachableDistances(startId, 120);

	const mergeCandidates = [...reachable.keys()].filter(
		(id) => this.nodeById.get(id)?.type === "merge",
	);

	if (mergeCandidates.length === 0) return undefined;

	mergeCandidates.sort((a, b) => {
		return (reachable.get(a) ?? 9999) - (reachable.get(b) ?? 9999);
	});

	return mergeCandidates[0];
}

	private emitTry(node: Node, level: number): { outcome: Outcome; next: string | undefined } {
		const id = String(node.id);

		const allOutgoing = getOutgoingEdges(this.edges, id).filter((e) => !isBackEdge(e));
		const catchEdge = allOutgoing.find((e) => isExceptionEdge(e.label));
		const tryBodyEdge = allOutgoing.find(
			(e) => !isExceptionEdge(e.label) && normalize(e.label) !== "finally",
		);

		const tryBodyTarget = tryBodyEdge ? String(tryBodyEdge.target) : undefined;
		const catchTarget = catchEdge ? String(catchEdge.target) : undefined;

		this.code += `${indent(level)}try {\n`;
		const afterTry = this.findTryAfterTarget(id);

		const tryOutcome = tryBodyTarget
			? this.emitSequence(tryBodyTarget, level + 1, afterTry)
			: FALL;
		this.code += `${indent(level)}}`;

		let catchOutcome: Outcome = FALL;
		if (catchTarget) {
			this.code += ` catch (e) {\n`;
			catchOutcome = this.emitSequence(catchTarget, level + 1, afterTry);
			this.code += `${indent(level)}}`;
		}
		this.code += `\n`;

		const hasCatch = catchTarget !== undefined;
		const tryDiverged = tryOutcome.kind !== "fall";
		const catchDiverged = !hasCatch || catchOutcome.kind !== "fall";

		if (tryDiverged && catchDiverged) {
			return {
				outcome: hasCatch ? chooseDominant(tryOutcome, catchOutcome) : tryOutcome,
				next: undefined,
			};
		}

		return { outcome: FALL, next: this.findTryAfterTarget(id) };
	}

	// ── Successor helpers ─────────────────────────────────────────────────

	private outgoingForwardEdges(id: string): Edge[] {
		return getOutgoingEdges(this.edges, id).filter(
			(e) => !isBackEdge(e) && !isExceptionEdge(e.label),
		);
	}

	private fallthroughSuccessor(id: string): string | undefined {
		const out = this.outgoingForwardEdges(id);
		if (out.length === 0) return undefined;

		const unlabeled = out.find((e) => {
			const n = normalize(e.label);
			return !n || n === "next";
		});
		if (unlabeled) return String(unlabeled.target);

		const fallish = out.find((e) => {
			const n = normalize(e.label);
			return n === "no" || n === "false" || n === "done" || n === "finally";
		});
		if (fallish) return String(fallish.target);

		return String(out[0].target);
	}

	private pickEdge(outgoing: Edge[], preferredLabels: string[]): Edge | undefined {
		return findLabeledEdge(outgoing, preferredLabels);
	}

	// ── Snippet writing ───────────────────────────────────────────────────

	private writeSnippet(snippet: string, level: number): void {
		const lines = snippet.split(/\r?\n/);

		let minIndent = Infinity;
		for (const line of lines) {
			if (line.trim().length === 0) continue;
			const m = line.match(/^[ \t]*/);
			const len = m ? m[0].length : 0;
			if (len < minIndent) minIndent = len;
		}
		if (!isFinite(minIndent)) minIndent = 0;

		for (const line of lines) {
			if (line.trim().length === 0) this.code += "\n";
			else this.code += `${indent(level)}${line.slice(minIndent)}\n`;
		}
	}
}

function chooseDominant(a: Outcome, b: Outcome): Outcome {
	if (a.kind === "return" || b.kind === "return") return RETURN;
	if (a.kind === "fall") return b;
	if (b.kind === "fall") return a;
	if (a.kind === "break" && b.kind === "continue") return a;
	if (a.kind === "continue" && b.kind === "break") return b;
	if (a.label && !b.label) return a;
	return b;
}