import { useEffect, useMemo, useState } from 'react';
import ELK from 'elkjs/lib/elk.bundled.js';
import { Background, Controls, MarkerType, Position, ReactFlow, useReactFlow, type Edge, type EdgeTypes, type Node, type NodeTypes } from '@xyflow/react';
import type { StateDiagram as StateDiagramModel, StateGraphNode, StateMutatingFunction, StateVariable } from '@react-diagrams/core';
import FloatingEdge from '@/app@components/xyflow-react/components/FloatingEdge';
import FloatingConnectionLine from '@/app@components/xyflow-react/components/FloatingConnectionLine';
import LabeledGroupNode from '@/app@components/xyflow-react/components/LabeledGroupNode';
import type { GroupNodeProps } from '@/app@shadcn/components/labeled-group-node';
import type { ElkNode } from 'elkjs/lib/elk-api';

type StateDiagramProps = {
	model?: StateDiagramModel;
};

const elk = new ELK();

const elkPadding = (top: number, horizontal: number, bottom = horizontal) => `[top=${top},left=${horizontal},bottom=${bottom},right=${horizontal}]`;

const LAYOUT = {
	canvasPadding: 24,
	headerHeight: 24,
	
	state: {
		gap: 24,
		pad: 18,
		minWidth: 280,
		minHeight: 170,
	},
	mutator: {
		gap: 24,
		pad: 18,
		minWidth: 280,
		minHeight: 170,
	},

	graphNodeWidth: 220,
	graphNodeHeight: 56,
};

const ELK_OPTIONS = {
	'elk.algorithm': 'layered',
	'elk.direction': 'DOWN',
	'elk.layered.spacing.nodeNodeBetweenLayers': '46',
	'elk.spacing.nodeNode': '80',
	'elk.layered.cycleBreaking.strategy': 'DEPTH_FIRST',
	'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
	'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
	'elk.layered.feedbackEdges': 'true',
	'elk.edgeRouting': 'ORTHOGONAL',
	'elk.padding': elkPadding(LAYOUT.headerHeight + LAYOUT.mutator.pad, LAYOUT.mutator.pad)
};

const ELK_BOX_ROW_OPTIONS = {
	'elk.algorithm': 'layered',
	'elk.direction': 'DOWN',
	'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
};

const edgeTypes: EdgeTypes = {
	floating: FloatingEdge as EdgeTypes['floating'],
};

const nodeTypes: NodeTypes = {
	labeledGroupNode: LabeledGroupNode,
};

function asNodeLabel(node: StateGraphNode) {
	if (node.nodeType === 'state-update') {
		const expr = node.expressionText ? `: ${node.expressionText}` : '';
		return `${node.kind}${expr}`;
	}

	return `${node.kind}${node.label ? `: ${node.label}` : ''}`;
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
		children: mutator.nodes.map(node => ({
			width: LAYOUT.graphNodeWidth,
			height: LAYOUT.graphNodeHeight,
			...node
		})),
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

	for (const stateVariableLayout of layoutedStateVariables) {
		const stateGroupId = `${stateVariableLayout.id}`;

		nodes.push({
			id: stateGroupId,
			type: 'labeledGroupNode',
			position: { x: stateVariableLayout.x, y: stateVariableLayout.y },
			data: { label: stateVariableLayout.name, position: 'top-left' } as GroupNodeProps,
			width: stateVariableLayout.width,
			height: stateVariableLayout.height,
			className: 'rounded-lg border-0 text-(--vscode-foreground)',
			draggable: false,
		});

		if (!stateVariableLayout.mutators?.length) {
			nodes.push({
				id: `${stateGroupId}:empty`,
				position: { x: LAYOUT.state.pad, y: LAYOUT.headerHeight + LAYOUT.state.pad },
				parentId: stateGroupId,
				extent: 'parent',
				data: { label: 'No states or mutators' },
				width: Math.min(stateVariableLayout.width - (LAYOUT.state.pad * 2), LAYOUT.graphNodeWidth + 40),
				height: LAYOUT.graphNodeHeight,
				className: 'rounded-lg border border-dashed border-(--vscode-descriptionForeground) bg-(--vscode-editor-background) text-(--vscode-descriptionForeground) italic flex items-center p-[14px]',
				draggable: false,
				selectable: false,
			});
		}

		for (const mutatorLayout of stateVariableLayout.layoutedMutators) {
			const mutatorGroupId = `${mutatorLayout.id}`;
			nodes.push({
				id: mutatorGroupId,
				type: 'labeledGroupNode',
				position: { x: mutatorLayout.x, y: mutatorLayout.y },
				parentId: stateGroupId,
				extent: 'parent',
				data: { label: mutatorLayout.name, position: 'top-left' } as GroupNodeProps,
				width: mutatorLayout.width,
				height: mutatorLayout.height,
				className: 'rounded-lg border-0 text-(--vscode-foreground)',
				draggable: false,
			});

			for (const graphNode of mutatorLayout.layoutedNodes) {
				const flowNodeId = `${graphNode.id}`;
				const { x, y, width, height } = graphNode;

				nodes.push({
					id: flowNodeId,
					position: { x, y },
					parentId: mutatorGroupId,
					extent: 'parent',
					data: { label: asNodeLabel(graphNode) },
					targetPosition: Position.Top,
					sourcePosition: Position.Bottom,
					width,
					height,
					className: 'rounded-lg text-(--vscode-foreground) text-[12px]',
					style: {
						border: graphNode.nodeType === 'state-update'
							? '1px solid var(--vscode-testing-iconPassed)'
							: '1px solid var(--vscode-button-border)',
						background: graphNode.nodeType === 'state-update'
							? 'color-mix(in srgb, var(--vscode-testing-iconPassed) 35%, transparent)'
							: 'var(--vscode-input-background)',
					},
					draggable: false,
				});
			}

			for (const transition of mutatorLayout.transitions) {
				const source = transition.fromNodeId;
				const target = transition.toNodeId;

				if (!source || !target)
					continue;

				edges.push({
					id: `${mutatorGroupId}-${transition.id}`,
					source,
					target,
					label: transition.label,
					type: 'floating',
					animated: transition.kind != 'normal',
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
			void fitView({ padding: 0.2, duration: 150 });
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
			>
				<AutoFitView ready={flowState.nodes.length > 0} />
				<Controls />
				<Background gap={18} size={1} />
			</ReactFlow>
		</div>
	);
}
