import {
	addEdge,
	applyEdgeChanges,
	applyNodeChanges,
	type Connection,
	type Edge,
	type EdgeChange,
	type Node,
	type NodeChange,
	type ReactFlowInstance,
} from '@xyflow/react';
import { updateTopSnapshotEdges, updateTopSnapshotNodes } from './snapshot-utils';
import type { ActivityNodeType, PreviewSnapshot } from '../model/types';

const defaultLabelByType: Record<ActivityNodeType, string> = {
	start: 'Start',
	action: 'Action',
	expandable: 'Expandable',
	decision: 'Condition',
	merge: 'Merge',
	end: 'End',
};

export function createActivityNode(type: ActivityNodeType, currentIndex: number, previewMode = false): Node {
	const idPrefix = previewMode ? 'preview' : type;
	const renderType = type === 'start' ? 'initial' : type;

	return {
		id: `${idPrefix}-${currentIndex}`,
		type: renderType,
		draggable: true,
		position: { x: 80 + (currentIndex % 4) * 220, y: 80 + Math.floor(currentIndex / 4) * 120 },
		data: {
			label: `${defaultLabelByType[type]} ${currentIndex}`,
			...(type === 'expandable' ? { sourceText: '// Add previewable source code here' } : {}),
		},
	};
}

export function centerNodeInViewport(
	node: Node,
	reactFlow: ReactFlowInstance<Node, Edge> | null,
	viewportWidth: number,
	viewportHeight: number,
): Node {
	if (!reactFlow) {
		return node;
	}

	const center = reactFlow.screenToFlowPosition({
		x: viewportWidth / 2,
		y: viewportHeight / 2,
	});

	return {
		...node,
		position: {
			x: center.x - 100,
			y: center.y - 30,
		},
	};
}

export function appendNode(nodes: Node[], node: Node): Node[] {
	return [...nodes, node];
}

export function appendNodeToTopSnapshot(stack: PreviewSnapshot[], node: Node): PreviewSnapshot[] {
	return updateTopSnapshotNodes(stack, (snapshotNodes) => [...snapshotNodes, node]);
}

export function applyNodeChangesToNodes(nodes: Node[], changes: NodeChange<Node>[]): Node[] {
	return applyNodeChanges(changes, nodes);
}

export function applyNodeChangesToTopSnapshot(stack: PreviewSnapshot[], changes: NodeChange<Node>[]): PreviewSnapshot[] {
	return updateTopSnapshotNodes(stack, (snapshotNodes) => applyNodeChanges(changes, snapshotNodes));
}

export function applyEdgeChangesToEdges(edges: Edge[], changes: EdgeChange<Edge>[]): Edge[] {
	return applyEdgeChanges(changes, edges);
}

export function applyEdgeChangesToTopSnapshot(stack: PreviewSnapshot[], changes: EdgeChange<Edge>[]): PreviewSnapshot[] {
	return updateTopSnapshotEdges(stack, (snapshotEdges) => applyEdgeChanges(changes, snapshotEdges));
}

export function connectEdges(edges: Edge[], params: Connection): Edge[] {
	return addEdge(params, edges);
}

export function connectTopSnapshotEdges(stack: PreviewSnapshot[], params: Connection): PreviewSnapshot[] {
	return updateTopSnapshotEdges(stack, (snapshotEdges) => addEdge(params, snapshotEdges));
}
