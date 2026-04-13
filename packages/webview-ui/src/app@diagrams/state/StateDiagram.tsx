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

const LAYOUT = {
	canvasPaddingX: 24,
	canvasPaddingY: 24,

	stateGroupMinWidth: 320,
	stateGroupMinHeight: 180,
	stateGroupGapX: 48,
	stateGroupPaddingX: 24,
	stateGroupPaddingY: 28,
	stateGroupHeaderOffsetY: 42,

	mutatorGroupMinWidth: 280,
	mutatorGroupMinHeight: 170,
	mutatorGroupGapX: 24,
	mutatorGroupPaddingX: 18,
	mutatorGroupPaddingY: 18,
	mutatorGroupHeaderOffsetY: 24,

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

async function layoutMutator(mutator: StateMutatingFunction) {
	if (!mutator.nodes.length) {
		return {
			...mutator,
			layoutedNodes: [],
			transitions: [],
			width: LAYOUT.mutatorGroupMinWidth,
			height: LAYOUT.mutatorGroupMinHeight,
		};
	}

	const graph = {
		id: `elk-${mutator.id}`,
		layoutOptions: ELK_OPTIONS,
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

	const { children = [], edges: transitions } = await elk.layout(graph);
	const layoutedNodes = children.map(node => ({
		...node,
		x: node.x ?? 0,
		y: node.y ?? 0,
		width: node.width ?? LAYOUT.graphNodeWidth,
		height: node.height ?? LAYOUT.graphNodeHeight,
	}));

	const maxX = layoutedNodes.length ? Math.max(...layoutedNodes.map((node) => node.x + node.width)) : 0;
	const maxY = layoutedNodes.length ? Math.max(...layoutedNodes.map((node) => node.y + node.height)) : 0;

	return {
		...mutator,
		layoutedNodes,
		transitions,
		width: Math.max(LAYOUT.mutatorGroupMinWidth, maxX + (LAYOUT.mutatorGroupPaddingX * 2)),
		height: Math.max(LAYOUT.mutatorGroupMinHeight, maxY + (LAYOUT.mutatorGroupPaddingY * 2) + LAYOUT.mutatorGroupHeaderOffsetY),
	};
}

async function layoutBoxRow<T extends ElkNode>(items: T[], gapX: number) {
	if (!items.length) {
		return {
			layoutedItems: [],
			width: 0,
			height: 0,
		};
	}

	const graph = {
		id: `elk-box-row-${items.map(item => item.id).join('-')}`,
		layoutOptions: {
			...ELK_BOX_ROW_OPTIONS,
			'elk.spacing.nodeNode': `${gapX}`,
		},
		children: items,
		edges: [],
	};

	const { children = [] } = await elk.layout(graph);
	const layoutedItems = children.map(item => ({
		...item,
		x: item.x ?? 0,
		y: item.y ?? 0,
		width: item.width ?? 0,
		height: item.height ?? 0,
	}));

	const maxX = layoutedItems.length ? Math.max(...layoutedItems.map((item) => item.x + item.width)) : 0;
	const maxY = layoutedItems.length ? Math.max(...layoutedItems.map((item) => item.y + item.height)) : 0;

	return {
		layoutedItems,
		width: maxX,
		height: maxY,
	};
}

async function layoutStateVariable(stateVariable: StateVariable) {
	const mutators = stateVariable.mutators
	if (!mutators?.length) {
		return {
			...stateVariable,
			layoutedMutators: [],
			width: LAYOUT.stateGroupMinWidth,
			height: LAYOUT.stateGroupMinHeight,
		};
	}

	const mutatorLayouts = await Promise.all(mutators.map(layoutMutator));
	
	const { layoutedItems: layoutedMutators, width, height } = await layoutBoxRow(mutatorLayouts, LAYOUT.mutatorGroupGapX);
	return {
		...stateVariable,
		layoutedMutators,
		width: Math.max(LAYOUT.stateGroupMinWidth, (LAYOUT.stateGroupPaddingX * 2) + width),
		height: Math.max(LAYOUT.stateGroupMinHeight, height + (LAYOUT.stateGroupPaddingY * 2) + LAYOUT.stateGroupHeaderOffsetY),
	};
}

async function toFlow(model?: StateDiagramModel) {
	const nodes: Node[] = [];
	const edges: Edge[] = [];

	if (!model?.stateVariables?.length)
		return { nodes, edges };

	const stateVariableLayouts = await Promise.all(model.stateVariables.map(layoutStateVariable));
	const { layoutedItems: layoutedStateVariables } = await layoutBoxRow(stateVariableLayouts, LAYOUT.stateGroupGapX);

	for (const stateVariableLayout of layoutedStateVariables) {
		const stateGroupId = `${stateVariableLayout.id}`;

		nodes.push({
			id: stateGroupId,
			type: 'labeledGroupNode',
			position: {
				x: LAYOUT.canvasPaddingX + stateVariableLayout.x,
				y: LAYOUT.canvasPaddingY + stateVariableLayout.y,
			},
			data: { label: stateVariableLayout.name, position: 'top-left' } as GroupNodeProps,
			width: stateVariableLayout.width,
			height: stateVariableLayout.height,
			style: {
				borderRadius: 12,
				border: 'none',
				color: 'var(--vscode-foreground)',
			},
			draggable: false,
		});

		if (!stateVariableLayout.mutators?.length) {
			nodes.push({
				id: `${stateGroupId}:empty`,
				position: { x: LAYOUT.stateGroupPaddingX, y: LAYOUT.stateGroupHeaderOffsetY + 28 },
				parentId: stateGroupId,
				extent: 'parent',
				data: { label: 'No states or mutators' },
				width: Math.min(stateVariableLayout.width - (LAYOUT.stateGroupPaddingX * 2), LAYOUT.graphNodeWidth + 40),
				height: LAYOUT.graphNodeHeight,
				style: {
					padding: 14,
					borderRadius: 8,
					border: '1px dashed var(--vscode-descriptionForeground)',
					background: 'var(--vscode-editor-background)',
					color: 'var(--vscode-descriptionForeground)',
					fontStyle: 'italic',
					display: 'flex',
					alignItems: 'center',
				},
				draggable: false,
				selectable: false,
			});
		}

		for (const mutatorLayout of stateVariableLayout.layoutedMutators) {
			const mutatorGroupId = `${mutatorLayout.id}`;
			nodes.push({
				id: mutatorGroupId,
				type: 'labeledGroupNode',
				position: {
					x: LAYOUT.stateGroupPaddingX + mutatorLayout.x,
					y: LAYOUT.stateGroupHeaderOffsetY + mutatorLayout.y,
				},
				parentId: stateGroupId,
				extent: 'parent',
				data: { label: mutatorLayout.name, position: 'top-left' } as GroupNodeProps,
				width: mutatorLayout.width,
				height: mutatorLayout.height,
				style: {
					borderRadius: 14,
					border: 'none',
					color: 'var(--vscode-foreground)',
				},
				draggable: false,
			});

			for (const graphNode of mutatorLayout.layoutedNodes) {
				const flowNodeId = `${graphNode.id}`;
				const { x, y, width, height } = graphNode;

				nodes.push({
					id: flowNodeId,
					position: {
						x: LAYOUT.mutatorGroupPaddingX + x,
						y: LAYOUT.mutatorGroupHeaderOffsetY + LAYOUT.mutatorGroupPaddingY + y,
					},
					parentId: mutatorGroupId,
					extent: 'parent',
					data: { label: asNodeLabel(graphNode) },
					targetPosition: Position.Top,
					sourcePosition: Position.Bottom,
					width,
					height,
					style: {
						borderRadius: 8,
						border: graphNode.nodeType === 'state-update'
							? '1px solid var(--vscode-testing-iconPassed)'
							: '1px solid var(--vscode-button-border)',
						background: graphNode.nodeType === 'state-update'
							? 'color-mix(in srgb, var(--vscode-testing-iconPassed) 35%, transparent)'
							: 'var(--vscode-input-background)',
						color: 'var(--vscode-foreground)',
						fontSize: 12,
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
