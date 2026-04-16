import { useEffect, useMemo, useState } from 'react';
import { Background, Controls, MarkerType, ReactFlow, useReactFlow, type Edge, type Node } from '@xyflow/react';
import type { StateDiagram as StateDiagramModel } from '@react-diagrams/core/app@state-diagram';
import FloatingConnectionLine from '@/app@components/xyflow-react/components/FloatingConnectionLine';
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

	for (const stateVar of layoutedStateVariables) {
		const stateGroupId = `${stateVar.id}`;

		nodes.push({
			id: stateGroupId,
			type: 'labeledGroupNode',
			position: { x: stateVar.x, y: stateVar.y },
			data: { ...stateVar, color: getColor(stateVar.name, 24), children: !stateVar.mutators?.length && <p className='text-(--vscode-descriptionForeground) italic'>No mutators found</p> } as GroupNodeProps,
			width: stateVar.width,
			height: stateVar.height,
			className: 'rounded-lg border-0 text-(--vscode-foreground)',
		});

		for (const mutatorLayout of stateVar.layoutedMutators) {
			const mutatorGroupId = `${mutatorLayout.id}`;
			nodes.push({
				id: mutatorGroupId,
				type: 'labeledGroupNode',
				position: { x: mutatorLayout.x, y: mutatorLayout.y },
				parentId: stateGroupId,
				extent: 'parent',
				data: { ...mutatorLayout, name: `${mutatorLayout.name}(...)`, color: getColor(mutatorLayout.name, 40) } as GroupNodeProps,
				width: mutatorLayout.width,
				height: mutatorLayout.height,
				className: 'rounded-lg border-0 text-(--vscode-foreground)',
			});

			for (const graphNode of mutatorLayout.layoutedNodes) {
				const flowNodeId = `${graphNode.id}`;
				const { x, y, width, height } = graphNode;
				const visual = getGraphNodeVisual(graphNode);
				
				nodes.push({
					id: flowNodeId,
					type: visual.type,
					position: { x, y },
					parentId: mutatorGroupId,
					extent: 'parent',
					data: {
						...graphNode,
						...visual.data
					},
					width,
					height,
					className: 'bg-transparent border-0 shadow-none',
					draggable: true,
				});
			}

			for (const { id, fromNodeId: source, toNodeId: target, ...transition } of mutatorLayout.transitions) {
				if (!source || !target)
					continue;

				edges.push({
					id,
					source,
					target,
					label: transition.label,
					type: 'floating',
					// animated: transition.kind != 'normal',
					markerEnd: { type: MarkerType.ArrowClosed },
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

export default function StateDiagram({ model }: StateDiagramProps) {
	const [flowState, setFlowState] = useState<{ nodes: Node[]; edges: Edge[] }>({ nodes: [], edges: [] });
	const hasModel = useMemo(() => Boolean(model?.stateVariables?.length), [model]);

	useEffect(() => {
		let cancelled = false;

		toFlow(model).then((nextFlowState) => {
			if (!cancelled)
				setFlowState(nextFlowState);
		}).catch((error) => {
			console.error('Failed to layout state diagram with ELK', error);
			if (!cancelled)
				setFlowState({ nodes: [], edges: [] });
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
				nodes={flowState.nodes}
				edges={flowState.edges}
				nodesConnectable={false}
				elementsSelectable
				nodeTypes={nodeTypes}
				edgeTypes={edgeTypes}
				connectionLineComponent={FloatingConnectionLine}
				fitViewOptions={{ padding: 0.2 }}
				defaultEdgeOptions={{
					type: 'floating',
					markerEnd: { type: MarkerType.ArrowClosed },
				}}
				className='floating-edges'
				onNodeDoubleClick={onDoubleClick}
			>
				<AutoFitView ready={flowState.nodes.length > 0} />
				<Controls />
				<Background gap={18} size={1} />
			</ReactFlow>
		</div>
	);
}
