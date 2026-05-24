import { useCallback, useEffect, useState } from 'react';
import type { Dispatch, MouseEvent, SetStateAction } from 'react';
import { MarkerType, type Edge, type Node } from '@xyflow/react';
import { getDefaultConstructForNodeType } from '@react-diagrams/core/constructs';
import { toTrimmedNodeLabel } from '../logic/rename-utils';
import type { ModalState } from '../components/main/DiagramModals';
import type { ViewMode } from '../components/main/Toolbar';

type Params = {
	viewMode: ViewMode;
	playgroundEdges: Edge[];
	setPlaygroundNodes: Dispatch<SetStateAction<Node[]>>;
	setPlaygroundEdges: Dispatch<SetStateAction<Edge[]>>;
};


// Returns node data.
function getNodeData(node: Node) {
	const data = (node.data ?? {}) as Record<string, unknown>;

	return {
		label: String(data.label ?? ''),
		sourceText: String(data.sourceText ?? data.label ?? ''),
		deps: typeof data.deps === 'string' ? data.deps : undefined,
	};
}


// Creates node edit draft.
function createNodeEditDraft(node: Node) {
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
		construct: construct ?? getDefaultConstructForNodeType(nodeType, 'action'),
	};
}


// Handles apply edge visual by type.
function applyEdgeVisualByType(edge: Edge, edgeType: 'default' | 'back'): Edge {
	const previousData = (edge.data ?? {}) as Record<string, unknown>;

	if (edgeType === 'back') {
		return {
			...edge,
			type: 'back',
			animated: true,
			style: {
				stroke: 'rgb(200, 0, 0)',
				strokeWidth: 1,
				strokeDasharray: '6 4',
			},
			markerEnd: {
				type: MarkerType.ArrowClosed,
				color: '#000000',
			},
			data: {
				...previousData,
				semanticKind: 'loop-back',
			},
		};
	}

	const semanticKind =
		previousData.semanticKind === 'loop-back' ? 'normal' : previousData.semanticKind;

	return {
		...edge,
		type: 'default',
		animated: false,
		style: {
			stroke: 'rgb(0, 0, 0)',
			strokeWidth: 1,
		},
		markerEnd: {
			type: MarkerType.ArrowClosed,
			color: '#000000',
		},
		data: {
			...previousData,
			...(semanticKind !== undefined ? { semanticKind } : {}),
		},
	};
}


// Manages activity modals.
export function useActivityModals({
	viewMode,
	playgroundEdges,
	setPlaygroundNodes,
	setPlaygroundEdges,
}: Params) {
	const [modalState, setModalState] = useState<ModalState>(null);

	const closeModal = useCallback(() => {
		setModalState(null);
	}, []);

	useEffect(() => {
		
		// Handles handler.
		function handler(event: Event) {
			const detail = (event as CustomEvent<{ edgeId?: unknown; label?: unknown }>).detail;
			if (!detail || typeof detail.edgeId !== 'string') return;
			if (viewMode !== 'playground') return;

			const edge = playgroundEdges.find((candidate) => String(candidate.id) === detail.edgeId);

			setModalState({
				type: 'edgeEdit',
				draft: {
					edgeId: detail.edgeId,
					label: typeof detail.label === 'string' ? detail.label : '',
					edgeType: edge?.type === 'back' ? 'back' : 'default',
				},
			});
		}

		window.addEventListener('activity/edgeLabelContextMenu', handler);
		return () => window.removeEventListener('activity/edgeLabelContextMenu', handler);
	}, [playgroundEdges, viewMode]);

	const onNodeContextMenu = useCallback(
		(event: MouseEvent, node: Node) => {
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
		(event: MouseEvent, edge: Edge) => {
			event.preventDefault();
			event.stopPropagation();
			if (viewMode !== 'playground') return;

			setModalState({
				type: 'edgeEdit',
				draft: {
					edgeId: String(edge.id),
					label: typeof edge.label === 'string' ? edge.label : '',
					edgeType: edge.type === 'back' ? 'back' : 'default',
				},
			});
		},
		[viewMode],
	);

	const onNodeEditChange = useCallback((draft: Extract<ModalState, { type: 'nodeEdit' }>['draft']) => {
		setModalState({ type: 'nodeEdit', draft });
	}, []);

	const onEdgeEditChange = useCallback((draft: Extract<ModalState, { type: 'edgeEdit' }>['draft']) => {
		setModalState({ type: 'edgeEdit', draft });
	}, []);

	const saveNodeEditDraft = useCallback(() => {
		if (!modalState || modalState.type !== 'nodeEdit') return;
		const { draft } = modalState;
		const label = toTrimmedNodeLabel(draft.sourceText);

		setPlaygroundNodes((nodes) =>
			nodes.map((node) => {
				if (String(node.id) !== draft.nodeId) return node;
				const previousData = (node.data as Record<string, unknown> | undefined) ?? {};
				const constructUpdate = {
					construct: draft.construct ?? getDefaultConstructForNodeType(draft.nodeType, 'action'),
				};

				return {
					...node,
					data: {
						...previousData,
						label,
						sourceText: draft.sourceText,
						...(draft.deps !== undefined ? { deps: draft.deps } : {}),
						...constructUpdate,
					},
				};
			}),
		);

		setModalState(null);
	}, [modalState, setPlaygroundNodes]);

	const saveEdgeEditDraft = useCallback(() => {
		if (!modalState || modalState.type !== 'edgeEdit') return;
		const { draft } = modalState;

		setPlaygroundEdges((edges) =>
			edges.map((edge) =>
				String(edge.id) === draft.edgeId
					? {
						...applyEdgeVisualByType(edge, draft.edgeType),
						label: draft.label,
					}
					: edge,
			),
		);

		setModalState(null);
	}, [modalState, setPlaygroundEdges]);

	return {
		modalState,
		setModalState,
		closeModal,
		onNodeContextMenu,
		onEdgeContextMenu,
		onNodeEditChange,
		onEdgeEditChange,
		saveNodeEditDraft,
		saveEdgeEditDraft,
	};
}
