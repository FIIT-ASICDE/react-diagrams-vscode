import { type Node, type Edge } from "@xyflow/react";
import { normalize } from "../shared/string-utils";
import { getOutgoingEdges } from "../graph/traversal";
import { getData, getConstruct, isBackEdge, isExceptionEdge } from "./Helpers";

/**
 * Resolves branch-join nodes and computes reachability distances
 * for if/switch/try constructs.
 */
export class BranchResolver {
	constructor(
		private readonly nodeById: Map<string, Node>,
		private readonly edges: Edge[],
		private readonly activeLoops: ReadonlySet<string>,
		private readonly isTerminatorNode: (node: Node) => boolean,
	) {}

	findBranchJoin(a: string, b: string): string | undefined {
		const aReachable = this.collectReachableDistances(a, 80);
		const bReachable = this.collectReachableDistances(b, 80);

		const common = [...aReachable.keys()].filter((id) => bReachable.has(id));
		if (common.length === 0) return undefined;

		const mergeCommon = common.filter(
			(id) => this.nodeById.get(id)?.type === "merge",
		);
		const candidates = mergeCommon.length > 0 ? mergeCommon : common;

		candidates.sort((left, right) => {
			const ls = (aReachable.get(left) ?? 9999) + (bReachable.get(left) ?? 9999);
			const rs = (aReachable.get(right) ?? 9999) + (bReachable.get(right) ?? 9999);
			return ls - rs;
		});

		return candidates[0];
	}

	collectReachableDistances(startId: string, limit: number): Map<string, number> {
		const distances = new Map<string, number>();
		const queue: Array<{ id: string; distance: number }> = [
			{ id: startId, distance: 0 },
		];

		while (queue.length > 0 && distances.size < limit) {
			const current = queue.shift()!;
			if (distances.has(current.id)) continue;
			distances.set(current.id, current.distance);

			const node = this.nodeById.get(current.id);
			if (!node || node.type === "end") continue;

			// Don't walk past terminators or active loop headers for local join detection.
			if (this.isTerminatorNode(node)) continue;
			if (this.activeLoops.has(current.id)) continue;

			for (const edge of this.outgoingForwardEdges(current.id)) {
				queue.push({ id: String(edge.target), distance: current.distance + 1 });
			}
		}

		return distances;
	}

	findExitSwitchTarget(caseTargets: string[]): string | undefined {
		const distances = new Map<string, number>();

		for (const target of caseTargets) {
			const reachable = this.collectReachableDistances(target, 120);
			for (const [nodeId, dist] of reachable.entries()) {
				const current = distances.get(nodeId);
				if (current === undefined || dist < current) distances.set(nodeId, dist);
			}
		}

		let bestTarget: string | undefined;
		let bestDistance = Infinity;

		for (const edge of this.edges) {
			if (isBackEdge(edge)) continue;
			if (normalize(edge.label) !== "exit switch") continue;

			const sourceId = String(edge.source);
			let dist = distances.get(sourceId);

			if (dist === undefined) {
				const incomingDists = this.edges
					.filter(
						(e) =>
							!isBackEdge(e) && String(e.target) === sourceId,
					)
					.map((e) => distances.get(String(e.source)))
					.filter((v): v is number => v !== undefined);

				if (incomingDists.length === 0) continue;
				dist = Math.min(...incomingDists) + 1;
			}

			const candidateDist = dist + 1;
			if (candidateDist < bestDistance) {
				bestDistance = candidateDist;
				bestTarget = String(edge.target);
			}
		}

		return bestTarget;
	}

	private outgoingForwardEdges(id: string): Edge[] {
		return getOutgoingEdges(this.edges, id).filter(
			(e) => !isBackEdge(e) && !isExceptionEdge(e.label),
		);
	}
}