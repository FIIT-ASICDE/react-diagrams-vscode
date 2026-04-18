import type { Edge, Node } from '@xyflow/react';
import type { EdgeRenameDraft, RenameDraft } from '../model/types';

export function createRenameDraft(node: Node): RenameDraft {
	const currentData = (node.data as { label?: unknown; deps?: unknown } | undefined) ?? {};
	const currentLabel = String(currentData.label ?? '');
	const hasDeps = typeof currentData.deps === 'string';

	return {
		nodeId: node.id,
		value: currentLabel,
		...(hasDeps ? { deps: String(currentData.deps ?? '') } : {}),
	};
}

export function applyRenameToNodes(nodes: Node[], renameDraft: RenameDraft): Node[] {
	return nodes.map((candidate) => {
		if (candidate.id !== renameDraft.nodeId) {
			return candidate;
		}

		return {
			...candidate,
			data: {
				...((candidate.data as Record<string, unknown> | undefined) ?? {}),
				label: renameDraft.value,
				...(renameDraft.deps !== undefined ? { deps: renameDraft.deps } : {}),
			},
		};
	});
}

export function createEdgeRenameDraft(edge: Edge): EdgeRenameDraft {
	return {
		edgeId: edge.id,
		value: String(edge.label ?? ''),
	};
}

export function applyRenameToEdges(edges: Edge[], renameDraft: EdgeRenameDraft): Edge[] {
	return edges.map((candidate) => {
		if (candidate.id !== renameDraft.edgeId) {
			return candidate;
		}

		return {
			...candidate,
			label: renameDraft.value,
		};
	});
}
