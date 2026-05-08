import { useCallback, useMemo, useRef, useState } from 'react';
import type {
	Connection,
	Edge,
	EdgeChange,
	Node,
	NodeChange,
	ReactFlowInstance,
} from '@xyflow/react';
import type { ActivityGraphPayload } from '@react-diagrams/core/app@vscode';
import type { ActivityNodeType } from '../model/types';
import type { ViewMode } from '../components/main/Toolbar';
import ElkPathEdge from '../components/diagram/ViewEdge';
import DynamicPathEdge from '../components/diagram/PlaygroundEdge';
import {
	appendNode,
	applyEdgeChangesToEdges,
	applyNodeChangesToNodes,
	centerNodeInViewport,
	connectEdges,
	createActivityNode,
} from '../logic/graph-edit-utils';
import { useDiagramNavigationStore } from '../logic/navigation/use-diagram-navigation-store';

type Params = {
	visibleNodes: Node[];
	visibleEdges: Edge[];
};

const VIEWER_EDGE_TYPES = {
	default: ElkPathEdge,
	back: ElkPathEdge,
};

const PLAYGROUND_EDGE_TYPES = {
	default: DynamicPathEdge,
	back: DynamicPathEdge,
};


// Manages activity playground.
export function useActivityPlayground({
	visibleNodes,
	visibleEdges,
}: Params) {
	const upsertDiagramPayloadBySourceFile = useDiagramNavigationStore(
		(s) => s.upsertDiagramPayloadBySourceFile,
	);
	const [viewMode, setViewMode] = useState<ViewMode>('viewer');
	const [playgroundNodes, setPlaygroundNodes] = useState<Node[]>([]);
	const [playgroundEdges, setPlaygroundEdges] = useState<Edge[]>([]);
	const reactFlowRef = useRef<ReactFlowInstance<Node, Edge> | null>(null);

	const activeNodes = viewMode === 'playground' ? playgroundNodes : visibleNodes;
	const activeEdges = viewMode === 'playground' ? playgroundEdges : visibleEdges;
	const isEditable = viewMode === 'playground';
	const isPlayground = viewMode === 'playground';

	const edgeTypes = useMemo(
		() => (viewMode === 'playground' ? PLAYGROUND_EDGE_TYPES : VIEWER_EDGE_TYPES),
		[viewMode],
	);

	const getActiveGraph = useCallback(
		() => ({
			nodes: viewMode === 'playground' ? playgroundNodes : visibleNodes,
			edges: viewMode === 'playground' ? playgroundEdges : visibleEdges,
		}),
		[playgroundEdges, playgroundNodes, viewMode, visibleEdges, visibleNodes],
	);

	const handleCanvasInit = useCallback((instance: ReactFlowInstance<Node, Edge>) => {
		reactFlowRef.current = instance;
	}, []);

	const addPlaygroundNode = useCallback((type: ActivityNodeType) => {
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
	}, []);

	const clearPlayground = useCallback(() => {
		setPlaygroundNodes([]);
		setPlaygroundEdges([]);
	}, []);

	const commitPlaygroundToViewer = useCallback(() => {
		const { nodes, edges } = getActiveGraph();

		if (!nodes.length && !edges.length) {
			setViewMode('viewer');
			return;
		}

		const sourceFile = 'shapshot';

		void upsertDiagramPayloadBySourceFile({
			nodes,
			edges,
			sourceFile,
		} as ActivityGraphPayload, sourceFile);

		setViewMode('viewer');
	}, [getActiveGraph, upsertDiagramPayloadBySourceFile]);

	const switchToViewer = useCallback(() => {
		if (viewMode === 'playground') {
			commitPlaygroundToViewer();
			return;
		}
		setViewMode('viewer');
	}, [commitPlaygroundToViewer, viewMode]);

	const switchToPlayground = useCallback(() => {
		setViewMode('playground');
	}, []);

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

	return {
		viewMode,
		setViewMode,
		playgroundNodes,
		playgroundEdges,
		setPlaygroundNodes,
		setPlaygroundEdges,
		activeNodes,
		activeEdges,
		isEditable,
		isPlayground,
		edgeTypes,
		getActiveGraph,
		handleCanvasInit,
		reactFlowRef,
		addPlaygroundNode,
		clearPlayground,
		switchToViewer,
		switchToPlayground,
		onNodesChange,
		onEdgesChange,
		onConnect,
	};
}
