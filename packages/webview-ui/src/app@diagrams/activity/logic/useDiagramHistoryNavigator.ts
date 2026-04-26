import { useCallback, useRef, useState } from 'react';
import type { Edge, Node } from '@xyflow/react';
import type { ActivityGraphPayload } from '@react-diagrams/core/app@vscode';
import { applyActivityElkLayout } from '../diagram-rendering/elk-layout';

/**
 * One entry in the diagram history stack.
 *
 *   - root: the diagram for the file the user is looking at
 *   - children: diagrams produced by drilling into an expandable node;
 *     each child is layered on top of its parent in the stack
 */
export type DiagramViewItem = {
	title: string;
	sourceFile?: string;
	sourceText?: string;
	nodes: Node[];
	edges: Edge[];
};

function fileNameFromPath(sourceFile?: string): string | undefined {
	if (!sourceFile) return undefined;
	return sourceFile.replace(/\\/g, '/').split('/').pop();
}

function pickTitle(
	payload: ActivityGraphPayload,
	pendingTitle: string | undefined,
	stackDepth: number,
): string {
	const trimmed = pendingTitle?.trim();
	if (trimmed) return trimmed;

	const sourceFile = typeof payload.sourceFile === 'string' ? payload.sourceFile : '';
	const fileName = fileNameFromPath(sourceFile);

	if (stackDepth === 0) {
		return fileName ? `Root: ${fileName}` : 'Root Diagram';
	}
	return fileName ?? `Expanded ${stackDepth}`;
}

async function layoutOrPassThrough(
	nodes: Node[],
	edges: Edge[],
): Promise<{ nodes: Node[]; edges: Edge[] }> {
	try {
		return await applyActivityElkLayout(nodes, edges);
	} catch (error) {
		console.error('Failed to apply activity ELK layout in webview', error);
		return { nodes, edges };
	}
}

/**
 * Read-only, drilldown-style navigator for the View panel.
 *
 * The user can step INTO an expandable node (each step pushes a new entry
 * onto the stack) and step BACK (pop). There is no editing of nodes or
 * edges here — that lives in the Playground. Therefore there is no
 * sync-back-to-parent step on goBack: each entry is an independent
 * snapshot of what the parser produced.
 */
export function useDiagramReadOnlyNavigator() {
	const [stack, setStack] = useState<DiagramViewItem[]>([]);
	const [visibleRevision, setVisibleRevision] = useState(0);
	const stackRef = useRef<DiagramViewItem[]>([]);
	const pendingPreviewTitleRef = useRef<string | undefined>(undefined);

	const currentIndex = Math.max(0, stack.length - 1);
	const currentDiagram = stack[currentIndex];
	const visibleNodes = currentDiagram?.nodes ?? [];
	const visibleEdges = currentDiagram?.edges ?? [];
	const currentTitle = currentDiagram?.title ?? 'Diagram';

	const applyIncomingDiagramPayload = useCallback(async (payload: ActivityGraphPayload) => {
		const incomingNodes = Array.isArray(payload.nodes) ? (payload.nodes as Node[]) : [];
		const incomingEdges = Array.isArray(payload.edges) ? (payload.edges as Edge[]) : [];

		const layouted = await layoutOrPassThrough(incomingNodes, incomingEdges);

		const payloadWithSource = payload as ActivityGraphPayload & { sourceText?: unknown };

		const entry: DiagramViewItem = {
			title: pickTitle(payload, pendingPreviewTitleRef.current, stackRef.current.length),
			sourceFile: typeof payload.sourceFile === 'string' ? payload.sourceFile : undefined,
			sourceText:
				typeof payloadWithSource.sourceText === 'string'
					? payloadWithSource.sourceText
					: undefined,
			nodes: layouted.nodes,
			edges: layouted.edges,
		};

		setStack((previous) => {
			const next = [...previous, entry];
			stackRef.current = next;
			setVisibleRevision((value) => value + 1);
			return next;
		});

		pendingPreviewTitleRef.current = undefined;
		return layouted.nodes;
	}, []);

	const replaceCurrentDiagramPayload = useCallback(async (payload: ActivityGraphPayload) => {
		const incomingNodes = Array.isArray(payload.nodes) ? (payload.nodes as Node[]) : [];
		const incomingEdges = Array.isArray(payload.edges) ? (payload.edges as Edge[]) : [];

		const layouted = await layoutOrPassThrough(incomingNodes, incomingEdges);
		const payloadWithSource = payload as ActivityGraphPayload & { sourceText?: unknown };

		setStack((previous) => {
			if (previous.length === 0) {
				const fallbackEntry: DiagramViewItem = {
					title: pickTitle(payload, pendingPreviewTitleRef.current, 0),
					sourceFile: typeof payload.sourceFile === 'string' ? payload.sourceFile : undefined,
					sourceText:
						typeof payloadWithSource.sourceText === 'string'
							? payloadWithSource.sourceText
							: undefined,
					nodes: layouted.nodes,
					edges: layouted.edges,
				};
				const next = [fallbackEntry];
				stackRef.current = next;
				setVisibleRevision((value) => value + 1);
				return next;
			}

			const current = previous[previous.length - 1];
			const updated: DiagramViewItem = {
				...current,
				sourceFile: typeof payload.sourceFile === 'string' ? payload.sourceFile : current.sourceFile,
				sourceText:
					typeof payloadWithSource.sourceText === 'string'
						? payloadWithSource.sourceText
						: current.sourceText,
				nodes: layouted.nodes,
				edges: layouted.edges,
			};

			const next = [...previous];
			next[next.length - 1] = updated;
			stackRef.current = next;
			setVisibleRevision((value) => value + 1);
			return next;
		});

		pendingPreviewTitleRef.current = undefined;
		return layouted.nodes;
	}, []);

	const setRootError = useCallback((nodes: Node[], edges: Edge[]) => {
		const next: DiagramViewItem[] = [{ title: 'Root Error', nodes, edges }];
		stackRef.current = next;
		setStack(next);
		setVisibleRevision((value) => value + 1);
	}, []);

	const markPendingPreview = useCallback((title: string) => {
		pendingPreviewTitleRef.current = title;
	}, []);

	const clearPendingPreview = useCallback(() => {
		pendingPreviewTitleRef.current = undefined;
	}, []);

	const goBack = useCallback(() => {
		setStack((previous) => {
			if (previous.length <= 1) return previous;
			const next = previous.slice(0, -1);
			stackRef.current = next;
			setVisibleRevision((value) => value + 1);
			return next;
		});
	}, []);

	return {
		stack,
		stackRef,
		currentIndex,
		canGoBack: stack.length > 1,
		currentDiagram,
		visibleRevision,
		visibleNodes,
		visibleEdges,
		currentTitle,
		applyIncomingDiagramPayload,
		replaceCurrentDiagramPayload,
		setRootError,
		markPendingPreview,
		clearPendingPreview,
		goBack,
	};
}