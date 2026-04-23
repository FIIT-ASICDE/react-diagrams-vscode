import { getGraphNodeVisual } from './nodes';
import { layoutBoxRow, layoutStateVariable, elkPadd, STATE_DIAGRAM_LAYOUT as LAYOUT, type StateDiagram } from '@react-diagrams/core/app@state-diagram-model';
import type { GroupNodeProps } from '@/app@shadcn/components/labeled-group-node';
import { getColor } from '@/app@utils/utils';
import { MarkerType, type Edge, type Node } from '@xyflow/react';

export type StateDiagramProps = {
	model?: StateDiagram;
};

export async function renderXyFlow(model?: StateDiagram) {
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
			data: {
				...stateVar,
				name: <div className='text-white'><b>{stateVar.name}</b> : {stateVar.hook}</div>, 
				color: getColor(stateVar.name, 24),
				children: !layoutedMutators?.length && <p className='text-(--vscode-descriptionForeground) italic'>No mutators found</p> 
			} as GroupNodeProps,
			width: stateVar.width,
			height: stateVar.height,
			className: 'rounded-lg border-0 text-(--vscode-foreground)',
		});

		for (const { id: mutatorId, ...mutatorLayout } of layoutedMutators) {
			const mutatorArgs = `${mutatorLayout.args ?? '...'}`;
			nodes.push({
				id: mutatorId,
				type: 'labeledGroupNode',
				position: { x: mutatorLayout.x, y: mutatorLayout.y },
				parentId: stateVarId,
				extent: 'parent',
				data: { 
					...mutatorLayout, 
					name: <div className='text-white'>{mutatorLayout.name}<i>{mutatorLayout.type == 'arrow-function' ? `((${mutatorArgs}) =>` : `(${mutatorArgs})`}</i></div>, 
					color: getColor(mutatorLayout.name, 40)
				} as GroupNodeProps,
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

				console.log(transition)

				const section = transition?.sections?.[0];
				const pathPoints = section && [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]
					.map(({x, y}) => ({ x: x + mutatorLayout.x + stateVar.x, y: y + mutatorLayout.y + stateVar.y})); // Adjust points to be relative to the diagram...

				const loopBack = kind == 'loop';
				// const scaleSign = x => x == 0 ? 0 : (x > 0 ? Math.exp(-x/80) : -Math.exp(x/80));
				// const dir = scaleSign(mutatorNodes.get(source)!.position.x - mutatorNodes.get(target)!.position.x);
				edges.push({
					id,
					source,
					target,
					// sourceHandle: loopBack ? `source-${dir < 0 ? 'left' : 'right'}` : undefined,
					// targetHandle: loopBack ? `target-${dir < 0 ? 'left' : 'right'}` : undefined,
					label: transition.label,
					type: 'pathable',
					animated: loopBack,
					markerEnd: { type: MarkerType.ArrowClosed },
					style: { strokeWidth: 1.4 },
					data: { pathPoints },
				});
			}
		}
	}

	return { nodes, edges };
}