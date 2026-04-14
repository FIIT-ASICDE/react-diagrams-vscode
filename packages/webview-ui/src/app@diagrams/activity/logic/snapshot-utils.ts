import type { Edge, Node } from '@xyflow/react';
import type { PreviewSnapshot } from '../model/types';

export function appendSnapshot(stack: PreviewSnapshot[], snapshot: PreviewSnapshot): PreviewSnapshot[] {
	return [...stack, snapshot];
}

export function truncateSnapshots(stack: PreviewSnapshot[], stackIndex: number): PreviewSnapshot[] {
	if (stackIndex < 0) {
		return [];
	}

	return stack.slice(0, stackIndex + 1);
}

export function updateTopSnapshotNodes(
	stack: PreviewSnapshot[],
	updater: (nodes: Node[]) => Node[],
): PreviewSnapshot[] {
	if (stack.length === 0) {
		return stack;
	}

	const lastIndex = stack.length - 1;
	const lastPreview = stack[lastIndex];

	return [
		...stack.slice(0, lastIndex),
		{
			...lastPreview,
			nodes: updater(lastPreview.nodes),
		},
	];
}

export function updateTopSnapshotEdges(
	stack: PreviewSnapshot[],
	updater: (edges: Edge[]) => Edge[],
): PreviewSnapshot[] {
	if (stack.length === 0) {
		return stack;
	}

	const lastIndex = stack.length - 1;
	const lastPreview = stack[lastIndex];

	return [
		...stack.slice(0, lastIndex),
		{
			...lastPreview,
			edges: updater(lastPreview.edges),
		},
	];
}

export function createTextPreviewSnapshot(title: string, sourceText: string): PreviewSnapshot {
	const lines = sourceText.split(/\r?\n/);
	const longestLineLength = lines.reduce((max, line) => Math.max(max, line.length), 0);
	const previewWidth = Math.min(1100, Math.max(420, longestLineLength * 7 + 60));
	const previewHeight = Math.min(720, Math.max(220, lines.length * 20 + 60));

	return {
		title,
		sourceText,
		nodes: [
			{
				id: `text-preview-${Date.now()}`,
				type: 'textPreview',
				position: { x: 0, y: 0 },
				draggable: true,
				data: {
					label: sourceText,
					previewWidth,
					previewHeight,
				},
			},
		],
		edges: [],
	};
}

export function cacheSnapshot(cache: Map<string, PreviewSnapshot>, snapshot: PreviewSnapshot): void {
	const key = snapshot.sourceText?.trim();
	if (!key) {
		return;
	}

	cache.set(key, snapshot);
}

export function getCachedSnapshot(cache: Map<string, PreviewSnapshot>, sourceText: string): PreviewSnapshot | undefined {
	return cache.get(sourceText.trim());
}
