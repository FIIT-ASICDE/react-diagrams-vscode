import { useEffect, useMemo, useState } from 'react';
import { Background, Controls, MarkerType, MiniMap, ReactFlow, useEdgesState, useNodesState, useReactFlow, type Edge, type Node } from '@xyflow/react';
import type { StateDiagram as StateDiagramModel } from '@react-diagrams/core/app@state-diagram';
// import FloatingConnectionLine from '@/app@components/xyflow-react/components/FloatingConnectionLine';
import { nodeTypes, getGraphNodeVisual } from './rendering/nodes';
import { edgeTypes } from './rendering/edges';
import { layoutBoxRow, layoutStateVariable, elkPadd, STATE_DIAGRAM_LAYOUT as LAYOUT } from '@react-diagrams/core/app@state-diagram-model';
import type { GroupNodeProps } from '@/app@shadcn/components/labeled-group-node';
import { vscode } from '@/app@vscode/api';
import { getColor } from '@/app@utils/utils';

type StateDiagramProps = {
	model?: StateDiagramModel;
};

async function toFlow(model?: StateDiagramModel) {
	const nodes: Node[] = [];
	const edges: Edge[] = [];

	if (!model?.stateVariables?.length)
		return { nodes, edges };

	const stateVariableLayouts = await Promise.all(model.stateVariables.map(layoutStateVariable));
	const { layoutedItems: layoutedStateVariables } = await layoutBoxRow(stateVariableLayouts, { gap: LAYOUT.state.gap, padding: elkPadd(LAYOUT.canvasPadding, LAYOUT.canvasPadding) });

	for (const { id: stateVarId, layoutedMutators, ...stateVar } of layoutedStateVariables) {
		nodes.push({
			id: stateVarId,
			type: 'labeledGroupNode',
			position: { x: stateVar.x, y: stateVar.y },
			data: { name: <><b>{stateVar.name}</b> : {stateVar.hook}</>, color: getColor(stateVar.name, 24), children: !layoutedMutators?.length && <p className='text-(--vscode-descriptionForeground) italic'>No mutators found</p> } as GroupNodeProps,
			width: stateVar.width,
			height: stateVar.height,
			className: 'rounded-lg border-0 text-(--vscode-foreground)',
		});

		for (const { id: mutatorId, ...mutatorLayout } of layoutedMutators) {
			nodes.push({
				id: mutatorId,
				type: 'labeledGroupNode',
				position: { x: mutatorLayout.x, y: mutatorLayout.y },
				parentId: stateVarId,
				extent: 'parent',
				data: { ...mutatorLayout, name: `${mutatorLayout.name}(...)`, color: getColor(mutatorLayout.name, 40) } as GroupNodeProps,
				width: mutatorLayout.width,
				height: mutatorLayout.height,
				className: 'rounded-lg border-0 text-(--vscode-foreground)',
			});

			const mutatorNodes = new Map<string, Node>();
			for (const { id: nodeId, ...graphNode } of mutatorLayout.layoutedNodes) {
				const { x, y, width, height } = graphNode;
				const visual = getGraphNodeVisual(graphNode);
				// console.log(graphNode.kind, width, height)

				const node: Node = {
					id: nodeId,
					type: visual.type,
					// position: { x: x + mutatorLayout.x + stateVar.x, y: y + mutatorLayout.y + stateVar.y },
					position: { x, y },
					parentId: mutatorId,
					extent: 'parent',
					data: {
						...graphNode,
						...visual.data
					},
					width,
					height,
					className: 'bg-transparent border-0 shadow-none z-20',
					draggable: true,
				}
				nodes.push(node);
				mutatorNodes.set(nodeId, node);
			}

			for (const { id, fromNodeId: source, toNodeId: target, kind, ...transition } of mutatorLayout.transitions) {
				if (!source || !target)
					continue;

				const loopBack = kind == 'loop';
				const scaleSign = (x) => x == 0 ? 0 : (x > 0 ? Math.exp(-x/80) : -Math.exp(x/80));
				const dir = scaleSign(mutatorNodes.get(source)!.position.x - mutatorNodes.get(target)!.position.x);
				edges.push({
					id,
					source,
					target,
					sourceHandle: loopBack ? `source-${dir < 0 ? 'left' : 'right'}` : undefined,
					targetHandle: loopBack ? `target-${dir < 0 ? 'left' : 'right'}` : undefined,
					label: transition.label,
					type: 'floating',
					animated: loopBack,
					markerEnd: { type: MarkerType.ArrowClosed },
					data: { backEdge: loopBack ? dir : undefined },
				});
			}
		}
	}

	return { nodes, edges };
}

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

		toFlow(model).then((newState) => {
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

	const onDoubleClick = (event: React.MouseEvent, { data }: Node) => {
		vscode.postMessage("nodeDblClick", { data });
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
