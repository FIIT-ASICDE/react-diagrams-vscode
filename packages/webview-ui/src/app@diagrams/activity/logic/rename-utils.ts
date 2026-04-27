import type { Edge, Node } from '@xyflow/react';
import type { EdgeRenameDraft, RenameDraft } from '../model/types';

const MAX_NODE_LABEL_LENGTH = 20;

export function toTrimmedNodeLabel(text: string): string {
	const normalized = text.replace(/\s+/g, ' ').trim();
	if (normalized.length <= MAX_NODE_LABEL_LENGTH) {
		return normalized;
	}
	return `${normalized.slice(0, MAX_NODE_LABEL_LENGTH - 3)}...`;
}

export function createRenameDraft(node: Node): RenameDraft {
	const data =
		(node.data as { label?: unknown; deps?: unknown; sourceText?: unknown } | undefined) ?? {};
	const currentLabel = String(data.label ?? '');
	const sourceText = typeof data.sourceText === 'string' ? data.sourceText : '';

	return {
		nodeId: node.id,
		value: currentLabel,
		fullText: sourceText || currentLabel,
		...(typeof data.deps === 'string' ? { deps: data.deps } : {}),
	};
}

export function applyRenameToNodes(nodes: Node[], draft: RenameDraft): Node[] {
	return nodes.map((candidate) => {
		if (candidate.id !== draft.nodeId) return candidate;

		const fullText = draft.value.trim();
		return {
			...candidate,
			data: {
				...((candidate.data as Record<string, unknown> | undefined) ?? {}),
				label: toTrimmedNodeLabel(fullText),
				sourceText: fullText,
				...(draft.deps !== undefined ? { deps: draft.deps } : {}),
			},
		};
	});
}

export function createEdgeRenameDraft(edge: Edge): EdgeRenameDraft {
	return { edgeId: edge.id, value: String(edge.label ?? '') };
}

export function applyRenameToEdges(edges: Edge[], draft: EdgeRenameDraft): Edge[] {
	return edges.map((candidate) =>
		candidate.id === draft.edgeId ? { ...candidate, label: draft.value } : candidate,
	);
}