import type { Edge, Node } from '@xyflow/react';
import type { EdgeRenameDraft, RenameDraft } from '../model/types';

const MAX_NODE_LABEL_LENGTH = 20;

function trimNodeLabel(text: string): string {
	const normalized = text.replace(/\s+/g, ' ').trim();
	if (normalized.length <= MAX_NODE_LABEL_LENGTH) {
		return normalized;
	}

	return `${normalized.slice(0, MAX_NODE_LABEL_LENGTH - 3)}...`;
}

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

		const fullText = renameDraft.value.trim();
		const trimmedLabel = trimNodeLabel(fullText);

		return {
			...candidate,
			data: {
				...((candidate.data as Record<string, unknown> | undefined) ?? {}),
				label: trimmedLabel,
				sourceText: fullText,
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
