import { type Node, type Edge } from "@xyflow/react";
import { START_EDGE_SOURCE_ID, type FuncArg, type HookSpec } from "../shared/types";
import { indent, normalize, sanitizeStatement, parseHookSpec, stringifyLabel } from "../shared/string-utils";
import { checkStructure, formatFunctionHeader, getNodeLabel, isTryNode, looksAsync } from "../graph/node-utils";
import {
	canReach,
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

	constructor(
		private readonly nodes: Node[],
		private readonly edges: Edge[],
	) {
		checkStructure(nodes, edges);
		this.nodeById = new Map(nodes.map((node) => [String(node.id), node]));
		this.asyncMode = looksAsync(nodes);
	}

	generate(funcName: string, funcArgs: FuncArg[]): string {
		const startLink = this.findStartLink();

		if (!startLink) {
			return formatFunctionHeader(funcName, funcArgs, this.asyncMode) + "  // Build diagram and click Convert\n}";
		}

		this.code = formatFunctionHeader(funcName, funcArgs, this.asyncMode);

		const firstNode = this.nodeById.get(String(startLink.target));
		if (firstNode) this.visitNode(firstNode, 1);

		this.code += "}";
		return this.code;
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
		const nodeId = String(node.id);

		if (stopAtNodeId && nodeId === stopAtNodeId) return;

		if (localVisited.has(nodeId)) {
			this.code += `${indent(level)}// Loop detected at node ${nodeId}, stopping this branch.\n`;
			return;
		}

		localVisited.add(nodeId);

		if (node.type === "merge") return;

		if (isTryNode(node)) {
			if (this.emitTryCatch(node, level, stopAtNodeId, localVisited)) return;
		}

		switch (node.type) {
			case "action":   return this.emitAction(node, nodeId, level, stopAtNodeId, localVisited);
			case "loop":     return this.emitLoop(node, nodeId, level, stopAtNodeId, localVisited);
			case "switch":   return this.emitSwitch(node, nodeId, level, stopAtNodeId, localVisited);
			case "decision": return this.emitDecision(node, nodeId, level, stopAtNodeId, localVisited);
		}

		this.continueFrom(nodeId, level, stopAtNodeId, localVisited);
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

		this.code += `${indent(level)}${sanitizeStatement(label)}\n`;

		const nextId = getPrimaryNext(this.edges, nodeId);
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

		const trueEdge = findLabeledEdge(outgoing, ["true", "yes", "next", "body"]) ?? outgoing[0];
		const falseEdge =
			findLabeledEdge(outgoing, ["false", "no", "done", "exit"]) ??
			outgoing.find((e) => String(e.target) !== String(trueEdge?.target));

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

		const trueEdge = findLabeledEdge(outgoing, ["true", "yes", "next"]) ?? outgoing[0];
		const falseEdge =
			findLabeledEdge(outgoing, ["false", "no", "done"]) ??
			outgoing.find((e) => String(e.target) !== String(trueEdge?.target));

		const trueTarget  = trueEdge  ? String(trueEdge.target)  : undefined;
		const falseTarget = falseEdge ? String(falseEdge.target) : undefined;

		const trueLoopsBack  = trueTarget  ? canReach(this.edges, trueTarget,  nodeId) : false;
		const falseLoopsBack = falseTarget ? canReach(this.edges, falseTarget, nodeId) : false;

		const isImplicitLoop =
			!this.activeLoopHeaders.has(nodeId) &&
			((trueLoopsBack && !falseLoopsBack) || (falseLoopsBack && !trueLoopsBack));

		if (isImplicitLoop) {
			this.emitDecisionAsLoop(nodeId, label, trueLoopsBack, trueTarget, falseTarget, level, stopAtNodeId, localVisited);
			return;
		}

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

	private emitTryCatch(
		node: Node,
		level: number,
		stopAtNodeId: string | undefined,
		localVisited: Set<string>,
	): boolean {
		const nodeId = String(node.id);
		const outgoing = getOutgoingEdges(this.edges, nodeId);

		const tryEdge =
			findLabeledEdge(outgoing, ["try", "success", "ok", "yes", "true"]) ?? outgoing[0];
		const catchEdge =
			findLabeledEdge(outgoing, ["catch", "error", "fail", "no", "false"]) ??
			outgoing.find((e) => String(e.target) !== String(tryEdge?.target));

		if (!tryEdge && !catchEdge) return false;

		const tryTarget   = tryEdge   ? String(tryEdge.target)   : undefined;
		const catchTarget = catchEdge ? String(catchEdge.target) : undefined;
		const joinNodeId  = findJoinNode(this.edges, this.nodeById, tryTarget, catchTarget);

		this.code += `${indent(level)}try {\n`;

		if (tryTarget) {
			const tryNode = this.nodeById.get(tryTarget);
			if (tryNode) this.visitNode(tryNode, level + 1, joinNodeId ?? undefined, new Set());
		}

		this.code += `${indent(level)}} catch (err) {\n`;

		if (catchTarget) {
			const catchNode = this.nodeById.get(catchTarget);
			if (catchNode) this.visitNode(catchNode, level + 1, joinNodeId ?? undefined, new Set());
		}

		this.code += `${indent(level)}}\n`;
		this.continueAfterJoin(joinNodeId, level, stopAtNodeId, localVisited);
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
		const primaryEdge = outgoing[0];

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
			const continueId = getPrimaryNext(this.edges, mergeId);
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
		const nextId = getPrimaryNext(this.edges, nodeId);
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
		const afterId = getPrimaryNext(this.edges, joinNodeId);
		if (!afterId) return;
		const afterNode = this.nodeById.get(afterId);
		if (afterNode) this.visitNode(afterNode, level, stopAtNodeId, new Set(localVisited));
	}
}
