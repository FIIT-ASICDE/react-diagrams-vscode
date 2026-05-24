import {
	ReactFlow,
	Background,
	Controls,
	type Connection,
	type Edge,
	type EdgeChange,
	type EdgeTypes,
	type Node,
	type NodeChange,
	type NodeTypes,
	type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { AutoFitOnSnapshotChange } from '../../logic/auto-fit';

type DiagramCanvasProps = {
	nodes: Node[];
	edges: Edge[];
	isEditable: boolean;
	isPlayground: boolean;
	edgeTypes: EdgeTypes;
	nodeTypes: NodeTypes;
	focusTrigger: string;

	onInit: (instance: ReactFlowInstance<Node, Edge>) => void;
	onNodeClick?: (event: React.MouseEvent, node: Node) => void;
	onNodeContextMenu?: (event: React.MouseEvent, node: Node) => void;
	onEdgeContextMenu?: (event: React.MouseEvent, edge: Edge) => void;

	onNodesChange?: (changes: NodeChange<Node>[]) => void;
	onEdgesChange?: (changes: EdgeChange<Edge>[]) => void;
	onConnect?: (connection: Connection) => void;
};


// Handles diagram canvas.
export function DiagramCanvas({
	nodes,
	edges,
	isEditable,
	isPlayground,
	edgeTypes,
	nodeTypes,
	focusTrigger,
	onInit,
	onNodeClick,
	onNodeContextMenu,
	onEdgeContextMenu,
	onNodesChange,
	onEdgesChange,
	onConnect,
}: DiagramCanvasProps) {
	const debugGraphJson = JSON.stringify({ nodes, edges }, null, 2);

	return (
		<>
		{}
		<ReactFlow
			className="download-image"
			nodes={nodes}
			edges={edges}
			style={{ backgroundColor: 'white' }}
			onInit={onInit}
			onNodeClick={onNodeClick}
			onNodeContextMenu={onNodeContextMenu}
			onEdgeContextMenu={onEdgeContextMenu}
			onNodesChange={onNodesChange}
			onEdgesChange={onEdgesChange}
			onConnect={onConnect}
			nodeTypes={nodeTypes}
			edgeTypes={edgeTypes}
			nodesDraggable={isEditable}
			nodesConnectable={isEditable}
			elementsSelectable
			edgesFocusable={isEditable}
			nodesFocusable={isEditable}
			panOnDrag
			zoomOnScroll
			zoomOnPinch
			zoomOnDoubleClick={false}
			snapToGrid
		>
			<AutoFitOnSnapshotChange focusTrigger={focusTrigger} />
			<Controls />
			<Background
				gap={25}
				size={2}
				color='rgba(0, 0, 0, 0.39)'
			/>
		</ReactFlow>
		</>
	);
}
