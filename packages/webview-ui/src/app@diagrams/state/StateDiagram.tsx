import { useEffect, useMemo, useState } from 'react';
import ELK from 'elkjs/lib/elk.bundled.js';
import { Background, Controls, MarkerType, Position, ReactFlow, useReactFlow, type Edge, type EdgeTypes, type Node, type NodeTypes } from '@xyflow/react';
import type { Id, StateDiagram as StateDiagramModel, StateGraphNode, StateMutatingFunction } from '@react-diagrams/core';
import FloatingEdge from '@/app@components/xyflow-react/components/FloatingEdge';
import FloatingConnectionLine from '@/app@components/xyflow-react/components/FloatingConnectionLine';
import LabeledGroupNode from '@/app@components/xyflow-react/components/LabeledGroupNode';
import type { GroupNodeProps } from '@/app@shadcn/components/labeled-group-node';
import { getColor } from 'random-material-color';

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
			mutator,
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
		mutator,
		layoutedNodes,
		transitions,
		width: Math.max(LAYOUT.mutatorGroupMinWidth, maxX + (LAYOUT.mutatorGroupPaddingX * 2)),
		height: Math.max(LAYOUT.mutatorGroupMinHeight, maxY + (LAYOUT.mutatorGroupPaddingY * 2) + LAYOUT.mutatorGroupHeaderOffsetY),
	};
}

async function toFlow(model?: StateDiagramModel) {
	const nodes: Node[] = [];
	const edges: Edge[] = [];

	if (!model?.stateVariables?.length)
		return { nodes, edges };

	let stateGroupOffsetX = LAYOUT.canvasPaddingX;

	for (const stateVariable of model.stateVariables) {
		const mutators = stateVariable.mutators ?? [];
		const hasMutators = mutators.length > 0;
		const mutatorLayouts = await Promise.all(mutators.map((mutator) => layoutMutator(mutator)));
		const tallestMutator = mutatorLayouts.length ? Math.max(...mutatorLayouts.map((layout) => layout.height)) : 0;
		const stateGroupInnerWidth = mutatorLayouts.reduce((totalWidth, layout, index) => {
			return totalWidth + layout.width + (index > 0 ? LAYOUT.mutatorGroupGapX : 0);
		}, 0);

		const stateGroupWidth = hasMutators
			? Math.max(
				LAYOUT.stateGroupMinWidth,
				(LAYOUT.stateGroupPaddingX * 2) + stateGroupInnerWidth,
			)
			: LAYOUT.stateGroupMinWidth;

		const stateGroupHeight = hasMutators
			? Math.max(LAYOUT.stateGroupMinHeight, tallestMutator + (LAYOUT.stateGroupPaddingY * 2) + LAYOUT.stateGroupHeaderOffsetY)
			: LAYOUT.stateGroupMinHeight;

		const stateGroupId = `${stateVariable.id}`;
		nodes.push({
			id: stateGroupId,
			type: 'labeledGroupNode',
			position: { x: stateGroupOffsetX, y: LAYOUT.canvasPaddingY },
			data: { label: stateVariable.name, position: 'top-left' } as GroupNodeProps,
			width: stateGroupWidth,
			height: stateGroupHeight,
			style: {
				borderRadius: 12,
				border: 'none',
				color: 'var(--vscode-foreground)',
			},
			draggable: false,
		});

		if (!hasMutators) {
			nodes.push({
				id: `${stateGroupId}:empty`,
				position: { x: LAYOUT.stateGroupPaddingX, y: LAYOUT.stateGroupHeaderOffsetY + 28 },
				parentId: stateGroupId,
				extent: 'parent',
				data: { label: 'No states or mutators' },
				width: Math.min(stateGroupWidth - (LAYOUT.stateGroupPaddingX * 2), LAYOUT.graphNodeWidth + 40),
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

		let mutatorOffsetX = LAYOUT.stateGroupPaddingX;
		for (const mutatorLayout of mutatorLayouts) {
			const mutatorGroupId = `${mutatorLayout.mutator.id}`;
			nodes.push({
				id: mutatorGroupId,
				type: 'labeledGroupNode',
				position: {
					x: mutatorOffsetX,
					y: LAYOUT.stateGroupHeaderOffsetY,
				},
				parentId: stateGroupId,
				extent: 'parent',
				data: { label: mutatorLayout.mutator.name, position: 'top-left' } as GroupNodeProps,
				width: mutatorLayout.width,
				height: mutatorLayout.height,
				style: {
					borderRadius: 14,
					border: 'none',
					color: 'var(--vscode-foreground)',
				},
				draggable: false,
			});

			// const nodeIdMap = new Map<Id, string>();
			for (const graphNode of mutatorLayout.layoutedNodes) {
				const flowNodeId = `${graphNode.id}`;
				// nodeIdMap.set(graphNode.id, flowNodeId);
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
			
			for (const transition of mutatorLayout.mutator.transitions) {
				const source = transition.fromNodeId;
				const target = transition.toNodeId;

				if (!source || !target)
					continue;

				// console.debug(transition.fromNodeId, source, transition.toNodeId, target)

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

			mutatorOffsetX += mutatorLayout.width + LAYOUT.mutatorGroupGapX;
		}

		stateGroupOffsetX += stateGroupWidth + LAYOUT.stateGroupGapX;
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

		void (async () => {
			try {
				const nextFlowState = await toFlow(model);
				if (!cancelled) {
					setFlowState(nextFlowState);
				}
			} catch (error) {
				console.error('Failed to layout state diagram with ELK', error);
				if (!cancelled) {
					setFlowState({ nodes: [], edges: [] });
				}
			}
		})();

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
