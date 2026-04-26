import { type Node, type Edge } from "@xyflow/react";
import { START_EDGE_SOURCE_ID, type FuncArg } from "../shared/types";
import { indent, normalize, sanitizeStatement, stringifyLabel } from "../shared/string-utils";
import { checkStructure, formatFunctionHeader, getNodeLabel, looksAsync } from "../graph/node-utils";
import {
	findJoinNode,
	findJoinNodeForBranches,
	findLabeledEdge,
	getOutgoingEdges,
	getPrimaryNext,
} from "../graph/traversal";

// ─── Types ────────────────────────────────────────────────────────────────

type Construct =
	| "if"
	| "switch"
	| "try"
	| "while"
	| "do-while"
	| "for"
	| "for-of"
	| "for-in"
	| "foreach"
	| "function"
	| "hook"
	| "return"
	| "throw"
	| "break"
	| "continue";

type AnyNodeData = {
	label?: unknown;
	sourceText?: unknown;
	construct?: unknown;
	forHeader?: unknown;
	forOfBinding?: unknown;
	forEachIterable?: unknown;
	forEachCallee?: unknown;
	forEachParams?: unknown;
	deps?: unknown;
};

const getData = (node: Node): AnyNodeData => (node.data as AnyNodeData | undefined) ?? {};
const getStr = (value: unknown): string => (typeof value === "string" ? value : "");

function getConstruct(node: Node): Construct | undefined {
	const value = getStr(getData(node).construct);
	return value ? (value as Construct) : undefined;
}

// ─── Generator ────────────────────────────────────────────────────────────

export class CodeGenerator {
	private readonly nodeById: Map<string, Node>;
	private readonly asyncMode: boolean;

	private code = "";
	private readonly suppressed = new Set<string>();
	private readonly activeLoopHeaders = new Set<string>();
	private readonly visitCount = new Map<string, number>();
	private depth = 0;

	private readonly maxDepth = 1200;
	private readonly maxVisitsPerContext = 6;

	constructor(
		private readonly nodes: Node[],
		private readonly edges: Edge[],
	) {
		checkStructure(nodes, edges);
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
		const first = this.nodeById.get(String(startEdge.target));
		if (first) this.visit(first, 1);
		this.code += "}";

		return this.code;
	}

	generateBodyOnly(): string {
		const startEdge = this.findStartEdge();
		if (!startEdge) return "";

		this.code = "";
		const first = this.nodeById.get(String(startEdge.target));
		if (first) this.visit(first, 0);
		return this.code;
	}

	private findStartEdge(): Edge | undefined {
		return (
			this.edges.find((edge) => String(edge.source) === START_EDGE_SOURCE_ID) ??
			this.edges.find((edge) => {
				const source = this.nodeById.get(String(edge.source));
				return source?.type === "start" || source?.type === "initial";
			})
		);
	}

	// ── Core traversal ─────────────────────────────────────────────────────

	/**
	 * Dispatch order:
	 *
	 *   1. Skip / loop guards (suppressed nodes, recursion limits, etc.)
	 *   2. data.construct — the canonical "what does this node represent"
	 *      tag. Set by the parser, set by the playground UI; covers
	 *      every control-flow construct we know how to emit.
	 *   3. node.type fallback — for nodes that don't carry a construct
	 *      (typically plain action statements, merges, starts, ends).
	 *
	 * No more "is this a try? let me look at the outgoing edge labels"
	 * heuristic. No more "is this a switch? let me count case labels".
	 * The parser tells us, the UI tells us, we just read the field.
	 */
	private visit(node: Node, level: number, stopAt?: string, localVisited: Set<string> = new Set()): void {
		this.depth += 1;
		if (this.depth > this.maxDepth) {
			this.code += `${indent(level)}// recursion limit\n`;
			this.depth -= 1;
			return;
		}

		try {
			const id = String(node.id);

			if (this.suppressed.has(id)) {
				this.continueFrom(id, level, stopAt, localVisited);
				return;
			}

			const ctxKey = `${id}|${stopAt ?? "root"}`;
			const visits = (this.visitCount.get(ctxKey) ?? 0) + 1;
			this.visitCount.set(ctxKey, visits);
			if (visits > this.maxVisitsPerContext) {
				this.code += `${indent(level)}// repeated visit guard\n`;
				return;
			}

			if (stopAt && id === stopAt) return;
			if (node.type === "end") return;

			if (localVisited.has(id)) {
				this.code += `${indent(level)}// loop detected at ${id}\n`;
				return;
			}
			localVisited.add(id);

			const construct = getConstruct(node);

			// 1) Construct-driven dispatch — single source of truth.
			if (construct) {
				switch (construct) {
					case "try":
						this.emitTry(node, id, level, stopAt, localVisited);
						return;
					case "switch":
						this.emitSwitch(node, id, level, stopAt, localVisited);
						return;
					case "if":
						this.emitIf(node, id, level, stopAt, localVisited);
						return;
					case "while":
					case "do-while":
					case "for":
					case "for-of":
					case "for-in":
					case "foreach":
						this.emitLoop(node, id, construct, level, stopAt, localVisited);
						return;
					case "function":
					case "hook":
						this.emitExpandable(node, id, level, stopAt, localVisited);
						return;
					case "return":
					case "throw":
					case "break":
					case "continue":
						this.emitTerminatingAction(node, level);
						return;
				}
			}

			// 2) Type-based fallback — unmarked nodes still need to do
			//    something sensible.
			switch (node.type) {
				case "merge":
				case "initial":
				case "start":
					this.continueFrom(id, level, stopAt, localVisited);
					return;
				case "expandable":
					this.emitExpandable(node, id, level, stopAt, localVisited);
					return;
				case "decision":
					// Untagged decision → assume `if`.
					this.emitIf(node, id, level, stopAt, localVisited);
					return;
				case "loop":
					// Untagged loop → assume `while`.
					this.emitLoop(node, id, "while", level, stopAt, localVisited);
					return;
				case "action":
				default:
					this.emitAction(node, id, level, stopAt, localVisited);
					return;
			}
		} finally {
			this.depth -= 1;
		}
	}

	private continueFrom(id: string, level: number, stopAt: string | undefined, localVisited: Set<string>): void {
		const nextId = getPrimaryNext(this.edges, id);
		if (!nextId || nextId === stopAt) return;
		const nextNode = this.nodeById.get(nextId);
		if (nextNode) this.visit(nextNode, level, stopAt, localVisited);
	}

	private continueAfter(joinId: string | null | undefined, level: number, stopAt: string | undefined, localVisited: Set<string>): void {
		if (!joinId) return;
		if (stopAt && joinId === stopAt) return;
		const nextId = getPrimaryNext(this.edges, joinId);
		if (!nextId) return;
		const nextNode = this.nodeById.get(nextId);
		if (nextNode) this.visit(nextNode, level, stopAt, new Set(localVisited));
	}

	// ── Snippet writer ─────────────────────────────────────────────────────

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
			if (line.trim().length === 0) {
				this.code += "\n";
			} else {
				this.code += `${indent(level)}${line.slice(minIndent)}\n`;
			}
		}
	}

	// ── Expandable (function / hook) ───────────────────────────────────────

	private emitExpandable(node: Node, id: string, level: number, stopAt: string | undefined, localVisited: Set<string>): void {
		const data = getData(node);
		const sourceText = getStr(data.sourceText);
		if (sourceText.trim()) {
			this.writeSnippet(sourceText, level);
		}
		this.continueFrom(id, level, stopAt, localVisited);
	}

	// ── Action ─────────────────────────────────────────────────────────────

	private emitAction(node: Node, id: string, level: number, stopAt: string | undefined, localVisited: Set<string>): void {
		const data = getData(node);
		const label = getStr(data.label).trim();
		const sourceText = getStr(data.sourceText);
		const text = sourceText.trim() || sanitizeStatement(label);

		if (text.includes("\n")) {
			this.writeSnippet(text, level);
		} else if (text) {
			this.code += `${indent(level)}${text}\n`;
		}

		// Even untagged actions can be terminating — e.g. legacy diagrams
		// where construct wasn't set. Fallback regex keeps those working.
		if (this.terminatesByText(text)) return;

		this.continueFrom(id, level, stopAt, localVisited);
	}

	/**
	 * Emit a terminating action (return / throw / break / continue) and
	 * stop traversal. The construct tag tells us we terminate; we don't
	 * need to look at the text to find out.
	 */
	private emitTerminatingAction(node: Node, level: number): void {
		const data = getData(node);
		const text = getStr(data.sourceText).trim() || sanitizeStatement(getStr(data.label).trim());
		if (text.includes("\n")) {
			this.writeSnippet(text, level);
		} else if (text) {
			this.code += `${indent(level)}${text}\n`;
		}
	}

	/** Fallback for actions without an explicit terminating construct. */
	private terminatesByText(statement: string): boolean {
		const s = statement.trim();
		return /^return\b/.test(s) || /^throw\b/.test(s) || /^break\b/.test(s) || /^continue\b/.test(s);
	}

	// ── Try / catch ────────────────────────────────────────────────────────

	private isExceptionEdgeLabel(label: unknown): boolean {
		const n = normalize(label);
		return n === "exception" || n === "catch" || n === "error";
	}

	/**
	 * Emit a try/catch[/finally] from a `construct: 'try'` decision node.
	 *
	 * The decision has two outgoing edges: an unlabeled (or `try`) edge
	 * to the try body, and an `exception` edge to the catch body. We
	 * walk both into a join, suppress the subgraph so it isn't visited
	 * again as part of the outer flow, then continue past the join.
	 */
	private emitTry(node: Node, id: string, level: number, stopAt: string | undefined, localVisited: Set<string>): void {
		const outgoing = getOutgoingEdges(this.edges, id);
		const exceptionEdge = outgoing.find((e) => this.isExceptionEdgeLabel(e.label));
		const successEdge = outgoing.find((e) => !this.isExceptionEdgeLabel(e.label));

		const successTarget = successEdge ? String(successEdge.target) : undefined;
		const exceptionTarget = exceptionEdge ? String(exceptionEdge.target) : undefined;
		const joinId = findJoinNode(this.edges, this.nodeById, successTarget, exceptionTarget);

		this.code += `${indent(level)}try {\n`;
		if (successTarget) {
			const tryNode = this.nodeById.get(successTarget);
			if (tryNode) this.visit(tryNode, level + 1, joinId ?? undefined, new Set());
		}
		this.code += `${indent(level)}} catch (err) {\n`;
		if (exceptionTarget) {
			const catchNode = this.nodeById.get(exceptionTarget);
			if (catchNode) this.visit(catchNode, level + 1, joinId ?? undefined, new Set());
		}
		this.code += `${indent(level)}}\n`;

		this.continueAfter(joinId, level, stopAt, localVisited);
	}

	// ── If ─────────────────────────────────────────────────────────────────

	private emitIf(node: Node, id: string, level: number, stopAt: string | undefined, localVisited: Set<string>): void {
		const outgoing = getOutgoingEdges(this.edges, id);
		if (outgoing.length === 0) return;

		const data = getData(node);
		const condition = (getStr(data.sourceText).trim() || getStr(data.label).trim() || "condition");

		const yesEdge = this.pickEdge(outgoing, ["yes", "next"]);
		const noEdge = this.pickEdge(outgoing, ["no", "done"])
			?? outgoing.find((e) => e !== yesEdge);

		const yesTarget = yesEdge ? String(yesEdge.target) : undefined;
		const noTarget = noEdge ? String(noEdge.target) : undefined;
		const joinId = findJoinNode(this.edges, this.nodeById, yesTarget, noTarget);

		this.code += `${indent(level)}if (${condition}) {\n`;

		if (yesEdge) {
			const yesNode = this.nodeById.get(String(yesEdge.target));
			if (yesNode) this.visit(yesNode, level + 1, joinId ?? undefined, new Set());
		}

		if (noEdge && noTarget !== (joinId ?? "")) {
			this.code += `${indent(level)}} else {\n`;
			const noNode = this.nodeById.get(String(noEdge.target));
			if (noNode) this.visit(noNode, level + 1, joinId ?? undefined, new Set());
		}

		this.code += `${indent(level)}}\n`;

		this.continueAfter(joinId, level, stopAt, localVisited);
	}

	// ── Switch ─────────────────────────────────────────────────────────────

	/**
	 * Parse one outgoing edge's label into one or more case headers.
	 *
	 *   "case 1"                  → ["case 1:"]
	 *   "case 1, 2"               → ["case 1:", "case 2:"]
	 *   "case 1, 2, default"      → ["case 1:", "case 2:", "default:"]
	 *   "default"                 → ["default:"]
	 *
	 * Bare comma-separated values after the first one are interpreted as
	 * additional case labels in the same group (the source had `case 1:
	 * case 2:` etc. sharing a body).
	 */
	private parseSwitchLabels(rawLabel: unknown): string[] {
		const text = stringifyLabel(rawLabel).trim();
		if (!text) return [];

		const parts = text.split(',').map((p) => p.trim()).filter(Boolean);
		if (parts.length === 0) return [];

		return parts.map((part, index) => {
			const lower = part.toLowerCase();
			if (lower === 'default' || lower === 'default:') return 'default:';

			let header: string;
			if (index === 0) {
				header = part.startsWith('case ') ? part : `case ${part}`;
			} else {
				header = `case ${part}`;
			}
			return header.endsWith(':') ? header : `${header}:`;
		});
	}

	private emitSwitch(node: Node, id: string, level: number, stopAt: string | undefined, localVisited: Set<string>): void {
		const data = getData(node);
		const expr = (getStr(data.sourceText).trim() || getStr(data.label).trim() || "value");

		const outgoing = getOutgoingEdges(this.edges, id);
		const caseEdges = outgoing.filter((e) => this.parseSwitchLabels(e.label).length > 0);
		const caseTargets = caseEdges.map((e) => String(e.target));
		const joinId = findJoinNodeForBranches(this.edges, this.nodeById, caseTargets);

		this.code += `${indent(level)}switch (${expr}) {\n`;

		const caseEntries = caseEdges.map((e) => String(e.target));

		for (let i = 0; i < caseEdges.length; i += 1) {
			const caseEdge = caseEdges[i];
			const caseHeaders = this.parseSwitchLabels(caseEdge.label);
			for (const header of caseHeaders) {
				this.code += `${indent(level + 1)}${header}\n`;
			}

			const nextEntry = caseEntries[i + 1];
			const caseStopAt = nextEntry ?? joinId ?? undefined;

			const target = this.nodeById.get(String(caseEdge.target));
			if (target) {
				this.visit(target, level + 2, caseStopAt, new Set());
			}
		}

		this.code += `${indent(level)}}\n`;

		this.continueAfter(joinId, level, stopAt, localVisited);
	}

	// ── Loops ──────────────────────────────────────────────────────────────

	/**
	 * Loop emission contract:
	 *
	 *   - The loop NODE carries metadata (construct, plus type-specific
	 *     fields like forHeader / forOfBinding / forEachIterable). It
	 *     NEVER carries the body. The body lives in the graph as ordinary
	 *     action / decision / loop nodes connected by a `yes` / `each`
	 *     edge from the loop, with a back-edge to the loop.
	 *
	 *   - This dispatcher reads `construct` and reconstructs the
	 *     appropriate syntax. The body is always traversed via
	 *     emitLoopBody.
	 */
	private emitLoop(node: Node, id: string, construct: Construct, level: number, stopAt: string | undefined, localVisited: Set<string>): void {
		if (this.activeLoopHeaders.has(id)) return;
		this.activeLoopHeaders.add(id);

		try {
			const data = getData(node);
			const sourceText = getStr(data.sourceText).trim();
			const label = getStr(data.label).trim();

			const outgoing = getOutgoingEdges(this.edges, id);
			const bodyEdge = this.pickEdge(outgoing, ["yes", "each", "body", "next"]);
			const exitEdge = this.pickEdge(outgoing, ["no", "done", "exit"])
				?? outgoing.find((e) => String(e.target) !== String(bodyEdge?.target));

			switch (construct) {
				case "foreach":
					this.emitForEach(data, id, level, bodyEdge);
					break;
				case "for":
					this.emitFor(id, getStr(data.forHeader).trim() || sourceText || label, level, bodyEdge);
					break;
				case "for-of":
					this.emitForOfIn(getStr(data.forOfBinding), sourceText, "of", id, level, bodyEdge);
					break;
				case "for-in":
					this.emitForOfIn(getStr(data.forOfBinding), sourceText, "in", id, level, bodyEdge);
					break;
				case "do-while":
					this.emitDoWhile(id, sourceText || label, level, bodyEdge);
					break;
				case "while":
				default:
					this.emitWhile(id, sourceText || label, level, bodyEdge);
					break;
			}

			if (exitEdge) {
				const exitNode = this.nodeById.get(String(exitEdge.target));
				if (exitNode) this.visit(exitNode, level, stopAt, new Set(localVisited));
			}
		} finally {
			this.activeLoopHeaders.delete(id);
		}
	}

	private emitForEach(data: AnyNodeData, loopId: string, level: number, bodyEdge: Edge | undefined): void {
		const iterable = getStr(data.forEachIterable).trim() || getStr(data.sourceText).trim() || "items";
		const callee = getStr(data.forEachCallee).trim() || "forEach";
		const params = getStr(data.forEachParams).trim() || "(item)";

		this.code += `${indent(level)}${iterable}.${callee}(${params} => {\n`;
		this.emitLoopBody(bodyEdge, level + 1, loopId);
		this.code += `${indent(level)}});\n`;
	}

	private emitWhile(id: string, condition: string, level: number, bodyEdge: Edge | undefined): void {
		const cond = condition.trim() || "true";
		this.code += `${indent(level)}while (${cond}) {\n`;
		this.emitLoopBody(bodyEdge, level + 1, id);
		this.code += `${indent(level)}}\n`;
	}

	private emitDoWhile(id: string, condition: string, level: number, bodyEdge: Edge | undefined): void {
		const cond = condition.trim() || "true";
		this.code += `${indent(level)}do {\n`;
		this.emitLoopBody(bodyEdge, level + 1, id);
		this.code += `${indent(level)}} while (${cond});\n`;
	}

	private emitFor(id: string, header: string, level: number, bodyEdge: Edge | undefined): void {
		const headerText = header.trim() || ";;";
		this.code += `${indent(level)}for (${headerText}) {\n`;
		this.emitLoopBody(bodyEdge, level + 1, id);
		this.code += `${indent(level)}}\n`;
	}

	private emitForOfIn(
		binding: string,
		iterable: string,
		keyword: "of" | "in",
		loopId: string,
		level: number,
		bodyEdge: Edge | undefined,
	): void {
		const bindingText = binding.trim() || (keyword === "of" ? "const item" : "const key");
		const iterableText = iterable.trim() || "items";
		const header = `${bindingText} ${keyword} ${iterableText}`;

		this.code += `${indent(level)}for (${header}) {\n`;
		this.emitLoopBody(bodyEdge, level + 1, loopId);
		this.code += `${indent(level)}}\n`;
	}

	private emitLoopBody(bodyEdge: Edge | undefined, level: number, stopAt: string): void {
		if (!bodyEdge) return;
		const bodyNode = this.nodeById.get(String(bodyEdge.target));
		if (bodyNode) this.visit(bodyNode, level, stopAt, new Set());
	}

	// ── Edge picking ───────────────────────────────────────────────────────

	private pickEdge(outgoing: Edge[], preferredLabels: string[]): Edge | undefined {
		const labeled = findLabeledEdge(outgoing, preferredLabels);
		if (labeled) return labeled;
		return undefined;
	}
}