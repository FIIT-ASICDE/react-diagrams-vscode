import { useEffect, useMemo, useState } from 'react';
import { Background, Controls, MarkerType, MiniMap, ReactFlow, useEdgesState, useNodesState, useReactFlow, type Edge, type Node } from '@xyflow/react';
import { nodeTypes } from './rendering/nodes';
import { edgeTypes } from './rendering/edges';
import { renderXyFlow, type StateDiagramProps } from './rendering/render';
import { vscode } from '@/app@vscode/api';

function AutoFitView({ ready }: { ready: boolean }) {
	const { fitView } = useReactFlow();

	useEffect(() => {
		if (ready) {
			void fitView({ padding: 0.1, duration: 150 });
		}
	}, [fitView, ready]);

	return null;
}

const minimapNodeColor = node => node.type == 'labeledGroupNode' ? 'transparent' : node.data?.color ?? 'gray';
const minimapNodeStrokeColor = node => node.type == 'labeledGroupNode' ? node.data?.color ?? 'gray' : 'transparent';

export default function StateDiagram({ model }: StateDiagramProps) {
	const [nodes, setNodes] = useNodesState<Node>([]);
	const [edges, setEdges] = useEdgesState<Edge>([]);
	const hasModel = useMemo(() => Boolean(model?.stateVariables?.length), [model]);

	useEffect(() => {
		let cancelled = false;

		renderXyFlow(model).then((newState) => {
			if (!cancelled) {
				setNodes(newState.nodes);
				setEdges(newState.edges);
				// console.log(newState.nodes, newState.edges);
			}
		}).catch((error) => {
			console.error('Failed to layout state diagram with ELK', error);
			if (!cancelled) {
				setNodes([]);
				setEdges([]);
			}
		});

		return () => {
			cancelled = true;
		};
	}, [model]);

	const onDoubleClick = (event: React.MouseEvent, node: Node) => {
		vscode.postMessage("nodeDblClick", { data: { ...node.data, name: undefined, children: undefined } });
	}

	return (
		<div className="h-full w-full">
			{!hasModel && (
				<div className="absolute z-10 rounded border border-(--vscode-editorWidget-border) bg-(--vscode-editorWidget-background) px-3 py-2 text-xs text-(--vscode-descriptionForeground)">
					No state variables found.
				</div>
			)}
			<ReactFlow
				nodes={nodes}
				edges={edges}
				nodesConnectable={false}
				elementsSelectable
				nodeTypes={nodeTypes}
				edgeTypes={edgeTypes}
				// connectionLineComponent={FloatingConnectionLine}
				fitViewOptions={{ padding: 0.1 }}
				defaultEdgeOptions={{
					type: 'floating',
					markerEnd: { type: MarkerType.ArrowClosed },
				}}
				className='floating-edges'
				onNodeDoubleClick={onDoubleClick}
			>
				<AutoFitView ready={nodes.length > 0} />
				<Controls />
				<MiniMap pannable zoomable style={{width: 150, height: 100 }} nodeColor={minimapNodeColor} nodeStrokeColor={minimapNodeStrokeColor} />
				<Background gap={18} size={1} />
			</ReactFlow>
		</div>
	);
}
