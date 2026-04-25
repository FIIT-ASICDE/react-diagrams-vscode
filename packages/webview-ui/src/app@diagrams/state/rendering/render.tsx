import { getGraphNodeVisual } from './nodes';
import { layoutBoxRow, layoutStateVariable, elkPadd, STATE_DIAGRAM_LAYOUT as LAYOUT, type StateDiagram } from '@react-diagrams/core/app@state-diagram-model';
import type { GroupNodeProps } from '@/app@shadcn/components/labeled-group-node';
import { getColor } from '@/app@utils/utils';
import { MarkerType, type Edge, type Node } from '@xyflow/react';

export type StateDiagramProps = {
	model?: StateDiagram;
};

export async function renderXyFlow(model?: StateDiagram, transitionRouting: string = 'POLYLINE') {
	const nodes: Node[] = [];
	const edges: Edge[] = [];

	if (!model?.stateVariables?.length)
		return { nodes, edges };

	const stateVariableLayouts = await Promise.all(model.stateVariables.map(stateVar => layoutStateVariable(stateVar, { 'elk.edgeRouting': transitionRouting })));
	const { layoutedItems: layoutedStateVariables } = await layoutBoxRow(stateVariableLayouts, { gap: LAYOUT.state.gap, padding: elkPadd(LAYOUT.canvasPadding, LAYOUT.canvasPadding) });

	for (const { id: stateVarId, layoutedMutators, initializerText, ...stateVar } of layoutedStateVariables) {
		nodes.push({
			id: stateVarId,
			type: 'labeledGroupNode',
			position: { x: stateVar.x, y: stateVar.y },
			data: {
				...stateVar,
				name: <span className='text-white leading-0'><b>{stateVar.name}</b> : {stateVar.hook} {initializerText && <> = <span className='font-semibold'>{initializerText}</span></>}</span>, 
				color: getColor(stateVar.name, 24),
				children: !layoutedMutators?.length && <p className='text-gray-400 italic'>No mutators found</p> 
			} as GroupNodeProps,
			width: stateVar.width,
			height: stateVar.height,
			className: 'rounded-lg border-0 text-(--vscode-foreground)',
		});

		for (const { id: mutatorId, ...mutatorLayout } of layoutedMutators) {
			const mutatorArgs = mutatorLayout.type == 'arrow-function' ? `((${mutatorLayout.args}) =>` : `(${mutatorLayout.args})`;
			nodes.push({
				id: mutatorId,
				type: 'labeledGroupNode',
				position: { x: mutatorLayout.x, y: mutatorLayout.y },
				parentId: stateVarId,
				extent: 'parent',
				data: { 
					...mutatorLayout, 
					name: <span className='text-white leading-0'><span className='font-semibold'>{mutatorLayout.name}</span>{mutatorLayout.args != undefined && <i>{mutatorArgs}</i>}</span>,
					color: getColor(mutatorLayout.name, 40),
				} as GroupNodeProps,
				width: mutatorLayout.width,
				height: mutatorLayout.height,
				className: 'rounded-lg border-0 text-(--vscode-foreground)',
			});

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
			}

			for (const { id, fromNodeId: source, toNodeId: target, kind, ...transition } of mutatorLayout.transitions) {
				if (!source || !target)
					continue;
				// console.debug(transition)

				const loopBack = kind == 'loop';

				const { bendPoints = [], endPoint } = transition.sections?.[0] ?? {};
				if (transitionRouting == 'SPLINES' && loopBack)
					bendPoints.pop();
				const pathPoints = endPoint && [null, ...bendPoints, transitionRouting != 'ORTHOGONAL' ? null : endPoint] // none = autoconnect to node
					.map(p => p && ({ x: p.x + mutatorLayout.x + stateVar.x, y: p.y + mutatorLayout.y + stateVar.y })); // handle relative/abs pos...

				const labelPos = transition.labels?.map(({ x = 0, y = 0 }) => ({ x: x + mutatorLayout.x + stateVar.x, y: y + mutatorLayout.y + stateVar.y }))[0];
				edges.push({
					id,
					source,
					target,
					label: transition.label,
					type: 'routable',
					animated: loopBack,
					markerEnd: { type: MarkerType.ArrowClosed },
					style: { strokeWidth: 1.4, borderRadius: 10 },
					data: { pathPoints, labelPos, minPoints: 2 },
				});
			}
		}
	}

	return { nodes, edges };
}