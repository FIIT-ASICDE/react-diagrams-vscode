import {
	addEdge,
	applyEdgeChanges,
	applyNodeChanges,
	MarkerType,
	type Connection,
	type Edge,
	type EdgeChange,
	type Node,
	type NodeChange,
	type ReactFlowInstance,
} from '@xyflow/react';
import { nanoid } from 'nanoid';
import type { ActivityNodeType } from '../model/types';

const DEFAULT_LABEL_BY_TYPE: Record<ActivityNodeType, string> = {
	start: 'Start',
	action: 'Action',
	expandable: 'Expandable',
	decision: 'Condition',
	merge: 'Merge',
	end: 'End',
	loop: 'Loop',
};

const EXPANDABLE_DEFAULT_SOURCE = 'function name() {\n  // TODO\n}';

function getDefaultConstructForNodeType(type: ActivityNodeType): string {
	switch (type) {
		case 'decision':
			return 'if';
		case 'loop':
			return 'while';
		case 'expandable':
			return 'function';
		default:
			return 'unknown';
	}
}

export function createActivityNode(
	type: ActivityNodeType,
	currentIndex: number,
	previewMode = false,
): Node {
	const idPrefix = previewMode ? 'preview' : type;
	const renderType = type === 'start' ? 'initial' : type;

	return {
		id: `${idPrefix}-${nanoid(10)}`,
		type: renderType,
		draggable: true,
		position: {
			x: 80 + (currentIndex % 4) * 220,
			y: 80 + Math.floor(currentIndex / 4) * 120,
		},
		data: {
			label: `${DEFAULT_LABEL_BY_TYPE[type]} ${currentIndex}`,
			construct: getDefaultConstructForNodeType(type),
			...(type === 'expandable' ? { sourceText: EXPANDABLE_DEFAULT_SOURCE } : {}),
		},
	};
}

/**
 * Place a freshly-created node roughly in the middle of the visible
 * viewport. If we don't have a ReactFlow instance yet (very early mount,
 * tests), we leave the node at its default position.
 */
export function centerNodeInViewport(
	node: Node,
	reactFlow: ReactFlowInstance<Node, Edge> | null,
	viewportWidth: number,
	viewportHeight: number,
): Node {
	if (!reactFlow) return node;

	const center = reactFlow.screenToFlowPosition({
		x: viewportWidth / 2,
		y: viewportHeight / 2,
	});

	return {
		...node,
		position: { x: center.x - 100, y: center.y - 30 },
	};
}

export function appendNode(nodes: Node[], node: Node): Node[] {
	return [...nodes, node];
}

export function applyNodeChangesToNodes(nodes: Node[], changes: NodeChange<Node>[]): Node[] {
	return applyNodeChanges(changes, nodes);
}

export function applyEdgeChangesToEdges(edges: Edge[], changes: EdgeChange<Edge>[]): Edge[] {
	return applyEdgeChanges(changes, edges);
}

export function connectEdges(edges: Edge[], params: Connection): Edge[] {
	return addEdge(
		{
			...params,
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
		},
		edges,
	);
}