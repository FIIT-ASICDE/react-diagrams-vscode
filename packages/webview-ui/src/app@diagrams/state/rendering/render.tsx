import { getGraphNodeVisual, getNodeColor } from './nodes';
import { layoutBoxRow, layoutStateVariable, elkPadd, STATE_DIAGRAM_LAYOUT as LAYOUT, type Id, type StateDiagram } from '@react-diagrams/core/app@state-diagram-model';
import type { GroupNodeProps } from '@/app@shadcn/components/labeled-group-node';
import { MarkerType, type Edge, type Node } from '@xyflow/react';
import { cn } from '@/app@shadcn/lib/utils';

export type StateDiagramProps = {
	model?: StateDiagram;
};

export const StateVariableLabel = ({ name, hook, initializerText, className }: { name: string; hook: string; initializerText?: string; className?: string }) => (
	<span className={cn('text-white leading-0', className)}><b>{name}</b> : {hook} {initializerText && <> = <span className='font-semibold'>{initializerText}</span></>}</span>
)

export const MutatorLabel = ({ name, args, type, className }: { name: string; args?: string; type: string; className?: string }) => {
	const mutatorArgs = type == 'arrow-function' ? `((${args}) =>` : `(${args})`;
	return (
		<span className={cn('text-white leading-0', className)}><span className='font-semibold'>{name}</span>{args != undefined && <i>{mutatorArgs}</i>}</span>
	)
}

const commonLadledGroupClass = `rounded-lg border-0 text-(--vscode-foreground)`

const hiddenDiagramNode: Node = {
	id: 'state-diagram-hidden-placeholder',
	type: 'labeledGroupNode',
	position: { x: 0, y: 0 },
	data: {
		name: <span className="text-white leading-0 font-semibold">Everything is hidden</span>,
		color: 'color-mix(in srgb, #454545 88%, transparent)',
		children: <p className='text-gray-400 italic'>Use Show all to restore the diagram.</p>
	} as GroupNodeProps,
	width: 280,
	height: 84,
	className: commonLadledGroupClass,
};

export async function renderXyFlow(model?: StateDiagram, transitionRouting: string = 'POLYLINE', hiddenStateVariableIds?: ReadonlySet<Id>) {
	const nodes: Node[] = [];
	const edges: Edge[] = [];

	if (!model?.stateVariables?.length)
		return { nodes, edges };

	const stateVarsFiltered = hiddenStateVariableIds?.size ? model.stateVariables.filter(stateVar => !hiddenStateVariableIds.has(stateVar.id)) : model.stateVariables;
	if (!stateVarsFiltered.length)
		return { nodes: [hiddenDiagramNode], edges };

	const stateVariableLayouts = await Promise.all(stateVarsFiltered.map(stateVar => layoutStateVariable(stateVar, { 'elk.edgeRouting': transitionRouting })));
	const { layoutedItems: layoutedStateVariables } = await layoutBoxRow(stateVariableLayouts, { gap: LAYOUT.state.gap, padding: elkPadd(LAYOUT.canvasPadding, LAYOUT.canvasPadding) });

	for (const { id: stateVarId, layoutedMutators, initializerText, ...stateVar } of layoutedStateVariables) {
		nodes.push({
			id: stateVarId,
			type: 'labeledGroupNode',
			position: { x: stateVar.x, y: stateVar.y },
			data: {
				...stateVar,
				name: <StateVariableLabel initializerText={initializerText} {...stateVar} />,
				color: getNodeColor('stateVariable', stateVar.name),
				children: !layoutedMutators?.length && <p className='text-gray-400 italic'>No mutators found</p> 
			} as GroupNodeProps,
			width: stateVar.width,
			height: stateVar.height,
			className: commonLadledGroupClass,
		});

		for (const { id: mutatorId, ...mutatorLayout } of layoutedMutators) {
			nodes.push({
				id: mutatorId,
				type: 'labeledGroupNode',
				position: { x: mutatorLayout.x, y: mutatorLayout.y },
				parentId: stateVarId,
				extent: 'parent',
				data: { 
					...mutatorLayout, 
					name: <MutatorLabel {...mutatorLayout}/>,
					color: getNodeColor('mutator', mutatorLayout.name),
				} as GroupNodeProps,
				width: mutatorLayout.width,
				height: mutatorLayout.height,
				className: commonLadledGroupClass,
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
					className: `bg-transparent border-0 shadow-none ${graphNode.nodeType == 'state-update' ? 'z-10' : ''}`,
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
					style: { strokeWidth: 1.45, borderRadius: 10 },
					data: { pathPoints, labelPos, minPoints: 2 },
				});
			}
		}
	}

	return { nodes, edges };
}