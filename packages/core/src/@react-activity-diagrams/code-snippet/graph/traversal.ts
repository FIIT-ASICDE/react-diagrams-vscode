import type { Node, Edge } from "@xyflow/react";
import { normalize, stringifyLabel } from "../shared/string-utils";

function edgeSortKey(edge: Edge): string {
	const label = normalize(edge.label);
	const labelRank = label ? "1" : "0";
	return `${labelRank}|${label}|${String(edge.target)}|${String(edge.id ?? "")}`;
}

export function getOutgoingEdges(edges: Edge[], nodeId: string): Edge[] {
	return edges
		.filter((edge) => String(edge.source) === nodeId)
		.sort((left, right) => edgeSortKey(left).localeCompare(edgeSortKey(right)));
}

export function getPrimaryNext(edges: Edge[], nodeId: string): string | undefined {
	const outgoing = getOutgoingEdges(edges, nodeId);
	if (outgoing.length === 0) {
		return undefined;
	}

	if (outgoing.length === 1) {
		return String(outgoing[0].target);
	}

	const unlabeled = outgoing.filter((edge) => !stringifyLabel(edge.label));
	if (unlabeled.length === 1) {
		return String(unlabeled[0].target);
	}

	const continuation = findLabeledEdge(outgoing, ["next", "continue", "then", "after"]);
	if (continuation) {
		return String(continuation.target);
	}

	return undefined;
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

function collectReachableDistances(
	edges: Edge[],
	startId: string,
	maxSteps = 4000,
): Map<string, number> {
	const distances = new Map<string, number>();
	const queue: Array<{ id: string; dist: number }> = [{ id: startId, dist: 0 }];
	let steps = 0;

	while (queue.length > 0 && steps < maxSteps) {
		const current = queue.shift();
		steps += 1;
		if (!current) {
			continue;
		}

		const knownDistance = distances.get(current.id);
		if (knownDistance !== undefined && knownDistance <= current.dist) {
			continue;
		}

		distances.set(current.id, current.dist);

		for (const edge of getOutgoingEdges(edges, current.id)) {
			queue.push({ id: String(edge.target), dist: current.dist + 1 });
		}
	}

	return distances;
}

export function findJoinNode(
	edges: Edge[],
	nodeById: Map<string, Node>,
	trueStartId: string | undefined,
	falseStartId: string | undefined,
): string | null {
	if (!trueStartId || !falseStartId) return null;

	const trueReachable = collectReachableDistances(edges, trueStartId);
	const falseReachable = collectReachableDistances(edges, falseStartId);

	const candidates = [...trueReachable.keys()]
		.filter((id) => falseReachable.has(id))
		.filter((id) => id !== trueStartId && id !== falseStartId)
		.map((id) => ({
			id,
			isMerge: nodeById.get(id)?.type === "merge",
			distanceScore: (trueReachable.get(id) ?? 0) + (falseReachable.get(id) ?? 0),
		}))
		.sort((left, right) => {
			if (left.isMerge !== right.isMerge) {
				return left.isMerge ? -1 : 1;
			}

			return left.distanceScore - right.distanceScore;
		});

	return candidates[0]?.id ?? null;
}

export function findJoinNodeForBranches(
	edges: Edge[],
	nodeById: Map<string, Node>,
	branchStartIds: string[],
): string | null {
	if (branchStartIds.length < 2) return null;

	const reachables = branchStartIds
		.map((id) => collectReachableDistances(edges, id))
		.filter((map) => map.size > 0);

	if (reachables.length < 2) return null;

	const firstReachable = reachables[0];
	const candidates = [...firstReachable.keys()]
		.filter((id) => !branchStartIds.includes(id))
		.filter((id) => reachables.every((reachable) => reachable.has(id)))
		.map((id) => ({
			id,
			isMerge: nodeById.get(id)?.type === "merge",
			distanceScore: reachables.reduce((total, reachable) => total + (reachable.get(id) ?? 0), 0),
		}))
		.sort((left, right) => {
			if (left.isMerge !== right.isMerge) {
				return left.isMerge ? -1 : 1;
			}

			return left.distanceScore - right.distanceScore;
		});

	return candidates[0]?.id ?? null;
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
