import { create } from 'zustand';
import type { Edge, Node } from '@xyflow/react';
import type { ActivityGraphPayload } from '@react-diagrams/core/app@vscode';
import { applyActivityElkLayout } from '../../diagram-rendering/elk-layout';


export type DiagramViewItem = {
	title: string;
	sourceFile?: string;
	sourceText?: string;
	nodes: Node[];
	edges: Edge[];
};




// Handles file name from path.
function fileNameFromPath(sourceFile?: string): string | undefined {
	if (!sourceFile) return undefined;
	return sourceFile.replace(/\\/g, '/').split('/').pop();
}


// Handles pick title.
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


// Handles layout or pass through.
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



type DiagramNavigationState = {
	stack: DiagramViewItem[];
	
	currentIndex: number;
	pendingPreviewTitle?: string;
	visibleRevision: number;

	applyIncomingDiagramPayload: (payload: ActivityGraphPayload) => Promise<Node[]>;
	upsertDiagramPayloadBySourceFile: (
		payload: ActivityGraphPayload,
		sourceFile: string,
	) => Promise<Node[]>;
	replaceCurrentDiagramPayload: (payload: ActivityGraphPayload) => Promise<Node[]>;
	setRootError: (nodes: Node[], edges: Edge[]) => void;
	markPendingPreview: (title: string) => void;
	clearPendingPreview: () => void;
	goBack: () => void;
	reset: () => void;
};

export const useDiagramNavigationStore = create<DiagramNavigationState>((set, get) => ({
	stack: [],
	currentIndex: -1,
	pendingPreviewTitle: undefined,
	visibleRevision: 0,

	applyIncomingDiagramPayload: async (payload) => {
		const incomingNodes = Array.isArray(payload.nodes) ? (payload.nodes as Node[]) : [];
		const incomingEdges = Array.isArray(payload.edges) ? (payload.edges as Edge[]) : [];

		const layouted = await layoutOrPassThrough(incomingNodes, incomingEdges);

		const payloadWithSource = payload as ActivityGraphPayload & { sourceText?: unknown };

		
		const { stack, currentIndex, pendingPreviewTitle, visibleRevision } = get();

		
		
		const base = stack.slice(0, currentIndex + 1);

		const entry: DiagramViewItem = {
			title: pickTitle(payload, pendingPreviewTitle, base.length),
			sourceFile: typeof payload.sourceFile === 'string' ? payload.sourceFile : undefined,
			sourceText:
				typeof payloadWithSource.sourceText === 'string'
					? payloadWithSource.sourceText
					: undefined,
			nodes: layouted.nodes,
			edges: layouted.edges,
		};

		const newStack = [...base, entry];

		set({
			stack: newStack,
			currentIndex: newStack.length - 1,
			pendingPreviewTitle: undefined,
			visibleRevision: visibleRevision + 1,
		});

		return layouted.nodes;
	},

	upsertDiagramPayloadBySourceFile: async (payload, sourceFile) => {
		const incomingNodes = Array.isArray(payload.nodes) ? (payload.nodes as Node[]) : [];
		const incomingEdges = Array.isArray(payload.edges) ? (payload.edges as Edge[]) : [];

		const layouted = await layoutOrPassThrough(incomingNodes, incomingEdges);

		const payloadWithSource = payload as ActivityGraphPayload & { sourceText?: unknown };
		const normalizedSourceFile = sourceFile.trim();

		
		const { stack, currentIndex, pendingPreviewTitle, visibleRevision } = get();

		const base = stack.slice(0, currentIndex + 1);

		const entry: DiagramViewItem = {
			title: pickTitle(
				{ ...payload, sourceFile: normalizedSourceFile } as ActivityGraphPayload,
				pendingPreviewTitle,
				base.length,
			),
			sourceFile: normalizedSourceFile,
			sourceText:
				typeof payloadWithSource.sourceText === 'string'
					? payloadWithSource.sourceText
					: undefined,
			nodes: layouted.nodes,
			edges: layouted.edges,
		};

		const existingIndex = base.findIndex((item) => item.sourceFile === normalizedSourceFile);
		let newStack: DiagramViewItem[];
		let newCurrentIndex: number;

		if (existingIndex >= 0) {
			newStack = [...base];
			newStack[existingIndex] = entry;
			newCurrentIndex = existingIndex;
		} else {
			newStack = [...base, entry];
			newCurrentIndex = newStack.length - 1;
		}

		set({
			stack: newStack,
			currentIndex: newCurrentIndex,
			pendingPreviewTitle: undefined,
			visibleRevision: visibleRevision + 1,
		});

		return layouted.nodes;
	},

	replaceCurrentDiagramPayload: async (payload) => {
		const incomingNodes = Array.isArray(payload.nodes) ? (payload.nodes as Node[]) : [];
		const incomingEdges = Array.isArray(payload.edges) ? (payload.edges as Edge[]) : [];

		const layouted = await layoutOrPassThrough(incomingNodes, incomingEdges);

		const payloadWithSource = payload as ActivityGraphPayload & { sourceText?: unknown };

		
		const { stack, currentIndex, pendingPreviewTitle, visibleRevision } = get();

		if (stack.length === 0) {
			const fallbackEntry: DiagramViewItem = {
				title: pickTitle(payload, pendingPreviewTitle, 0),
				sourceFile: typeof payload.sourceFile === 'string' ? payload.sourceFile : undefined,
				sourceText:
					typeof payloadWithSource.sourceText === 'string'
						? payloadWithSource.sourceText
						: undefined,
				nodes: layouted.nodes,
				edges: layouted.edges,
			};

			set({
				stack: [fallbackEntry],
				currentIndex: 0,
				pendingPreviewTitle: undefined,
				visibleRevision: visibleRevision + 1,
			});

			return layouted.nodes;
		}

		const current = stack[currentIndex];
		const updated: DiagramViewItem = {
			...current,
			sourceFile:
				typeof payload.sourceFile === 'string' ? payload.sourceFile : current.sourceFile,
			sourceText:
				typeof payloadWithSource.sourceText === 'string'
					? payloadWithSource.sourceText
					: current.sourceText,
			nodes: layouted.nodes,
			edges: layouted.edges,
		};

		const newStack = [...stack];
		newStack[currentIndex] = updated;

		set({
			stack: newStack,
			pendingPreviewTitle: undefined,
			visibleRevision: visibleRevision + 1,
		});

		return layouted.nodes;
	},

	setRootError: (nodes, edges) => {
		set((state) => ({
			stack: [{ title: 'Root Error', nodes, edges }],
			currentIndex: 0,
			visibleRevision: state.visibleRevision + 1,
		}));
	},

	markPendingPreview: (title) => {
		set({ pendingPreviewTitle: title });
	},

	clearPendingPreview: () => {
		set({ pendingPreviewTitle: undefined });
	},

	goBack: () => {
		set((state) => {
			if (state.currentIndex <= 0) return {};
			return {
				currentIndex: state.currentIndex - 1,
				visibleRevision: state.visibleRevision + 1,
			};
		});
	},

	reset: () => {
		set({ stack: [], currentIndex: -1, pendingPreviewTitle: undefined, visibleRevision: 0 });
	},
}));
