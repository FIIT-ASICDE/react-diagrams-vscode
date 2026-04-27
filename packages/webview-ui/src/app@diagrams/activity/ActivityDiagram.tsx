import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
	type Connection,
	type Edge,
	type EdgeChange,
	type Node,
	type NodeChange,
	type ReactFlowInstance,
} from '@xyflow/react';

import { vscode } from '../../app@vscode/api';
import type { ActivityGraphPayload } from '@react-diagrams/core/app@vscode';
import type { ActivityNodeType } from './model/types';

import { nodeTypes } from './components/diagram/nodeTypes';
import ElkPathEdge from './components/diagram/ViewEdge';
import DynamicPathEdge from './components/diagram/PlaygroundEdge';
import { applyPlaygroundElkLayout } from './diagram-rendering/elk-layout';
import { generateCodeFromDiagram } from './logic/diagram-code-generation';
import { useDiagramNavigationStore } from './logic/navigation/use-diagram-navigation-store';
import {
	appendNode,
	applyEdgeChangesToEdges,
	applyNodeChangesToNodes,
	centerNodeInViewport,
	connectEdges,
	createActivityNode,
} from './logic/graph-edit-utils';

import { useActivityMessages } from './logic/use-activity-messages';
import { useImageCapture } from './logic/use-image-capture';
import { DiagramToolbar, type ViewMode } from './components/main/Toolbar';
import { DiagramCanvas } from './components/main/DiagramCanvas';
import { DiagramModals, type ModalState } from './components/main/DiagramModals';
import type { NodeEditDraft, EdgeEditDraft } from './components/modals/rename-dialog';


const VIEWER_NODE_TYPES = nodeTypes;

const VIEWER_EDGE_TYPES = {
	default: ElkPathEdge,
	back: ElkPathEdge,
};

const PLAYGROUND_EDGE_TYPES = {
	default: DynamicPathEdge,
	back: DynamicPathEdge,
};

// ─── Utilities ──────────────────────────────────────────────────────────────

function truncate(text: string, maxLength: number) {
	return text.length <= maxLength ? text : `${text.slice(0, maxLength - 3)}...`;
}

function getNodeData(node: Node) {
	const data = (node.data ?? {}) as Record<string, unknown>;

	return {
		label: String(data.label ?? ''),
		sourceText: String(data.sourceText ?? data.label ?? ''),
		deps: typeof data.deps === 'string' ? data.deps : undefined,
	};
}

function getDefaultConstructForNodeType(nodeType: string): string {
	switch (nodeType) {
		case 'decision':
			return 'if';
		case 'loop':
			return 'while';
		case 'expandable':
			return 'function';
		default:
			return 'action';
	}
}

function createNodeEditDraft(node: Node): NodeEditDraft {
	const data = (node.data ?? {}) as Record<string, unknown>;
	const nodeData = getNodeData(node);
	const nodeType = String(node.type ?? 'action');
	const construct = typeof data.construct === 'string' ? data.construct : undefined;
	return {
		nodeId: String(node.id),
		nodeType,
		label: nodeData.label,
		sourceText: nodeData.sourceText,
		deps: nodeData.deps,
		construct: construct ?? getDefaultConstructForNodeType(nodeType),
	};
}

function buildErrorGraph(message: string): { nodes: Node[]; edges: Edge[] } {
	return {
		nodes: [
			{ id: 'n1', position: { x: 0, y: 0 }, data: { label: 'Activity diagram error' } },
			{ id: 'n2', position: { x: 0, y: 100 }, data: { label: truncate(message, 80) } },
		],
		edges: [{ id: 'n1-n2', source: 'n1', target: 'n2' }],
	};
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function ActivityDiagram() {
	const [viewMode, setViewMode] = useState<ViewMode>('viewer');

	const [playgroundNodes, setPlaygroundNodes] = useState<Node[]>([]);
	const [playgroundEdges, setPlaygroundEdges] = useState<Edge[]>([]);

	const [modalState, setModalState] = useState<ModalState>(null);

	const reactFlowRef = useRef<ReactFlowInstance<Node, Edge> | null>(null);
	const playgroundSnapshotDepthRef = useRef<number | null>(null);
	const playgroundSnapshotSourceFileRef = useRef<string | null>(null);

	const stack = useDiagramNavigationStore((s) => s.stack);
	const currentIndex = useDiagramNavigationStore((s) => s.currentIndex);
	const visibleRevision = useDiagramNavigationStore((s) => s.visibleRevision);
	const applyIncomingDiagramPayload = useDiagramNavigationStore((s) => s.applyIncomingDiagramPayload);
	const replaceCurrentDiagramPayload = useDiagramNavigationStore((s) => s.replaceCurrentDiagramPayload);
	const setRootError = useDiagramNavigationStore((s) => s.setRootError);
	const markPendingPreview = useDiagramNavigationStore((s) => s.markPendingPreview);
	const clearPendingPreview = useDiagramNavigationStore((s) => s.clearPendingPreview);
	const goBack = useDiagramNavigationStore((s) => s.goBack);

	const currentDiagram = stack[currentIndex];
	const visibleNodes = currentDiagram?.nodes ?? [];
	const visibleEdges = currentDiagram?.edges ?? [];
	const currentTitle = currentDiagram?.title ?? 'Diagram';
	const canGoBack = currentIndex > 0;

	const activeNodes = viewMode === 'playground' ? playgroundNodes : visibleNodes;
	const activeEdges = viewMode === 'playground' ? playgroundEdges : visibleEdges;
	const isEditable = viewMode === 'playground';
	const isPlayground = viewMode === 'playground';

	const getActiveGraph = useCallback(
		() => ({
			nodes: viewMode === 'playground' ? playgroundNodes : visibleNodes,
			edges: viewMode === 'playground' ? playgroundEdges : visibleEdges,
		}),
		[playgroundEdges, playgroundNodes, viewMode, visibleEdges, visibleNodes],
	);

	const edgeTypes = useMemo(
		() =>
			viewMode === 'playground'
				? PLAYGROUND_EDGE_TYPES
				: VIEWER_EDGE_TYPES,
		[viewMode],
	);

	const postMessage = useCallback((type: string, data: unknown = {}) => {
		vscode.postMessage(type, data);
	}, []);

	const captureImage = useImageCapture();

	// ── Incoming messages from extension host ────────────────────────────

	const handleCodeData = useCallback(
		(payload: ActivityGraphPayload) => {
			void applyIncomingDiagramPayload(payload);
		},
		[applyIncomingDiagramPayload],
	);

	const handleCodeError = useCallback(
		(message: string) => {
			const { nodes, edges } = buildErrorGraph(message);
			setRootError(nodes, edges);
			clearPendingPreview();
		},
		[clearPendingPreview, setRootError],
	);

	const handleImageRequest = useCallback(async () => {
		try {
			const dataUrl = await captureImage();
			postMessage('diagram/imageData', { dataUrl });
		} catch (error) {
			postMessage('diagram/imageData', {
				dataUrl: null,
				error: error instanceof Error ? error.message : 'Image capture failed',
			});
		}
	}, [captureImage, postMessage]);

	const handleGraphRequest = useCallback(() => {
		const { nodes, edges } = getActiveGraph();
		postMessage('diagram/graphSnapshot', { nodes, edges });
	}, [getActiveGraph, postMessage]);

	useActivityMessages({
		onCodeData: handleCodeData,
		onCodeError: handleCodeError,
		onImageRequest: handleImageRequest,
		onGraphRequest: handleGraphRequest,
	});

	// Ready handshake — post once on mount.
	useEffect(() => {
		postMessage('webview/ready');
	}, [postMessage]);

	// Edge-label context menu (custom event from the BackEdge label).
	useEffect(() => {
		function handler(event: Event) {
			const detail = (event as CustomEvent<{ edgeId?: unknown; label?: unknown }>).detail;
			if (!detail || typeof detail.edgeId !== 'string') return;
			if (viewMode !== 'playground') return;

			setModalState({
				type: 'edgeEdit',
				draft: {
					edgeId: detail.edgeId,
					label: typeof detail.label === 'string' ? detail.label : '',
				},
			});
		}

		window.addEventListener('activity/edgeLabelContextMenu', handler);
		return () => window.removeEventListener('activity/edgeLabelContextMenu', handler);
	}, [viewMode]);

	// ── Viewer-side: drilldown ───────────────────────────────────────────

	const openNodeDiagram = useCallback(
		(node: Node) => {
			if (viewMode !== 'viewer') return;
			if (String(node.type ?? 'action') !== 'expandable') return;

			const data = (node.data ?? {}) as Record<string, unknown>;
			const sourceText = String(data.sourceText ?? data.label ?? '').trim();
			if (!sourceText) return;

			const title = String(
				(node.data as { label?: unknown } | undefined)?.label ?? 'Expanded Diagram',
			);
			markPendingPreview(title);
			postMessage('code/nodePreview', { title, sourceText });
		},
		[markPendingPreview, postMessage, viewMode],
	);

	// ── Playground-side: editing ─────────────────────────────────────────

	const addPlaygroundNode = useCallback(
		(type: ActivityNodeType) => {
			setPlaygroundNodes((nodes) => {
				const currentNodeIndex = nodes.length + 1;
				const node = centerNodeInViewport(
				createActivityNode(type, currentNodeIndex, false),
					reactFlowRef.current,
					window.innerWidth,
					window.innerHeight,
				);
				return appendNode(nodes, node);
			});
		},
		[],
	);

	const clearPlayground = useCallback(() => {
		setPlaygroundNodes([]);
		setPlaygroundEdges([]);
		setModalState(null);
	}, []);

	const openPlaygroundWithGraph = useCallback(async (nodes: Node[], edges: Edge[]) => {
		let layoutedNodes = nodes;
		let layoutedEdges = edges;
		try {
			const layouted = await applyPlaygroundElkLayout(nodes, edges);
			layoutedNodes = layouted.nodes;
			layoutedEdges = layouted.edges;
		} catch (error) {
			console.error('Failed to apply activity ELK layout when opening playground', error);
		}

		setPlaygroundNodes(layoutedNodes);
		setPlaygroundEdges(layoutedEdges);
		setModalState(null);
		setViewMode('playground');
	}, []);

	const loadCurrentIntoPlayground = useCallback(async () => {
		playgroundSnapshotDepthRef.current = null;
		playgroundSnapshotSourceFileRef.current = null;
		const cloneNodes = visibleNodes.map((node) => ({ ...node }));
		const cloneEdges = visibleEdges.map((edge) => ({ ...edge }));
		await openPlaygroundWithGraph(cloneNodes, cloneEdges);
	}, [openPlaygroundWithGraph, visibleEdges, visibleNodes]);

	const commitPlaygroundToViewer = useCallback(() => {
		const { nodes, edges } = getActiveGraph();

		setModalState(null);

		if (!nodes.length && !edges.length) {
			setViewMode('viewer');
			return;
		}

		// Read current navigation state directly from the store (avoids stale closure).
		const { stack: navStack, currentIndex: navIndex } = useDiagramNavigationStore.getState();
		const effectiveDepth = navIndex + 1;
		const currentTop = navStack[navIndex];

		const canReplaceCurrentPlaygroundSnapshot =
			playgroundSnapshotDepthRef.current !== null &&
			effectiveDepth === playgroundSnapshotDepthRef.current &&
			playgroundSnapshotSourceFileRef.current !== null &&
			currentTop?.sourceFile === playgroundSnapshotSourceFileRef.current;

		if (canReplaceCurrentPlaygroundSnapshot) {
			void replaceCurrentDiagramPayload({
				nodes,
				edges,
				sourceFile: playgroundSnapshotSourceFileRef.current ?? undefined,
			} as ActivityGraphPayload);
		} else {
			const snapshotIndex = effectiveDepth + 1;
			const sourceFile = `Playground Snapshot ${snapshotIndex}.tsx`;
			playgroundSnapshotDepthRef.current = effectiveDepth + 1;
			playgroundSnapshotSourceFileRef.current = sourceFile;

			void applyIncomingDiagramPayload({
				nodes,
				edges,
				sourceFile,
			} as ActivityGraphPayload);
		}

		setViewMode('viewer');
	}, [applyIncomingDiagramPayload, getActiveGraph, replaceCurrentDiagramPayload]);

	const switchToViewer = useCallback(() => {
		if (viewMode === 'playground') {
			commitPlaygroundToViewer();
			return;
		}
		setModalState(null);
		setViewMode('viewer');
	}, [commitPlaygroundToViewer, viewMode]);

	const switchToPlayground = useCallback(() => {
		void openPlaygroundWithGraph(playgroundNodes, playgroundEdges);
	}, [openPlaygroundWithGraph, playgroundEdges, playgroundNodes]);

	// ── Save handlers for the dialogs ────────────────────────────────────

	const saveNodeEditDraft = useCallback(() => {
		if (!modalState || modalState.type !== 'nodeEdit') return;
		const { draft } = modalState;
		setPlaygroundNodes((nodes) => {
			const next = nodes.map((node) => {
				if (String(node.id) !== draft.nodeId) return node;
				const previousData = (node.data as Record<string, unknown> | undefined) ?? {};
				const constructUpdate = {
					construct: draft.construct ?? getDefaultConstructForNodeType(draft.nodeType),
				};
				return {
					...node,
					data: {
						...previousData,
						label: draft.label,
						sourceText: draft.sourceText,
						...(draft.deps !== undefined ? { deps: draft.deps } : {}),
						...constructUpdate,
					},
				};
			});
			return next;
		});
		setModalState(null);
	}, [modalState]);

	const saveEdgeEditDraft = useCallback(() => {
		if (!modalState || modalState.type !== 'edgeEdit') return;
		const { draft } = modalState;
		setPlaygroundEdges((edges) => {
			const next = edges.map((edge) =>
				String(edge.id) === draft.edgeId ? { ...edge, label: draft.label } : edge,
			);
			return next;
		});
		setModalState(null);
	}, [modalState]);

	// ── ReactFlow event handlers ─────────────────────────────────────────

	const onNodeClick = useCallback(
		(_event: React.MouseEvent, node: Node) => {
			if (viewMode !== 'viewer') return;
			if (String(node.type ?? 'action') === 'expandable') {
				openNodeDiagram(node);
			}
		},
		[openNodeDiagram, viewMode],
	);

	const onNodeContextMenu = useCallback(
		(event: React.MouseEvent, node: Node) => {
			event.preventDefault();
			event.stopPropagation();

			if (viewMode === 'viewer') {
				setModalState({ type: 'preview', node });
				return;
			}
			setModalState({ type: 'nodeEdit', draft: createNodeEditDraft(node) });
		},
		[viewMode],
	);

	const onEdgeContextMenu = useCallback(
		(event: React.MouseEvent, edge: Edge) => {
			event.preventDefault();
			event.stopPropagation();
			if (viewMode !== 'playground') return;

			setModalState({
				type: 'edgeEdit',
				draft: {
					edgeId: String(edge.id),
					label: typeof edge.label === 'string' ? edge.label : '',
				},
			});
		},
		[viewMode],
	);

	const onNodesChange = useCallback(
		(changes: NodeChange<Node>[]) => {
			if (viewMode !== 'playground') return;
			setPlaygroundNodes((nodes) => applyNodeChangesToNodes(nodes, changes));
		},
		[viewMode],
	);

	const onEdgesChange = useCallback(
		(changes: EdgeChange<Edge>[]) => {
			if (viewMode !== 'playground') return;
			setPlaygroundEdges((edges) => applyEdgeChangesToEdges(edges, changes));
		},
		[viewMode],
	);

	const onConnect = useCallback(
		(params: Connection) => {
			if (viewMode !== 'playground') return;
			setPlaygroundEdges((edges) => connectEdges(edges, params));
		},
		[viewMode],
	);

	// ── Generate skeleton ────────────────────────────────────────────────

	const generateSkeleton = useCallback(() => {
		const { nodes, edges } = getActiveGraph();
		generateCodeFromDiagram(vscode, nodes, edges);
	}, [getActiveGraph]);

	// ── Render ───────────────────────────────────────────────────────────

	const focusTrigger = `${viewMode}:${viewMode === 'viewer' ? visibleRevision : 'mode'}`;

	const handleCanvasInit = useCallback((instance: ReactFlowInstance<Node, Edge>) => {
		reactFlowRef.current = instance;
	}, []);

	return (
		<div className="relative h-full w-full">
			<DiagramToolbar
				mode={viewMode}
				currentTitle={currentTitle}
				canGoBack={canGoBack}
				onBack={goBack}
				onSwitchToViewer={switchToViewer}
				onSwitchToPlayground={switchToPlayground}
				onLoadCurrentIntoPlayground={loadCurrentIntoPlayground}
				onAddNode={addPlaygroundNode}
				onClearPlayground={clearPlayground}
				onGenerateSkeleton={generateSkeleton}
			/>

			<DiagramModals
				modalState={modalState}
				viewMode={viewMode}
				onClose={() => setModalState(null)}
				onNodeEditChange={(draft) => setModalState({ type: 'nodeEdit', draft })}
				onNodeEditSave={saveNodeEditDraft}
				onEdgeEditChange={(draft) => setModalState({ type: 'edgeEdit', draft })}
				onEdgeEditSave={saveEdgeEditDraft}
			/>

			<DiagramCanvas
				nodes={activeNodes}
				edges={activeEdges}
				isEditable={isEditable}
				isPlayground={isPlayground}
				edgeTypes={edgeTypes}
				nodeTypes={VIEWER_NODE_TYPES}
				focusTrigger={focusTrigger}
				onInit={handleCanvasInit}
				onNodeClick={onNodeClick}
				onNodeContextMenu={onNodeContextMenu}
				onEdgeContextMenu={onEdgeContextMenu}
				onNodesChange={isPlayground ? onNodesChange : undefined}
				onEdgesChange={isPlayground ? onEdgesChange : undefined}
				onConnect={isPlayground ? onConnect : undefined}
			/>
		</div>
	);
}