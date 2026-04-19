import { type Node, type Edge } from "@xyflow/react";
import { START_EDGE_SOURCE_ID, type FuncArg, type HookSpec } from "../shared/types";
import { indent, normalize, sanitizeStatement, parseHookSpec, stringifyLabel } from "../shared/string-utils";
import { checkStructure, formatFunctionHeader, getNodeLabel, isTryNode, looksAsync } from "../graph/node-utils";
import {
	findJoinNode,
	findJoinNodeForBranches,
	findLabeledEdge,
	getOutgoingEdges,
	getPrimaryNext,
} from "../graph/traversal";

function hookOpenLine(spec: HookSpec, level: number): string {
	switch (spec.kind) {
		case "useEffect": return `${indent(level)}useEffect(() => {\n`;
		case "useMemo": return `${indent(level)}const value = useMemo(() => {\n`;
		case "useCallback": return `${indent(level)}const handler = useCallback(() => {\n`;
	}
}

export class CodeGenerator {
	private readonly nodeById: Map<string, Node>;
	private readonly asyncMode: boolean;
	private code = "";
	private readonly activeLoopHeaders = new Set<string>();
	private readonly visitCountByContext = new Map<string, number>();
	private recursionDepth = 0;
	private readonly maxRecursionDepth = 1200;
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
		try {
			const startLink = this.findStartLink();

			if (!startLink) {
				return formatFunctionHeader(funcName, funcArgs, this.asyncMode) + "  // Build diagram and click Convert\n}";
			}

			this.code = formatFunctionHeader(funcName, funcArgs, this.asyncMode);

			const firstNode = this.nodeById.get(String(startLink.target));
			if (firstNode) this.visitNode(firstNode, 1);

			this.code += "}";
			return this.code;
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown code generation failure.";
			return (
				formatFunctionHeader(funcName, funcArgs, this.asyncMode) +
				`${indent(1)}throw new Error(${JSON.stringify(`Diagram conversion failed: ${message}`)});\n}`
			);
		}
	}

	private findStartLink(): Edge | undefined {
		return (
			this.edges.find((edge) => String(edge.source) === START_EDGE_SOURCE_ID) ??
			this.edges.find((edge) => {
				const source = this.nodeById.get(String(edge.source));
				return source?.type === "start" || source?.type === "initial";
			})
		);
	}

	private visitNode(
		node: Node,
		level: number,
		stopAtNodeId?: string,
		localVisited: Set<string> = new Set(),
	): void {
		this.recursionDepth += 1;
		if (this.recursionDepth > this.maxRecursionDepth) {
			this.code += `${indent(level)}// Traversal depth limit reached; stopping to avoid stack overflow.\n`;
			this.recursionDepth -= 1;
			return;
		}

		try {
		const nodeId = String(node.id);
		const contextKey = `${nodeId}|${stopAtNodeId ?? "root"}`;
		const contextVisits = (this.visitCountByContext.get(contextKey) ?? 0) + 1;
		this.visitCountByContext.set(contextKey, contextVisits);

		if (contextVisits > this.maxVisitsPerContext) {
			this.code += `${indent(level)}// Repeated flow at node ${nodeId}; stopping branch to prevent infinite recursion.\n`;
			return;
		}

		if (stopAtNodeId && nodeId === stopAtNodeId) return;
		if (node.type === "end") return;

		if (localVisited.has(nodeId)) {
			this.code += `${indent(level)}// Loop detected at node ${nodeId}, stopping this branch.\n`;
			return;
		}

		localVisited.add(nodeId);

		if (node.type === "merge") {
			this.continueFrom(nodeId, level, stopAtNodeId, localVisited);
			return;
		}

		if (isTryNode(node)) {
			if (this.emitTryCatch(node, level, stopAtNodeId, localVisited)) return;
		}

		switch (node.type) {
			case "action":
			case "expandable":
				return this.emitAction(node, nodeId, level, stopAtNodeId, localVisited);
			case "loop":
				return this.emitLoop(node, nodeId, level, stopAtNodeId, localVisited);
			case "switch":
				return this.emitSwitch(node, nodeId, level, stopAtNodeId, localVisited);
			case "decision":
				return this.emitDecision(node, nodeId, level, stopAtNodeId, localVisited);
		}

		this.continueFrom(nodeId, level, stopAtNodeId, localVisited);
		} finally {
			this.recursionDepth -= 1;
		}
	}

	// ── Node-type emitters ──────────────────────────────────────────────────

	private emitAction(
		node: Node,
		nodeId: string,
		level: number,
		stopAtNodeId: string | undefined,
		localVisited: Set<string>,
	): void {
		const label = getNodeLabel(node);
		const hookSpec = parseHookSpec(label);

		if (hookSpec) {
			this.emitHookBlock(hookSpec, nodeId, level, stopAtNodeId, localVisited);
			return;
		}

		const statement = sanitizeStatement(label);
		this.code += `${indent(level)}${statement}\n`;

		if (this.isTerminatingStatement(statement)) {
			return;
		}

		const nextId = this.getDeterministicContinuationTarget(nodeId);
		if (!nextId || nextId === stopAtNodeId) return;

		const nextNode = this.nodeById.get(nextId);
		if (nextNode) this.visitNode(nextNode, level, stopAtNodeId, localVisited);
	}

	private emitLoop(
		node: Node,
		nodeId: string,
		level: number,
		stopAtNodeId: string | undefined,
		localVisited: Set<string>,
	): void {
		const label = getNodeLabel(node).trim();
		const outgoing = getOutgoingEdges(this.edges, nodeId);

		const trueEdge = this.pickPreferredBranchEdge(outgoing, ["true", "yes", "body", "each", "next"]);
		const falseEdge =
			findLabeledEdge(outgoing, ["false", "no", "done", "exit"]) ??
			outgoing.find((e) => String(e.target) !== String(trueEdge?.target));

		if (!trueEdge && outgoing.length > 1) {
			throw new Error(`Ambiguous loop at node ${nodeId}: missing explicit body branch label.`);
		}

		if (this.activeLoopHeaders.has(nodeId)) return;
		this.activeLoopHeaders.add(nodeId);

		if (!label) {
			this.code += `${indent(level)}while (true) {\n`;
		} else if (/^(let |const |var )/.test(label) || label.includes(";")) {
			this.code += `${indent(level)}for (${label}) {\n`;
		} else {
			this.code += `${indent(level)}while (${label}) {\n`;
		}

		if (trueEdge) {
			const bodyNode = this.nodeById.get(String(trueEdge.target));
			if (bodyNode) this.visitNode(bodyNode, level + 1, nodeId, new Set());
		}

		this.code += `${indent(level)}}\n`;
		this.activeLoopHeaders.delete(nodeId);

		if (falseEdge) {
			const exitNode = this.nodeById.get(String(falseEdge.target));
			if (exitNode) this.visitNode(exitNode, level, stopAtNodeId, new Set(localVisited));
		}
	}

	private emitSwitch(
		node: Node,
		nodeId: string,
		level: number,
		stopAtNodeId: string | undefined,
		localVisited: Set<string>,
	): void {
		const label = getNodeLabel(node);
		const outgoing = getOutgoingEdges(this.edges, nodeId);

		const caseEdges = outgoing.filter((edge) => {
			const edgeLabel = normalize(edge.label);
			return edgeLabel.startsWith("case ") || edgeLabel === "default" || edgeLabel === "default:";
		});

		if (caseEdges.length < 2) {
			this.continueFrom(nodeId, level, stopAtNodeId, localVisited);
			return;
		}

		const joinNodeId = findJoinNodeForBranches(
			this.edges,
			this.nodeById,
			caseEdges.map((e) => String(e.target)),
		);

		const switchExpr = label.trim().startsWith("Switch:")
			? label.trim().slice(7).trim() || "value"
			: label.trim() || "value";

		this.code += `${indent(level)}switch (${switchExpr}) {\n`;

		for (const caseEdge of caseEdges) {
			const raw = stringifyLabel(caseEdge.label);
			const lower = raw.toLowerCase();
			const caseLabel =
				lower === "default" || lower === "default:"
					? "default:"
					: raw.endsWith(":")
						? raw
						: `${raw}:`;

			this.code += `${indent(level + 1)}${caseLabel}\n`;

			const targetNode = this.nodeById.get(String(caseEdge.target));
			if (targetNode) this.visitNode(targetNode, level + 2, joinNodeId ?? undefined, new Set());

			this.code += `${indent(level + 2)}break;\n`;
		}

		this.code += `${indent(level)}}\n`;
		this.continueAfterJoin(joinNodeId, level, stopAtNodeId, localVisited);
	}

	private emitDecision(
		node: Node,
		nodeId: string,
		level: number,
		stopAtNodeId: string | undefined,
		localVisited: Set<string>,
	): void {
		const label = getNodeLabel(node);
		const outgoing = getOutgoingEdges(this.edges, nodeId);

		if (outgoing.length === 0) {
			return;
		}

		if (this.isSwitchDecision(outgoing)) {
			this.emitSwitchDecision(nodeId, label, outgoing, level, stopAtNodeId, localVisited);
			return;
		}

		if (this.isTryDecision(outgoing)) {
			this.emitTryDecision(nodeId, outgoing, level, stopAtNodeId, localVisited);
			return;
		}

		if (this.emitDecisionAsLoopWhenDetected(nodeId, label, outgoing, level, stopAtNodeId, localVisited)) {
			return;
		}

		if (outgoing.length > 2) {
			throw new Error(
				`Ambiguous decision at node ${nodeId}: expected yes/no branches or labeled switch-like edges.`,
			);
		}

		const trueEdge = this.pickPreferredBranchEdge(outgoing, ["true", "yes", "next"]);
		const falseEdge =
			findLabeledEdge(outgoing, ["false", "no", "done"]) ??
			outgoing.find((e) => String(e.target) !== String(trueEdge?.target));

		if (!trueEdge && outgoing.length > 1) {
			throw new Error(`Ambiguous decision at node ${nodeId}: add explicit yes/no labels.`);
		}

		const trueTarget  = trueEdge  ? String(trueEdge.target)  : undefined;
		const falseTarget = falseEdge ? String(falseEdge.target) : undefined;

		const joinNodeId = findJoinNode(this.edges, this.nodeById, trueTarget, falseTarget);

		this.code += `${indent(level)}if (${label || "condition"}) {\n`;

		if (trueEdge) {
			const trueNode = this.nodeById.get(String(trueEdge.target));
			if (trueNode) this.visitNode(trueNode, level + 1, joinNodeId ?? undefined, new Set());
		}

		if (falseEdge) {
			this.code += `${indent(level)}} else {\n`;
			const falseNode = this.nodeById.get(String(falseEdge.target));
			if (falseNode) this.visitNode(falseNode, level + 1, joinNodeId ?? undefined, new Set());
			this.code += `${indent(level)}}\n`;
		} else {
			this.code += `${indent(level)}}\n`;
		}

		this.continueAfterJoin(joinNodeId, level, stopAtNodeId, localVisited);
	}

	private emitDecisionAsLoop(
		nodeId: string,
		label: string,
		trueLoopsBack: boolean,
		trueTarget: string | undefined,
		falseTarget: string | undefined,
		level: number,
		stopAtNodeId: string | undefined,
		localVisited: Set<string>,
	): void {
		this.activeLoopHeaders.add(nodeId);

		const loopBodyTarget = trueLoopsBack ? trueTarget : falseTarget;
		const loopExitTarget = trueLoopsBack ? falseTarget : trueTarget;
		const rawCondition = label.trim() || "condition";
		const loopCondition = trueLoopsBack ? rawCondition : `!(${rawCondition})`;

		this.code += `${indent(level)}while (${loopCondition}) {\n`;

		if (loopBodyTarget) {
			const bodyNode = this.nodeById.get(loopBodyTarget);
			if (bodyNode) this.visitNode(bodyNode, level + 1, nodeId, new Set());
		}

		this.code += `${indent(level)}}\n`;
		this.activeLoopHeaders.delete(nodeId);

		if (loopExitTarget) {
			const exitNode = this.nodeById.get(loopExitTarget);
			if (exitNode) this.visitNode(exitNode, level, stopAtNodeId, new Set(localVisited));
		}
	}

	private emitDecisionAsLoopWhenDetected(
		nodeId: string,
		label: string,
		outgoing: Edge[],
		level: number,
		stopAtNodeId: string | undefined,
		localVisited: Set<string>,
	): boolean {
		if (this.activeLoopHeaders.has(nodeId)) {
			return false;
		}

		if (outgoing.length !== 2) {
			return false;
		}

		const trueEdge = this.pickPreferredBranchEdge(outgoing, ["true", "yes", "next"]);
		const falseEdge =
			findLabeledEdge(outgoing, ["false", "no", "done"]) ??
			outgoing.find((edge) => String(edge.target) !== String(trueEdge?.target));

		if (!trueEdge || !falseEdge) {
			return false;
		}

		const trueTarget = String(trueEdge.target);
		const falseTarget = String(falseEdge.target);
		const trueIsLoopBranch = this.isUnambiguousLoopBackBranch(trueTarget, nodeId);
		const falseIsLoopBranch = this.isUnambiguousLoopBackBranch(falseTarget, nodeId);

		// Must have exactly one clear loop-back branch and one clear exit branch.
		if (trueIsLoopBranch === falseIsLoopBranch) {
			return false;
		}

		this.emitDecisionAsLoop(
			nodeId,
			label,
			trueIsLoopBranch,
			trueTarget,
			falseTarget,
			level,
			stopAtNodeId,
			localVisited,
		);

		return true;
	}

	private isUnambiguousLoopBackBranch(branchStartId: string, decisionId: string): boolean {
		if (branchStartId === decisionId) {
			return true;
		}

		const visited = new Set<string>();
		let currentId: string | undefined = branchStartId;
		let steps = 0;
		const maxSteps = 120;

		while (currentId && !visited.has(currentId) && steps < maxSteps) {
			visited.add(currentId);
			steps += 1;

			const currentNode = this.nodeById.get(currentId);
			if (!currentNode) {
				return false;
			}

			const outgoing = getOutgoingEdges(this.edges, currentId);
			const hasBackEdge = outgoing.some((edge) => String(edge.target) === decisionId);
			if (hasBackEdge) {
				// Only accept direct structural back-edges from linear flow nodes.
				return outgoing.length === 1 || (outgoing.length === 2 && currentNode.type === "action");
			}

			if (currentNode.type === "merge" || currentNode.type === "decision" || currentNode.type === "switch" || currentNode.type === "loop") {
				return false;
			}

			const nextId = this.getDeterministicContinuationTarget(currentId);
			if (!nextId) {
				return false;
			}

			currentId = nextId;
		}

		return false;
	}

	private isSwitchDecision(outgoing: Edge[]): boolean {
		const caseEdgeCount = outgoing.filter((edge) => {
			const edgeLabel = normalize(edge.label);
			return edgeLabel.startsWith("case ") || edgeLabel === "default" || edgeLabel === "default:";
		}).length;

		return caseEdgeCount >= 2;
	}

	private emitSwitchDecision(
		nodeId: string,
		label: string,
		outgoing: Edge[],
		level: number,
		stopAtNodeId: string | undefined,
		localVisited: Set<string>,
	): void {
		const caseEdges = outgoing.filter((edge) => {
			const edgeLabel = normalize(edge.label);
			return edgeLabel.startsWith("case ") || edgeLabel === "default" || edgeLabel === "default:";
		});

		const groupedCaseTargets: Array<{ target: string; labels: string[] }> = [];
		for (const edge of caseEdges) {
			const target = String(edge.target);
			const text = stringifyLabel(edge.label) || "default";
			const existing = groupedCaseTargets.find((group) => group.target === target);
			if (existing) {
				existing.labels.push(text);
			} else {
				groupedCaseTargets.push({ target, labels: [text] });
			}
		}

		const joinNodeId = findJoinNodeForBranches(
			this.edges,
			this.nodeById,
			groupedCaseTargets.map((group) => group.target),
		);

		const switchExpr = label.trim().startsWith("Switch:")
			? label.trim().slice(7).trim() || "value"
			: label.trim() || "value";

		this.code += `${indent(level)}switch (${switchExpr}) {\n`;

		for (const group of groupedCaseTargets) {
			for (const rawLabel of group.labels) {
				const lower = rawLabel.toLowerCase();
				const caseLabel =
					lower === "default" || lower === "default:"
						? "default:"
						: rawLabel.endsWith(":")
							? rawLabel
							: `${rawLabel}:`;
				this.code += `${indent(level + 1)}${caseLabel}\n`;
			}

			const targetNode = this.nodeById.get(group.target);
			if (targetNode) {
				this.visitNode(targetNode, level + 2, joinNodeId ?? undefined, new Set());
			}

			this.code += `${indent(level + 2)}break;\n`;
		}

		this.code += `${indent(level)}}\n`;
		this.continueAfterJoin(joinNodeId, level, stopAtNodeId, localVisited);
	}

	private isTryDecision(outgoing: Edge[]): boolean {
		const labels = outgoing.map((edge) => normalize(edge.label));
		return labels.includes("try") || labels.includes("catch");
	}

	private emitTryDecision(
		nodeId: string,
		outgoing: Edge[],
		level: number,
		stopAtNodeId: string | undefined,
		localVisited: Set<string>,
	): void {
		const tryEdge = this.pickPreferredBranchEdge(outgoing, ["try", "success", "ok", "yes", "true"]);
		const catchEdge =
			findLabeledEdge(outgoing, ["catch", "error", "fail", "no", "false"]) ??
			outgoing.find((edge) => edge !== tryEdge);

		if (!tryEdge) {
			throw new Error(`Invalid try/catch decision at node ${nodeId}: missing try branch.`);
		}

		const tryTarget = String(tryEdge.target);
		const catchTarget = catchEdge ? String(catchEdge.target) : undefined;
		const joinNodeId = findJoinNode(this.edges, this.nodeById, tryTarget, catchTarget);

		this.code += `${indent(level)}try {\n`;
		const tryNode = this.nodeById.get(tryTarget);
		if (tryNode) {
			this.visitNode(tryNode, level + 1, joinNodeId ?? undefined, new Set());
		}

		this.code += `${indent(level)}} catch (err) {\n`;
		if (catchTarget) {
			const catchNode = this.nodeById.get(catchTarget);
			if (catchNode) {
				this.visitNode(catchNode, level + 1, joinNodeId ?? undefined, new Set());
			}
		}
		this.code += `${indent(level)}}\n`;

		if (joinNodeId) {
			const joinNode = this.nodeById.get(joinNodeId);
			if (joinNode && joinNode.type !== "merge") {
				const finallyStop = this.findFirstMergeOnPrimary(joinNodeId);
				this.code += `${indent(level)}finally {\n`;
				this.visitNode(joinNode, level + 1, finallyStop ?? undefined, new Set());
				this.code += `${indent(level)}}\n`;
				this.continueAfterJoin(finallyStop ?? undefined, level, stopAtNodeId, localVisited);
				return;
			}
		}

		this.continueAfterJoin(joinNodeId, level, stopAtNodeId, localVisited);
	}

	private emitTryCatch(
		node: Node,
		level: number,
		stopAtNodeId: string | undefined,
		localVisited: Set<string>,
	): boolean {
		const nodeId = String(node.id);
		const outgoing = getOutgoingEdges(this.edges, nodeId);
		if (!this.isTryDecision(outgoing)) {
			return false;
		}

		this.emitTryDecision(nodeId, outgoing, level, stopAtNodeId, localVisited);
		return true;
	}

	private emitHookBlock(
		spec: HookSpec,
		nodeId: string,
		level: number,
		stopAtNodeId: string | undefined,
		localVisited: Set<string>,
	): void {
		const outgoing = getOutgoingEdges(this.edges, nodeId);
		const primaryEdge = this.pickPreferredBranchEdge(outgoing, ["body", "next", "yes", "true"]);

		this.code += hookOpenLine(spec, level);

		let mergeId: string | null = null;

		if (primaryEdge) {
			const bodyStartId = String(primaryEdge.target);
			mergeId = findJoinNode(this.edges, this.nodeById, bodyStartId, stopAtNodeId);
			const bodyNode = this.nodeById.get(bodyStartId);
			if (bodyNode) this.visitNode(bodyNode, level + 1, mergeId ?? stopAtNodeId, new Set());
		}

		if (spec.kind === "useMemo") {
			this.code += `${indent(level + 1)}return undefined;\n`;
		}

		this.code += `${indent(level)}}${spec.deps});\n`;

		if (mergeId) {
			const continueId = this.getDeterministicContinuationTarget(mergeId);
			if (continueId) {
				const nextNode = this.nodeById.get(continueId);
				if (nextNode) this.visitNode(nextNode, level, stopAtNodeId, new Set(localVisited));
			}
		}
	}

	// ── Traversal helpers ───────────────────────────────────────────────────

	private continueFrom(
		nodeId: string,
		level: number,
		stopAtNodeId: string | undefined,
		localVisited: Set<string>,
	): void {
		const nextId = this.getDeterministicContinuationTarget(nodeId);
		if (!nextId || nextId === stopAtNodeId) return;
		const nextNode = this.nodeById.get(nextId);
		if (nextNode) this.visitNode(nextNode, level, stopAtNodeId, localVisited);
	}

	private continueAfterJoin(
		joinNodeId: string | null | undefined,
		level: number,
		stopAtNodeId: string | undefined,
		localVisited: Set<string>,
	): void {
		if (!joinNodeId) return;
		if (stopAtNodeId && joinNodeId === stopAtNodeId) return;
		const afterId = this.getDeterministicContinuationTarget(joinNodeId);
		if (!afterId) return;
		const afterNode = this.nodeById.get(afterId);
		if (afterNode) this.visitNode(afterNode, level, stopAtNodeId, new Set(localVisited));
	}

	private isTerminatingStatement(statement: string): boolean {
		const normalized = statement.trim();
		return /^return\b/.test(normalized) || /^throw\b/.test(normalized);
	}

	private findFirstMergeOnPrimary(startId: string): string | undefined {
		const visited = new Set<string>();
		let current = startId;

		while (current && !visited.has(current)) {
			visited.add(current);
			const nextId = this.getDeterministicContinuationTarget(current);
			if (!nextId) {
				return undefined;
			}

			const nextNode = this.nodeById.get(nextId);
			if (nextNode?.type === "merge") {
				return nextId;
			}

			current = nextId;
		}

		return undefined;
	}

	private getDeterministicContinuationTarget(nodeId: string): string | undefined {
		return getPrimaryNext(this.edges, nodeId);
	}

	private pickPreferredBranchEdge(outgoing: Edge[], labels: string[]): Edge | undefined {
		const labeled = findLabeledEdge(outgoing, labels);
		if (labeled) {
			return labeled;
		}

		if (outgoing.length === 1) {
			return outgoing[0];
		}

		return undefined;
	}
}
