import { type Node, type Edge } from "@xyflow/react";
import { normalize } from "../shared/string-utils";
import { getData, getStr, isBackEdge, isTryExitEdge, isExceptionEdge } from "./Helpers";
import type { BranchResolver } from "./Branch-resolver";

/**
 * Resolves try/catch/finally structure targets from the control-flow graph.
 * Separated from CodeGenerator to keep try-logic self-contained and testable.
 */
export class TryResolver {
	constructor(
		private readonly nodeById: Map<string, Node>,
		private readonly edges: Edge[],
		private readonly branches: BranchResolver,
	) {}

	findTryAfterTarget(
		tryId: string,
		tryTarget?: string,
		catchTarget?: string,
		finallyTarget?: string,
	): string | undefined {
		const fromExit = this.findExitTryTargetByLabeledEdges(tryId, [
			tryTarget,
			catchTarget,
			finallyTarget,
		]);
		if (fromExit) return fromExit;

		if (tryTarget && catchTarget) {
			return this.branches.findBranchJoin(tryTarget, catchTarget);
		}

		if (tryTarget) return this.findLinearAfterTry(tryTarget);

		return undefined;
	}

	findTryAfterTargetFromEntry(
		tryEntryId: string,
		catchTarget?: string,
		finallyTarget?: string,
	): string | undefined {
		const fromExit = this.findExitTryTargetByLabeledEdges(tryEntryId, [
			tryEntryId,
			catchTarget,
			finallyTarget,
		]);
		if (fromExit) return fromExit;

		if (catchTarget) {
			return this.branches.findBranchJoin(tryEntryId, catchTarget);
		}

		return this.findLinearAfterTry(tryEntryId);
	}

	findCatchTargetFromTryEntry(tryEntryId: string): string | undefined {
		const reachable = this.branches.collectReachableDistances(tryEntryId, 120);
		let lastTarget: string | undefined;

		for (const edge of this.edges) {
			if (!isExceptionEdge(edge.label)) continue;
			if (!reachable.has(String(edge.source))) continue;
			lastTarget = String(edge.target);
		}

		return lastTarget;
	}

	collectFinallyCandidates(
		tryOwnerId: string,
		starts: Array<string | undefined>,
		afterTry: string | undefined,
	): { allTargets: string[]; selected: string | undefined } {
		const distances = this.mergeReachable(starts);
		const allTargets: string[] = [];
		let lastAny: string | undefined;
		let lastPreferred: string | undefined;
		let lastStructural: string | undefined;

		for (const edge of this.edges) {
			if (isBackEdge(edge)) continue;
			if (normalize(edge.label) !== "finally") continue;

			const sourceId = String(edge.source);
			if (!distances.has(sourceId)) continue;

			const targetId = String(edge.target);
			if (
				afterTry &&
				targetId === afterTry &&
				this.isSyntheticTryBoundaryNode(targetId)
			) {
				continue;
			}

			const owner = this.getTryOwner(targetId);
			if (owner && owner !== tryOwnerId) continue;

			allTargets.push(targetId);
			lastAny = targetId;

			const sourceNode = this.nodeById.get(sourceId);
			const construct = sourceNode
				? getStr(getData(sourceNode).construct)
				: "";
			if (
				construct !== "pending-return" &&
				construct !== "break" &&
				construct !== "continue" &&
				construct !== "return" &&
				construct !== "throw"
			) {
				lastStructural = targetId;
			}
			if (construct !== "pending-return") {
				lastPreferred = targetId;
			}
		}

		return { allTargets, selected: lastStructural ?? lastPreferred ?? lastAny };
	}

	resolveAfterFinallyTarget(
		finallyTarget: string | undefined,
		afterTry: string | undefined,
	): string | undefined {
		if (!finallyTarget) return afterTry;

		if (afterTry) {
			const boundaryNode = this.nodeById.get(afterTry);
			if (boundaryNode && getData(boundaryNode).role === "try-exit-boundary") {
				const successor = this.boundarySuccessor(afterTry);
				if (successor && successor !== afterTry) return successor;
			}
		}

		if (!afterTry || afterTry === finallyTarget) {
			const successor = this.fallthroughSuccessor(finallyTarget);
			if (successor && successor !== finallyTarget) return successor;
		}

		return afterTry;
	}

	private boundarySuccessor(id: string): string | undefined {
		const out = this.edges.filter(
			(e) => String(e.source) === id && !isExceptionEdge(e.label),
		);
		if (out.length === 0) return undefined;

		const preferred = out.find((e) => {
			const n = normalize(e.label);
			return n === "no" || n === "false" || n === "done" || n === "next" || !n;
		});
		if (preferred) return String(preferred.target);

		return String(out[0].target);
	}

	isSyntheticTryBoundaryNode(nodeId: string): boolean {
		const node = this.nodeById.get(nodeId);
		if (!node) return false;
		const data = getData(node);
		if (data.role !== "try-exit-boundary") return false;
		return !getStr(data.sourceText).trim() && !getStr(data.label).trim();
	}

	// ── Private helpers ─────────────────────────────────────────────────────

	private findExitTryTargetByLabeledEdges(
		tryId: string,
		starts: Array<string | undefined>,
	): string | undefined {
		const distances = this.mergeReachable(starts);

		// First pass: explicit "exit try" labelled edges.
		let lastTarget: string | undefined;
		for (const edge of this.edges) {
			if (!isTryExitEdge(edge)) continue;
			const sourceId = String(edge.source);
			if (!distances.has(sourceId)) continue;

			const targetId = String(edge.target);
			const owner = this.getTryOwner(targetId);
			if (owner && owner !== tryId) continue;

			lastTarget = targetId;
		}
		if (lastTarget) return lastTarget;

		// Second pass: nodes explicitly marked as try-exit-boundary.
		for (const nodeId of distances.keys()) {
			const node = this.nodeById.get(nodeId);
			if (!node) continue;
			const data = getData(node);
			if (data.role !== "try-exit-boundary") continue;
			const owner = String(data.tryOwner ?? "");
			if (owner && owner !== tryId) continue;
			lastTarget = nodeId;
		}

		return lastTarget;
	}

	private findLinearAfterTry(startId: string): string | undefined {
		const reachable = this.branches.collectReachableDistances(startId, 120);
		const mergeCandidates = [...reachable.keys()].filter(
			(id) => this.nodeById.get(id)?.type === "merge",
		);
		if (mergeCandidates.length === 0) return undefined;

		mergeCandidates.sort(
			(a, b) => (reachable.get(a) ?? 9999) - (reachable.get(b) ?? 9999),
		);

		return mergeCandidates[0];
	}

	private mergeReachable(starts: Array<string | undefined>): Map<string, number> {
		const distances = new Map<string, number>();
		for (const start of starts) {
			if (!start) continue;
			const reachable = this.branches.collectReachableDistances(start, 120);
			for (const [nodeId, dist] of reachable.entries()) {
				const current = distances.get(nodeId);
				if (current === undefined || dist < current) distances.set(nodeId, dist);
			}
		}
		return distances;
	}

	private getTryOwner(nodeId: string): string {
		const node = this.nodeById.get(nodeId);
		return node ? String(getData(node).tryOwner ?? "") : "";
	}

	private fallthroughSuccessor(id: string): string | undefined {
		const out = this.edges.filter(
			(e) =>
				String(e.source) === id &&
				!isBackEdge(e) &&
				!isExceptionEdge(e.label),
		);
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
		return String((fallish ?? out[0]).target);
	}
}