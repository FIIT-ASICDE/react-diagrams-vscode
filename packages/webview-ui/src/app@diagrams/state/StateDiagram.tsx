import { useEffect, useMemo, useState } from 'react';
import ELK from 'elkjs/lib/elk.bundled.js';
import { Background, Controls, MarkerType, ReactFlow, useReactFlow, type Edge, type Node } from '@xyflow/react';
import type { StateDiagram as StateDiagramModel, StateGraphNode, StateMutatingFunction, StateVariable } from '@react-diagrams/core';
import FloatingConnectionLine from '@/app@components/xyflow-react/components/FloatingConnectionLine';
import { nodeTypes, getGraphNodeVisual } from './rendering/nodes';
import { edgeTypes } from './rendering/edges';
import type { GroupNodeProps } from '@/app@shadcn/components/labeled-group-node';
import type { ElkNode } from 'elkjs/lib/elk-api';
import { getColor } from '@/app@utils/utils';

type StateDiagramProps = {
	model?: StateDiagramModel;
};

const elk = new ELK();

const elkPadding = (top: number, horizontal: number, bottom = horizontal) => `[top=${top},left=${horizontal},bottom=${bottom},right=${horizontal}]`;

const LAYOUT = {
	canvasPadding: 12,
	headerHeight: 24,
	
	state: {
		gap: 24,
		pad: 16,
		minWidth: 200,
		minHeight: 100,
	},
	mutator: {
		gap: 18,
		pad: 24,
		minWidth: 200,
		minHeight: 100,
	},

	graphNodeWidth: 190,
	graphNodeHeight: 48,
};

const ELK_OPTIONS = {
	'elk.algorithm': 'layered',
	'elk.direction': 'DOWN',
	'elk.layered.spacing.nodeNodeBetweenLayers': '48',
	'elk.layered.cycleBreaking.strategy': 'DEPTH_FIRST',
	'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
	'elk.layered.nodePlacement.favorStraightEdges': 'true',
	'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
	'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
	'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
	'elk.layered.feedbackEdges': 'true',
	'elk.edgeRouting': 'ORTHOGONAL',
	'elk.spacing.nodeNode': '46',
	'elk.padding': elkPadding(LAYOUT.headerHeight + LAYOUT.mutator.pad, LAYOUT.mutator.pad)
};

const ELK_BOX_ROW_OPTIONS = {
	'elk.algorithm': 'layered',
	'elk.direction': 'DOWN',
	'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
};

function getGraphNodeSize(graphNode: StateGraphNode) {
	if (graphNode.nodeType == 'state-update') {
		return { width: LAYOUT.graphNodeWidth, height: LAYOUT.graphNodeHeight };
	}

	if (graphNode.kind == 'decision' || graphNode.kind == 'try-decision' || graphNode.kind == 'merge') {
		return { width: 54, height: 38 };
	}

	return { width: 38, height: 38 };
}

async function layoutMutator(mutator: StateMutatingFunction, elkLayout = {}) {
	if (!mutator.nodes.length) {
		return {
			...mutator,
			layoutedNodes: [],
			transitions: [],
			width: LAYOUT.mutator.minWidth,
			height: LAYOUT.mutator.minHeight,
		};
	}

	const graph = {
		id: `elk-${mutator.id}`,
		layoutOptions: { ...ELK_OPTIONS, ...elkLayout },
		children: mutator.nodes.map(node => ({ ...getGraphNodeSize(node), ...node })),
		edges: mutator.transitions.map(transition => ({
			sources: [transition.fromNodeId],
			targets: [transition.toNodeId],
			...transition
		})),
	};

	const { children = [], edges: transitions, width = 0, height = 0 } = await elk.layout<ElkNode & {
		children: (StateGraphNode & ElkNode)[]
		edges: typeof graph.edges;
	}>(graph);
	const layoutedNodes = children.map(node => ({x: 0, y: 0, width: 0, height: 0, ...node}));

	return {
		...mutator,
		layoutedNodes,
		transitions,
		width: Math.max(LAYOUT.mutator.minWidth, width ?? 0),
		height: Math.max(LAYOUT.mutator.minHeight, height ?? 0),
	};
}

async function layoutBoxRow<T extends ElkNode>(items: T[], { gap, padding, minWidth = 0, minHeight = 0 }: any) {
	if (!items.length) {
		return {
			layoutedItems: [],
			width: minWidth,
			height: minHeight,
		};
	}

	const graph = {
		id: `elk-box-row-${items.map(item => item.id).join('-')}`,
		layoutOptions: {
			...ELK_BOX_ROW_OPTIONS,
			'elk.spacing.componentComponent': `${gap}`,
			...(padding ? { 'elk.padding': padding } : {}),
		},
		children: items,
		edges: [],
	};

	const { children = [], width = 0, height = 0 } = await elk.layout<ElkNode & { children: T[] }>(graph);
	const layoutedItems = children.map(item => ({x: 0, y: 0, width: 0, height: 0, ...item}));

	const maxX = layoutedItems.length ? Math.max(...layoutedItems.map((item) => item.x + item.width)) : 0;
	const maxY = layoutedItems.length ? Math.max(...layoutedItems.map((item) => item.y + item.height)) : 0;

	return {
		layoutedItems,
		width: Math.max(minWidth, width ?? maxX),
		height: Math.max(minHeight, height ?? maxY),
	};
}

async function layoutStateVariable(stateVariable: StateVariable) {
	const mutators = stateVariable.mutators
	if (!mutators?.length) {
		return {
			...stateVariable,
			layoutedMutators: [],
			width: LAYOUT.state.minWidth,
			height: LAYOUT.state.minHeight,
		};
	}

	const mutatorLayouts = await Promise.all(mutators.map(layoutMutator));

	const { layoutedItems: layoutedMutators, width, height } = await layoutBoxRow(mutatorLayouts, {
		gap: LAYOUT.mutator.gap,
		padding: elkPadding(LAYOUT.headerHeight + LAYOUT.state.pad, LAYOUT.state.pad),
		minWidth: LAYOUT.state.minWidth,
		minHeight: LAYOUT.state.minHeight,
	});
	return {
		...stateVariable,
		layoutedMutators,
		width,
		height,
	};
}

async function toFlow(model?: StateDiagramModel) {
	const nodes: Node[] = [];
	const edges: Edge[] = [];

	if (!model?.stateVariables?.length)
		return { nodes, edges };

	const stateVariableLayouts = await Promise.all(model.stateVariables.map(layoutStateVariable));
	const { layoutedItems: layoutedStateVariables } = await layoutBoxRow(stateVariableLayouts, {
		gap: LAYOUT.state.gap,
		padding: elkPadding(LAYOUT.canvasPadding, LAYOUT.canvasPadding),
	});

	for (const stateVar of layoutedStateVariables) {
		const stateGroupId = `${stateVar.id}`;

		nodes.push({
			id: stateGroupId,
			type: 'labeledGroupNode',
			position: { x: stateVar.x, y: stateVar.y },
			data: { label: stateVar.name, color: getColor(stateVar.name, 22), children: !stateVar.mutators?.length && <p className='text-(--vscode-descriptionForeground) italic'>No Mutators</p> 
			} as GroupNodeProps,
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
				data: { label: `${mutatorLayout.name}(...)`, color: getColor(mutatorLayout.name, 40) } as GroupNodeProps,
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
						...visual.data,
						width,
						height,
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
				onNodeDoubleClick={(e, node) => console.log(node)}
			>
				<AutoFitView ready={flowState.nodes.length > 0} />
				<Controls />
				<Background gap={18} size={1} />
			</ReactFlow>
		</div>
	);
}
