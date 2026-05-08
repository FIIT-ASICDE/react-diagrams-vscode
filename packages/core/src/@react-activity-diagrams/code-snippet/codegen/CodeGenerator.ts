import { type Node, type Edge } from "@xyflow/react";
import { type FuncArg } from "../shared/types";
import { indent, normalize, stringifyLabel } from "../shared/string-utils";
import { formatFunctionHeader, looksAsync } from "../graph/node-utils";
import { getOutgoingEdges } from "../graph/traversal";
import type { Construct } from "../shared/construct";

import {
	type Outcome,
	type EmitResult,
	type DoWhileRegion,
	FALL,
	RETURN,
	chooseDominant,
} from "./Types";
import {
	actionText,
	extractLabel,
	fallthroughSuccessor,
	getConstruct,
	getData,
	getStr,
	isBackEdge,
	isExceptionEdge,
	outgoingForwardEdges,
	pickEdge,
	sniffTerminator,
} from "./Helpers";
import { BranchResolver } from "./Branch-resolver";
import { TryResolver } from "./try-resolver";


export class CodeGenerator {
	private readonly nodeById: Map<string, Node>;
	private readonly asyncMode: boolean;
	private readonly branches: BranchResolver;
	private readonly tryRes: TryResolver;

	private code = "";

	
	private readonly activeLoops = new Set<string>();
	private readonly activeTryEntries = new Set<string>();
	private readonly activeDoWhileLoops = new Set<string>();

	
	private breakDepth = 0;

	private readonly maxDepth = 1500;
	private depth = 0;

	constructor(
		private readonly nodes: Node[],
		private readonly edges: Edge[],
	) {
		this.nodeById = new Map(nodes.map((n) => [String(n.id), n]));
		this.asyncMode = looksAsync(nodes);
		this.branches = new BranchResolver(
			this.nodeById,
			this.edges,
			this.activeLoops,
		);
		this.tryRes = new TryResolver(this.nodeById, this.edges, this.branches);
	}

	

	// Generates value.
	generate(funcName: string, funcArgs: FuncArg[]): string {
		const startEdge = this.findStartEdge();
		if (!startEdge) {
			return (
				formatFunctionHeader(funcName, funcArgs, this.asyncMode) +
				"  // Build a diagram and click Convert.\n}"
			);
		}
		this.code = formatFunctionHeader(funcName, funcArgs, this.asyncMode);
		this.emitSequence(String(startEdge.target), 1, undefined);
		this.code += "}";
		return this.code;
	}

	// Generates body only.
	generateBodyOnly(): string {
		const startEdge = this.findStartEdge();
		if (!startEdge) return "";
		this.code = "";
		this.emitSequence(String(startEdge.target), 0, undefined);
		return this.code;
	}

	

	
	// Handles emit sequence.
	private emitSequence(
		startId: string,
		level: number,
		stopAt: string | ReadonlySet<string> | undefined,
		allowFinallyFlow = false,
	): Outcome {
		const localSeen = new Set<string>();
		let cursor: string | undefined = startId;

		while (cursor !== undefined) {
			if (this.isStop(stopAt, cursor)) return FALL;
			if (!allowFinallyFlow && this.isFinallyFlowNode(cursor)) return FALL;
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
					this.code += `${indent(level)}`
					return FALL;
				}
				({ outcome, next } = this.emitNode(node, level));
			} finally {
				this.depth -= 1;
			}

			if (outcome.kind !== "fall") {
				
				if (outcome.kind === "break" && !outcome.label && !this.canBreak()) {
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

	private isStop(stopAt: string | ReadonlySet<string> | undefined, cursor: string): boolean {
		if (stopAt === undefined) return false;
		if (typeof stopAt === "string") return cursor === stopAt;
		return stopAt.has(cursor);
	}

	

	private emitNode(node: Node, level: number): EmitResult {
		const id = String(node.id);
		const construct = getConstruct(node);

		
		const doWhileRegion = this.findDoWhileForBodyEntry(id);
		if (
			doWhileRegion &&
			!this.activeDoWhileLoops.has(doWhileRegion.loopId) &&
			!this.activeLoops.has(doWhileRegion.loopId)
		) {
			return this.emitDoWhile(doWhileRegion, level);
		}

		
		if (!this.activeTryEntries.has(id) && this.isTryEntryNode(id)) {
			return this.emitTryFromEntry(id, level);
		}

		if (construct) {
			switch (construct) {
				case "if":       return this.emitIf(node, level);
				case "switch":   return this.emitSwitch(node, level);
				case "try":      return this.emitTry(node, level);
				case "while":
				case "for":
				case "for-of":
				case "for-in":
				case "foreach":  return this.emitLoop(node, construct, level);
				case "do-while": return this.doWhileFallResult(id);
				case "function":
				case "hook":
					this.emitInlineSnippet(node, level);
					return { outcome: FALL, next: fallthroughSuccessor(this.edges, id) };
				case "pending-return":
					this.writeStatement(
						getStr(getData(node).pendingReturnSourceText).trim() || "return;",
						level,
					);
					return { outcome: RETURN, next: undefined };
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
				return { outcome: FALL, next: fallthroughSuccessor(this.edges, id) };
			case "expandable":
				this.emitInlineSnippet(node, level);
				return { outcome: FALL, next: fallthroughSuccessor(this.edges, id) };
			case "decision":
				return this.emitIf(node, level);
			case "loop": {
				const legacyKind = (getStr(getData(node).loopKind) || "while") as Construct;
				return legacyKind === "do-while"
					? this.doWhileFallResult(id)
					: this.emitLoop(node, legacyKind, level);
			}
			default:
				return this.emitAction(node, level);
		}
	}

	

	private emitAction(node: Node, level: number): EmitResult {
		const text = actionText(node);
		this.writeStatement(text, level);

		const sniffed = getConstruct(node) ? undefined : sniffTerminator(text);
		if (sniffed) {
			if (sniffed.kind === "break" && !sniffed.label && !this.canBreak()) {
				return { outcome: FALL, next: fallthroughSuccessor(this.edges, String(node.id)) };
			}
			if (sniffed.kind === "continue" && !sniffed.label && !this.isInLoop()) {
				return { outcome: FALL, next: fallthroughSuccessor(this.edges, String(node.id)) };
			}
			return { outcome: sniffed, next: undefined };
		}

		return { outcome: FALL, next: fallthroughSuccessor(this.edges, String(node.id)) };
	}

	private emitInlineSnippet(node: Node, level: number): void {
		const text = getStr(getData(node).sourceText);
		if (text.trim()) this.writeSnippet(text, level);
	}

	private emitTerminator(node: Node, construct: Construct, level: number): EmitResult {
		const text = actionText(node);

		switch (construct) {
			case "return":
			case "throw":
				this.writeStatement(text, level);
				return { outcome: RETURN, next: undefined };

			case "break": {
				const label = extractLabel(text, "break");
				if (!label && !this.canBreak()) {
					return { outcome: FALL, next: fallthroughSuccessor(this.edges, String(node.id)) };
				}
				this.writeStatement(text, level);
				return { outcome: { kind: "break", label }, next: undefined };
			}

			case "continue": {
				const label = extractLabel(text, "continue");
				if (!label && !this.isInLoop()) {
					return { outcome: FALL, next: fallthroughSuccessor(this.edges, String(node.id)) };
				}
				this.writeStatement(text, level);
				return { outcome: { kind: "continue", label }, next: undefined };
			}
		}

		return { outcome: FALL, next: undefined };
	}

	

	private emitIf(node: Node, level: number): EmitResult {
		const id = String(node.id);
		const data = getData(node);
		const condition =
			getStr(data.sourceText).trim() || getStr(data.label).trim() || "condition";

		const outgoing = outgoingForwardEdges(this.edges, id);
		const yesEdge = pickEdge(outgoing, ["yes", "true"]);
		const noEdge =
			pickEdge(outgoing, ["no", "false", "done"]) ??
			outgoing.find((e) => e !== yesEdge);

		const yesTarget = yesEdge ? String(yesEdge.target) : undefined;
		const noTarget = noEdge ? String(noEdge.target) : undefined;

		if (yesTarget && yesTarget === noTarget) {
			return { outcome: FALL, next: yesTarget };
		}

		const joinId =
			yesTarget && noTarget
				? this.branches.findBranchJoin(yesTarget, noTarget)
				: undefined;

		const hasElse = Boolean(yesTarget && noTarget && yesTarget !== noTarget && joinId);

		this.code += `${indent(level)}if (${condition}) {\n`;

		let yesOutcome: Outcome = FALL;
		let noOutcome: Outcome = FALL;

		if (yesTarget) {
			yesOutcome = this.emitSequence(yesTarget, level + 1, hasElse ? joinId : noTarget);
		}

		if (hasElse && noTarget) {
			this.code += `${indent(level)}} else {\n`;
			noOutcome = this.emitSequence(noTarget, level + 1, joinId);
		}

		this.code += `${indent(level)}}\n`;

		if (hasElse && yesOutcome.kind !== "fall" && noOutcome.kind !== "fall") {
			return { outcome: chooseDominant(yesOutcome, noOutcome), next: undefined };
		}

		return {
			outcome: FALL,
			next: joinId ? fallthroughSuccessor(this.edges, joinId) : noTarget,
		};
	}

	// ── Switch ───────────────────────────────────────────────────────────────

	private emitSwitch(node: Node, level: number): EmitResult {
		const id = String(node.id);
		const data = getData(node);
		const expr =
			getStr(data.sourceText).trim() || getStr(data.label).trim() || "value";

		const outgoing = outgoingForwardEdges(this.edges, id);
		const caseEdges = outgoing.filter((e) => this.parseSwitchLabels(e.label).length > 0);

		const caseTargets = caseEdges.map((e) => String(e.target));
		const afterSwitch = this.branches.findExitSwitchTarget(caseTargets);

		this.code += `${indent(level)}switch (${expr}) {\n`;
		this.breakDepth += 1;

		const outcomes: Outcome[] = [];

		try {
			for (let i = 0; i < caseEdges.length; i++) {
				const headers = this.parseSwitchLabels(caseEdges[i].label);
				for (const header of headers) {
					this.code += `${indent(level + 1)}${header}\n`;
				}

				const isDefault = headers.some((h) => h === "default:");
				let outcome = this.emitSequence(caseTargets[i], level + 2, afterSwitch);

				if (outcome.kind === "break" && !outcome.label) outcome = FALL;

				if (!isDefault && !this.lastMeaningfulLineTerminates(level + 2)) {
					this.code += `${indent(level + 2)}break;\n`;
				}

				outcomes.push(outcome);
			}
		} finally {
			this.breakDepth -= 1;
		}

		this.code += `${indent(level)}}\n`;

		const allDiverge = outcomes.length > 0 && outcomes.every((o) => o.kind !== "fall");
		if (allDiverge) {
			const nonFallOutcomes = outcomes as Exclude<Outcome, { kind: "fall" }>[];
			let dominant = nonFallOutcomes[0];
			for (let i = 1; i < nonFallOutcomes.length; i += 1) {
				dominant = chooseDominant(
					dominant,
					nonFallOutcomes[i],
				) as Exclude<Outcome, { kind: "fall" }>;
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
		const parts = text
			.split(",")
			.map((p) => p.trim())
			.filter(Boolean);
		if (parts.length === 0) return [];
		const first = parts[0].toLowerCase();
		if (!first.startsWith("case ") && first !== "default" && first !== "default:") return [];
		return parts.map((part, i) => {
			const lower = part.toLowerCase();
			if (lower === "default" || lower === "default:") return "default:";
			const header =
				i === 0 && part.startsWith("case ") ? part : `case ${part}`;
			return header.endsWith(":") ? header : `${header}:`;
		});
	}

	/** True if the last meaningful line at `level` is a control-flow terminator. */
	private lastMeaningfulLineTerminates(level: number): boolean {
		const expectedIndent = indent(level);
		const lines = this.code.split(/\r?\n/).filter((l) => l.trim().length > 0);

		for (let i = lines.length - 1; i >= 0; i--) {
			const line = lines[i];
			const trimmed = line.trim();

			if (/^(case\b|default:)/.test(trimmed)) return false;
			if (!line.startsWith(expectedIndent)) continue;
			if (/^\s/.test(line.slice(expectedIndent.length))) continue;

			return (
				/^return\b/.test(trimmed) ||
				/^throw\b/.test(trimmed) ||
				/^break\b/.test(trimmed) ||
				/^continue\b/.test(trimmed)
			);
		}

		return false;
	}

	// ── Loops ────────────────────────────────────────────────────────────────

	private doWhileFallResult(id: string): EmitResult {
		return {
			outcome: FALL,
			next: this.doWhileExitTarget(id) ?? fallthroughSuccessor(this.edges, id),
		};
	}

	private emitDoWhile(region: DoWhileRegion, level: number): EmitResult {
		if (this.activeDoWhileLoops.has(region.loopId)) {
			return { outcome: FALL, next: undefined };
		}

		this.code += `${indent(level)}do {\n`;
		this.activeDoWhileLoops.add(region.loopId);
		this.activeLoops.add(region.loopId);
		this.breakDepth += 1;

		let bodyOutcome: Outcome = FALL;
		try {
			bodyOutcome = this.emitSequence(region.bodyEntryId, level + 1, region.loopId);
		} finally {
			this.breakDepth -= 1;
			this.activeLoops.delete(region.loopId);
			this.activeDoWhileLoops.delete(region.loopId);
		}

		this.code += `${indent(level)}} while (${region.conditionText});\n`;

		const propagated = this.translateLoopBodyOutcome(bodyOutcome, "");
		if (propagated.kind !== "fall") return { outcome: propagated, next: undefined };

		return { outcome: FALL, next: region.exitId };
	}

	private emitLoop(node: Node, construct: Construct, level: number): EmitResult {
		const id = String(node.id);

		if (construct === "do-while") return this.doWhileFallResult(id);
		if (this.activeLoops.has(id)) return { outcome: FALL, next: undefined };

		const data = getData(node);
		const sourceText = getStr(data.sourceText).trim();
		const label = getStr(data.label).trim();
		const loopLabel = getStr(data.loopLabel).trim();

		const outgoing = outgoingForwardEdges(this.edges, id);
		const bodyEdge = pickEdge(outgoing, ["yes", "each", "true", "body", "next"]);
		const exitEdge =
			pickEdge(outgoing, ["no", "false", "done", "exit"]) ??
			outgoing.find((e) => String(e.target) !== String(bodyEdge?.target));

		const bodyTarget = bodyEdge ? String(bodyEdge.target) : undefined;
		const exitTarget = exitEdge ? String(exitEdge.target) : undefined;

		if (loopLabel) this.code += `${indent(level)}${loopLabel}:\n`;

		const header = this.formatLoopHeader(construct, data, sourceText, label);
		this.code += `${indent(level)}${header.open} {\n`;

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
		data: ReturnType<typeof getData>,
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
				const binding =
					getStr(data.forOfBinding).trim() ||
					(keyword === "of" ? "const item" : "const key");
				const iterable = sourceText || "items";
				return { open: `for (${binding} ${keyword} ${iterable})`, close: `}` };
			}
			case "do-while": {
				const cond = sourceText || label || "true";
				return { open: `do`, close: `} while (${cond});` };
			}
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

	// ── Try / catch / finally ─────────────────────────────────────────────────

	private emitTry(node: Node, level: number): EmitResult {
		const id = String(node.id);
		const allOutgoing = getOutgoingEdges(this.edges, id).filter((e) => !isBackEdge(e));

		const catchEdge = [...allOutgoing].reverse().find((e) => isExceptionEdge(e.label));
		const finallyEdge = [...allOutgoing]
			.reverse()
			.find((e) => normalize(e.label) === "finally");
		const tryBodyEdge = allOutgoing.find(
			(e) => !isExceptionEdge(e.label) && normalize(e.label) !== "finally",
		);

		const tryBodyTarget = tryBodyEdge ? String(tryBodyEdge.target) : undefined;
		const catchTarget = catchEdge ? String(catchEdge.target) : undefined;
		const explicitFinallyTarget = finallyEdge ? String(finallyEdge.target) : undefined;
		const finallyEntries = this.collectFinallyEntriesForTry(id, [tryBodyTarget, catchTarget]);
		const finallyTarget = this.pickCanonicalFinallyEntry(
			id,
			finallyEntries,
			explicitFinallyTarget,
		);

		const afterTry = this.tryRes.findTryAfterTarget(
			id,
			tryBodyTarget,
			catchTarget,
			finallyTarget,
		);
		const afterFinally = this.tryRes.resolveAfterFinallyTarget(finallyTarget, afterTry);
		const branchStop = this.makeStopSet([...finallyEntries, afterTry]);
		const finallyStop = this.makeStopSet([
			afterFinally,
			...finallyEntries.filter((entry) => entry !== finallyTarget),
		]);

		return this.emitTryBlock({
			level,
			tryOwnerId: id,
			tryBodyEmit: (stopAt) =>
				tryBodyTarget
					? this.emitSequence(tryBodyTarget, level + 1, stopAt)
					: FALL,
			catchTarget,
			finallyTarget,
			afterFinally,
			tryStop: branchStop,
			catchStop: branchStop,
			finallyStop,
		});
	}

	private emitTryFromEntry(tryEntryId: string, level: number): EmitResult {
		const catchTarget = this.tryRes.findCatchTargetFromTryEntry(tryEntryId);
		const finallyCandidateInfo = this.tryRes.collectFinallyCandidates(
			tryEntryId,
			[tryEntryId, catchTarget],
			undefined,
		);
		const finallyEntries = this.collectFinallyEntriesForTry(tryEntryId, [
			tryEntryId,
			catchTarget,
		]);
		const boundaryFinallyTarget = this.findBoundaryFinallyEntry(tryEntryId, [
			tryEntryId,
			catchTarget,
		]);
		const shouldIncludeBoundaryFinally =
			finallyEntries.length === 0 ||
			finallyEntries.every((entry) => this.isAbruptFinallyEntry(entry));
		if (
			boundaryFinallyTarget &&
			shouldIncludeBoundaryFinally &&
			!finallyEntries.includes(boundaryFinallyTarget)
		) {
			finallyEntries.push(boundaryFinallyTarget);
		}
		const preferredFinallyTarget =
			boundaryFinallyTarget ?? finallyCandidateInfo.selected;
		const finallyTarget = this.pickCanonicalFinallyEntry(
			tryEntryId,
			finallyEntries,
			preferredFinallyTarget,
		);
		const tryBoundary = this.tryRes.findTryAfterTargetFromEntry(
			tryEntryId,
			catchTarget,
			finallyTarget,
		);
		const afterFinally = this.tryRes.resolveAfterFinallyTarget(finallyTarget, tryBoundary);
		const tryStop = this.makeStopSet([catchTarget, ...finallyEntries, tryBoundary]);
		const catchStop = this.makeStopSet([...finallyEntries, tryBoundary]);
		const finallyStop = this.makeStopSet([
			afterFinally,
			...finallyEntries.filter((entry) => entry !== finallyTarget),
		]);

		return this.emitTryBlock({
			level,
			tryOwnerId: tryEntryId,
			tryBodyEmit: (stopAt) => {
				this.activeTryEntries.add(tryEntryId);
				try {
					return this.emitSequence(tryEntryId, level + 1, stopAt);
				} finally {
					this.activeTryEntries.delete(tryEntryId);
				}
			},
			catchTarget,
			finallyTarget,
			afterFinally,
			tryStop,
			catchStop,
			finallyStop,
		});
	}

	/**
	 * Shared try-block emitter used by both `emitTry` and `emitTryFromEntry`.
	 * Accepts a callback for the try-body so the caller controls what gets emitted.
	 */
	private emitTryBlock(opts: {
		level: number;
		tryOwnerId: string;
		tryBodyEmit: (stopAt: string | ReadonlySet<string> | undefined) => Outcome;
		catchTarget: string | undefined;
		finallyTarget: string | undefined;
		afterFinally: string | undefined;
		tryStop: string | ReadonlySet<string> | undefined;
		catchStop: string | ReadonlySet<string> | undefined;
		finallyStop: string | ReadonlySet<string> | undefined;
	}): EmitResult {
		const {
			level,
			catchTarget,
			finallyTarget,
			afterFinally,
			tryStop,
			catchStop,
			finallyStop,
		} = opts;

		this.code += `${indent(level)}try {\n`;
		const tryOutcome = opts.tryBodyEmit(tryStop);
		this.code += `${indent(level)}}`;

		let catchOutcome: Outcome = FALL;
		const useFallbackCatch = !catchTarget && !finallyTarget;

		if (catchTarget) {
			this.code += ` catch (e) {\n`;
			catchOutcome = this.emitSequence(catchTarget, level + 1, catchStop);
			this.code += `${indent(level)}}`;
		} else if (useFallbackCatch) {
			this.code += ` catch (e) {\n`;
			this.code += `${indent(level + 1)}throw e;\n`;
			this.code += `${indent(level)}}`;
			catchOutcome = RETURN;
		}

		let finallyOutcome: Outcome = FALL;
		if (finallyTarget) {
			this.code += ` finally {\n`;
			finallyOutcome = this.emitSequence(finallyTarget, level + 1, finallyStop, true);
			this.code += `${indent(level)}}`;
		}

		this.code += `\n`;

		if (finallyOutcome.kind !== "fall") {
			return { outcome: finallyOutcome, next: undefined };
		}

		const hasCatch = catchTarget !== undefined;
		if (tryOutcome.kind !== "fall" && (!hasCatch || catchOutcome.kind !== "fall")) {
			return {
				outcome: hasCatch ? chooseDominant(tryOutcome, catchOutcome) : tryOutcome,
				next: undefined,
			};
		}

		return { outcome: FALL, next: afterFinally };
	}

	// ── do-while helpers ─────────────────────────────────────────────────────

	private doWhileExitTarget(loopId: string): string | undefined {
		const outgoing = outgoingForwardEdges(this.edges, loopId);
		const noEdge = pickEdge(outgoing, ["no", "false", "done", "exit"]);
		if (noEdge) return String(noEdge.target);

		const yesBackTarget = this.edges.find(
			(e) =>
				String(e.source) === loopId &&
				normalize(e.label) === "yes" &&
				isBackEdge(e),
		)?.target;

		const fallback = outgoing.find(
			(e) => String(e.target) !== String(yesBackTarget),
		);
		return fallback ? String(fallback.target) : undefined;
	}

	private findDoWhileForBodyEntry(bodyEntryId: string): DoWhileRegion | undefined {
		for (const node of this.nodes) {
			if (node.type !== "loop") continue;
			if (getConstruct(node) !== "do-while") continue;

			const loopId = String(node.id);
			const hasYesBackEdge = this.edges.some(
				(e) =>
					String(e.source) === loopId &&
					String(e.target) === bodyEntryId &&
					normalize(e.label) === "yes" &&
					isBackEdge(e),
			);
			if (!hasYesBackEdge) continue;

			const data = getData(node);
			const conditionText =
				getStr(data.sourceText).trim() || getStr(data.label).trim() || "true";

			return {
				loopId,
				bodyEntryId,
				conditionText,
				exitId: this.doWhileExitTarget(loopId),
			};
		}
		return undefined;
	}

	// ── Scope helpers ────────────────────────────────────────────────────────

	private isInLoop(): boolean { return this.activeLoops.size > 0; }
	private canBreak(): boolean { return this.breakDepth > 0; }

	// ── Try-entry detection ──────────────────────────────────────────────────

	private hasIncomingTryEdge(nodeId: string): boolean {
		return this.edges.some(
			(e) => !isBackEdge(e) && String(e.target) === nodeId && normalize(e.label) === "try",
		);
	}

	private isTryEntryNode(nodeId: string): boolean {
		if (this.hasIncomingTryEdge(nodeId)) return true;
		const node = this.nodeById.get(nodeId);
		if (node && getConstruct(node) === "try") return true;

		return this.nodes.some((candidate) => {
			const data = getData(candidate);
			return (
				data.role === "try-exit-boundary" &&
				String(data.tryOwner ?? "") === nodeId
			);
		});
	}

	private isFinallyFlowNode(nodeId: string): boolean {
		const node = this.nodeById.get(nodeId);
		if (!node) return false;

		if (getConstruct(node) === "pending-return") return false;

		return this.edges.some(
			(edge) =>
				!isBackEdge(edge) &&
				String(edge.target) === nodeId &&
				normalize(edge.label) === "finally",
		);
	}

	private collectFinallyEntriesForTry(
		tryOwnerId: string,
		starts: Array<string | undefined>,
	): string[] {
		const { allTargets } = this.tryRes.collectFinallyCandidates(
			tryOwnerId,
			starts,
			undefined,
		);
		return [...new Set(allTargets.filter(Boolean))];
	}

	private isAbruptFinallyEntry(entryId: string): boolean {
		const incomingFinallySources = this.edges
			.filter(
				(edge) =>
					!isBackEdge(edge) &&
					normalize(edge.label) === "finally" &&
					String(edge.target) === entryId,
			)
			.map((edge) => this.nodeById.get(String(edge.source)))
			.filter((node): node is Node => Boolean(node));

		if (incomingFinallySources.length === 0) return false;

		return incomingFinallySources.every((node) => {
			const construct = getConstruct(node);
			return (
				construct === "pending-return" ||
				construct === "return" ||
				construct === "break" ||
				construct === "continue" ||
				construct === "throw"
			);
		});
	}

	private pickCanonicalFinallyEntry(
		tryOwnerId: string,
		entries: string[],
		preferred?: string,
	): string | undefined {
		if (entries.length === 0) return undefined;

		const boundaryReachableEntries = entries.filter((id) =>
			this.canReachExitTryBoundary(id, tryOwnerId, entries),
		);
		const candidates =
			boundaryReachableEntries.length > 0 ? boundaryReachableEntries : entries;

		let bestId = candidates[0];
		let bestScore = this.finallyEntryScore(bestId, entries);

		for (let i = 1; i < candidates.length; i += 1) {
			const id = candidates[i];
			const score = this.finallyEntryScore(id, entries);
			if (score > bestScore) {
				bestId = id;
				bestScore = score;
			}
		}

		if (preferred && entries.includes(preferred)) {
			if (candidates.includes(preferred)) {
				return preferred;
			}
		}
		if (candidates.includes(bestId)) return bestId;

		for (const id of entries) {
			const node = this.nodeById.get(id);
			if (!node) continue;
			const data = getData(node);
			if (String(data.tryOwner ?? "") === tryOwnerId) return id;
		}

		return entries[0];
	}

	private finallyEntryScore(startId: string, allFinallyEntries: string[]): number {
		const blocked = new Set(allFinallyEntries.filter((id) => id !== startId));
		const queue: string[] = [startId];
		const visited = new Set<string>();
		let score = 0;

		while (queue.length > 0 && visited.size < 120) {
			const current = queue.shift()!;
			if (visited.has(current)) continue;
			visited.add(current);

			if (blocked.has(current)) continue;

			const node = this.nodeById.get(current);
			if (node) {
				const data = getData(node);
				if (
					getStr(data.sourceText).trim().length > 0 ||
					getStr(data.label).trim().length > 0 ||
					getConstruct(node) !== undefined
				) {
					score += 1;
				}
			}

			for (const edge of this.edges) {
				if (isBackEdge(edge) || isExceptionEdge(edge.label)) continue;
				if (String(edge.source) !== current) continue;
				queue.push(String(edge.target));
			}
		}

		return score;
	}

	private canReachExitTryBoundary(
		startId: string,
		tryOwnerId: string,
		blockedFinallyEntries: string[] = [],
	): boolean {
		const blocked = new Set(blockedFinallyEntries.filter((id) => id !== startId));
		const queue: string[] = [startId];
		const visited = new Set<string>();

		while (queue.length > 0 && visited.size < 120) {
			const current = queue.shift()!;
			if (visited.has(current)) continue;
			visited.add(current);

			if (blocked.has(current)) continue;

			const node = this.nodeById.get(current);
			if (node) {
				const data = getData(node);
				if (
					data.role === "try-exit-boundary" &&
					String(data.tryOwner ?? "") === tryOwnerId
				) {
					return true;
				}
			}

			for (const edge of this.edges) {
				if (isBackEdge(edge) || isExceptionEdge(edge.label)) continue;
				if (String(edge.source) !== current) continue;
				queue.push(String(edge.target));
			}
		}

		return false;
	}

	private makeStopSet(
		nodeIds: Array<string | undefined>,
	): string | ReadonlySet<string> | undefined {
		const unique = [...new Set(nodeIds.filter((id): id is string => Boolean(id)))];
		if (unique.length === 0) return undefined;
		if (unique.length === 1) return unique[0];
		return new Set(unique);
	}

	private findBoundaryFinallyEntry(
		tryOwnerId: string,
		starts: Array<string | undefined>,
	): string | undefined {
		const distances = new Map<string, number>();
		for (const start of starts) {
			if (!start) continue;
			const reachable = this.branches.collectReachableDistances(start, 120);
			for (const [nodeId, dist] of reachable.entries()) {
				const current = distances.get(nodeId);
				if (current === undefined || dist < current) distances.set(nodeId, dist);
			}
		}

		let best: { id: string; distance: number } | undefined;

		for (const node of this.nodes) {
			const nodeId = String(node.id);
			const dist = distances.get(nodeId);
			if (dist === undefined) continue;

			const data = getData(node);
			if (data.role !== "try-exit-boundary") continue;
			if (String(data.tryOwner ?? "") !== tryOwnerId) continue;

			const hasMeaningfulBody =
				getStr(data.sourceText).trim().length > 0 ||
				getStr(data.label).trim().length > 0 ||
				getConstruct(node) !== undefined;
			if (!hasMeaningfulBody) continue;

			if (!best || dist < best.distance) {
				best = { id: nodeId, distance: dist };
			}
		}

		return best?.id;
	}

	private findStartEdge(): Edge | undefined {
		return (
			this.edges.find((e) => {
				const src = this.nodeById.get(String(e.source));
				return src?.type === "initial";
			})
		);
	}

	// ── Text / snippet writing ───────────────────────────────────────────────

	private writeStatement(text: string, level: number): void {
		if (!text) return;
		if (text.includes("\n")) this.writeSnippet(text, level);
		else this.code += `${indent(level)}${text}\n`;
	}

	private writeSnippet(snippet: string, level: number): void {
		const lines = snippet.split(/\r?\n/);
		let minIndent = Infinity;
		for (const line of lines) {
			if (!line.trim()) continue;
			const m = line.match(/^[ \t]*/);
			const len = m ? m[0].length : 0;
			if (len < minIndent) minIndent = len;
		}
		if (!isFinite(minIndent)) minIndent = 0;

		for (const line of lines) {
			if (!line.trim()) this.code += "\n";
			else this.code += `${indent(level)}${line.slice(minIndent)}\n`;
		}
	}
}