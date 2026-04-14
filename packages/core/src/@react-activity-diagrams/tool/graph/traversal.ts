import type { Node, Edge } from "@xyflow/react";
import { normalize, stringifyLabel } from "../shared/string-utils";

export function getOutgoingEdges(edges: Edge[], nodeId: string): Edge[] {
	return edges.filter((edge) => String(edge.source) === nodeId);
}

export function getPrimaryNext(edges: Edge[], nodeId: string): string | undefined {
	const unlabeled = edges.find(
		(edge) => String(edge.source) === nodeId && !stringifyLabel(edge.label),
	);
	if (unlabeled) return String(unlabeled.target);

	const first = edges.find((edge) => String(edge.source) === nodeId);
	return first ? String(first.target) : undefined;
}

export function tracePath(edges: Edge[], startId: string | undefined, maxSteps = 250): string[] {
	const path: string[] = [];
	const seen = new Set<string>();
	let current = startId;
	let steps = 0;

	while (current && !seen.has(current) && steps < maxSteps) {
		path.push(current);
		seen.add(current);
		current = getPrimaryNext(edges, current);
		steps += 1;
	}

	return path;
}

export function findJoinNode(
	edges: Edge[],
	nodeById: Map<string, Node>,
	trueStartId: string | undefined,
	falseStartId: string | undefined,
): string | null {
	if (!trueStartId || !falseStartId) return null;

	const truePath = tracePath(edges, trueStartId);
	const falseSet = new Set(tracePath(edges, falseStartId));

	for (const id of truePath) {
		if (falseSet.has(id) && nodeById.get(id)?.type === "merge") return id;
	}

	for (const id of truePath) {
		if (falseSet.has(id)) return id;
	}

	return null;
}

export function findJoinNodeForBranches(
	edges: Edge[],
	nodeById: Map<string, Node>,
	branchStartIds: string[],
): string | null {
	if (branchStartIds.length < 2) return null;

	const branchPaths = branchStartIds
		.map((id) => tracePath(edges, id))
		.filter((path) => path.length > 0);

	if (branchPaths.length < 2) return null;

	const pathSets = branchPaths.map((path) => new Set(path));
	const firstPath = branchPaths[0];

	for (const id of firstPath) {
		if (pathSets.every((set) => set.has(id)) && nodeById.get(id)?.type === "merge") return id;
	}

	for (const id of firstPath) {
		if (pathSets.every((set) => set.has(id))) return id;
	}

	return null;
}

export function canReach(
	edges: Edge[],
	startId: string | undefined,
	targetId: string,
	maxSteps = 1500,
): boolean {
	if (!startId) return false;

	const queue: string[] = [startId];
	const visited = new Set<string>();
	let steps = 0;

	while (queue.length > 0 && steps < maxSteps) {
		const current = queue.shift();
		steps += 1;

		if (!current || visited.has(current)) continue;
		if (current === targetId) return true;

		visited.add(current);

		for (const edge of getOutgoingEdges(edges, current)) {
			if (!visited.has(String(edge.target))) {
				queue.push(String(edge.target));
			}
		}
	}

	return false;
}

export function findLabeledEdge(outgoingEdges: Edge[], labels: string[]): Edge | undefined {
	const wanted = new Set(labels.map((label) => label.toLowerCase()));
	return outgoingEdges.find((edge) => wanted.has(normalize(edge.label)));
}
