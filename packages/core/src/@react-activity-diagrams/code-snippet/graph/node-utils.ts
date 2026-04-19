import type { Node, Edge } from "@xyflow/react";
import type { FuncArg, NodeData } from "../shared/types";
import { START_EDGE_SOURCE_ID } from "../shared/types";
import { normalize, stringifyLabel } from "../shared/string-utils";

export function getNodeLabel(node: Node): string {
	const data = (node.data as NodeData | undefined) ?? {};
	const label = stringifyLabel(data.label);
	const sourceText = stringifyLabel(data.sourceText);

	if (label.endsWith("...") && sourceText) return sourceText;
	return label;
}

export function isTryNode(node: Node): boolean {
	const label = normalize(getNodeLabel(node));
	return label === "try";
}

export function looksAsync(nodes: Node[]): boolean {
	return nodes.some((node) => {
		const label = getNodeLabel(node);
		return /\bawait\b|\bfetch\s*\(|\.json\s*\(|promiseDelay|setTimeout|setInterval|async\b/i.test(label);
	});
}

export function checkStructure(nodes: Node[], edges: Edge[]): void {
	if (!Array.isArray(nodes) || !Array.isArray(edges)) {
		throw new Error("Nodes and edges must be arrays.");
	}

	const nodeIds = new Set(nodes.map((node) => String(node.id)));

	for (const edge of edges) {
		if (!edge.source || !edge.target) {
			throw new Error("Each edge must have source and target.");
		}

		if (!nodeIds.has(String(edge.source)) && String(edge.source) !== START_EDGE_SOURCE_ID) {
			throw new Error(`Edge source '${String(edge.source)}' does not exist.`);
		}

		if (!nodeIds.has(String(edge.target))) {
			throw new Error(`Edge target '${String(edge.target)}' does not exist.`);
		}
	}

	const hasStartNode = nodes.some((node) => node.type === "start" || node.type === "initial");
	const hasEndNode = nodes.some((node) => node.type === "end");

	if (!hasStartNode) {
		throw new Error("Diagram must contain a Start/Initial node.");
	}

	if (!hasEndNode) {
		throw new Error("Diagram must contain an End node.");
	}

	const hasStartFlow = edges.some((edge) => {
		if (String(edge.source) === START_EDGE_SOURCE_ID) {
			return true;
		}

		const sourceNode = nodes.find((node) => String(node.id) === String(edge.source));
		return sourceNode?.type === "start" || sourceNode?.type === "initial";
	});

	if (!hasStartFlow) {
		throw new Error("Start node must have an outgoing edge.");
	}
}

export function formatFunctionHeader(funcName: string, funcArgs: FuncArg[], asyncMode: boolean): string {
	const argsStr = funcArgs.map((arg) => (arg.type ? `${arg.name}: ${arg.type}` : arg.name)).join(", ");
	const asyncKeyword = asyncMode ? "async " : "";
	return `${asyncKeyword}function ${funcName}(${argsStr}) {\n`;
}
