import type { Node, Edge } from "@xyflow/react";
import { normalize, stringifyLabel } from "../shared/string-utils";


// Handles edge sort key.
function edgeSortKey(edge: Edge): string {
	const label = normalize(edge.label);
	const labelRank = label ? "1" : "0";
	return `${labelRank}|${label}|${String(edge.target)}|${String(edge.id ?? "")}`;
}


// Returns outgoing edges.
export function getOutgoingEdges(edges: Edge[], nodeId: string): Edge[] {
	return edges
		.filter((edge) => String(edge.source) === nodeId)
		.sort((left, right) => edgeSortKey(left).localeCompare(edgeSortKey(right)));
}




// Finds labeled edge.
export function findLabeledEdge(outgoingEdges: Edge[], labels: string[]): Edge | undefined {
	const wanted = new Set(labels.map((label) => label.toLowerCase()));
	return outgoingEdges.find((edge) => wanted.has(normalize(edge.label)));
}
