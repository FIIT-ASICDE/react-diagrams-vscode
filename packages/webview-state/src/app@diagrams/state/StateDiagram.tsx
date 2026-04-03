import { useMemo } from 'react';
import { Background, Controls, MarkerType, ReactFlow, type Edge, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Id, StateDiagram as StateDiagramModel, StateGraphNode } from '@react-diagrams/core';

type StateDiagramProps = {
	model?: StateDiagramModel;
};

const LAYOUT = {
	stateGroupMinWidth: 300,
	stateGroupGapX: 40,
	stateGroupPaddingX: 24,
	stateGroupPaddingBottom: 20,
	stateGroupHeaderY: 44,
	mutatorGroupWidth: 280,
	mutatorGroupGapX: 24,
	mutatorGroupPaddingX: 20,
	mutatorGroupPaddingTop: 38,
	mutatorGroupPaddingBottom: 18,
	nodeHeight: 52,
	nodeGapY: 22,
};

function asNodeLabel(node: StateGraphNode) {
	if (node.nodeType === 'state-update') {
		const expr = node.expressionText ? `: ${node.expressionText}` : '';
		return `${node.kind}${expr}`;
	}

	return `${node.kind}${node.label ? `: ${node.label}` : ''}`;
}

function getMutatorHeight(nodeCount: number) {
	return Math.max(
		130,
		LAYOUT.mutatorGroupPaddingTop +
		(LAYOUT.nodeHeight * nodeCount) +
		(Math.max(0, nodeCount - 1) * LAYOUT.nodeGapY) +
		LAYOUT.mutatorGroupPaddingBottom,
	);
}

function toFlow(model?: StateDiagramModel) {
	const nodes: Node[] = [];
	const edges: Edge[] = [];

	if (!model?.stateVariables?.length)
		return { nodes, edges };

	let stateGroupOffsetX = 0;

	for (const stateVariable of model.stateVariables) {
		const mutators = stateVariable.mutators ?? [];
		const hasMutators = mutators.length > 0;
		const mutatorHeights = mutators.map((mutator) => getMutatorHeight(mutator.nodes.length));
		const tallestMutator = mutatorHeights.length ? Math.max(...mutatorHeights) : 0;

		const stateGroupWidth = hasMutators
			? Math.max(
				LAYOUT.stateGroupMinWidth,
				(LAYOUT.stateGroupPaddingX * 2) +
				(mutators.length * LAYOUT.mutatorGroupWidth) +
				((mutators.length - 1) * LAYOUT.mutatorGroupGapX),
			)
			: LAYOUT.stateGroupMinWidth;

		const stateGroupHeight = hasMutators
			? LAYOUT.stateGroupHeaderY + tallestMutator + LAYOUT.stateGroupPaddingBottom
			: 170;

		const stateGroupId = `state-group:${stateVariable.id}`;
		nodes.push({
			id: stateGroupId,
			type: 'group',
			position: { x: stateGroupOffsetX, y: 20 },
			data: { label: stateVariable.name },
			style: {
				width: stateGroupWidth,
				height: stateGroupHeight,
				borderRadius: 12,
				border: '2px solid var(--vscode-editorWidget-border)',
				background: 'var(--vscode-editorWidget-background)',
				color: 'var(--vscode-foreground)',
				padding: 8,
				fontWeight: 700,
				fontSize: 13,
			},
		});

		if (!hasMutators) {
			nodes.push({
				id: `${stateGroupId}:empty`,
				position: { x: 18, y: 54 },
				parentId: stateGroupId,
				extent: 'parent',
				data: { label: 'No states or mutators' },
				style: {
					width: stateGroupWidth - 36,
					padding: 14,
					borderRadius: 8,
					border: '1px dashed var(--vscode-descriptionForeground)',
					background: 'transparent',
					color: 'var(--vscode-descriptionForeground)',
					fontStyle: 'italic',
				},
				draggable: false,
				selectable: false,
			});
		}

		for (let mutatorIndex = 0; mutatorIndex < mutators.length; mutatorIndex++) {
			const mutator = mutators[mutatorIndex];
			const mutatorHeight = mutatorHeights[mutatorIndex];
			const mutatorGroupId = `${stateGroupId}:mutator-group:${mutator.id}`;

			nodes.push({
				id: mutatorGroupId,
				type: 'group',
				position: {
					x: LAYOUT.stateGroupPaddingX + (mutatorIndex * (LAYOUT.mutatorGroupWidth + LAYOUT.mutatorGroupGapX)),
					y: LAYOUT.stateGroupHeaderY,
				},
				parentId: stateGroupId,
				extent: 'parent',
				data: { label: mutator.name },
				style: {
					width: LAYOUT.mutatorGroupWidth,
					height: mutatorHeight,
					borderRadius: 10,
					border: '1px solid var(--vscode-focusBorder)',
					background: 'var(--vscode-editor-background)',
					color: 'var(--vscode-foreground)',
					padding: 8,
					fontWeight: 600,
					fontSize: 12,
				},
			});

			const nodeIdMap = new Map<Id, string>();
			for (let nodeIndex = 0; nodeIndex < mutator.nodes.length; nodeIndex++) {
				const graphNode = mutator.nodes[nodeIndex];
				const flowNodeId = `${mutatorGroupId}:node:${graphNode.id}`;
				nodeIdMap.set(graphNode.id, flowNodeId);

				nodes.push({
					id: flowNodeId,
					position: {
						x: LAYOUT.mutatorGroupPaddingX,
						y: LAYOUT.mutatorGroupPaddingTop + (nodeIndex * (LAYOUT.nodeHeight + LAYOUT.nodeGapY)),
					},
					parentId: mutatorGroupId,
					extent: 'parent',
					data: { label: asNodeLabel(graphNode) },
					style: {
						width: LAYOUT.mutatorGroupWidth - (LAYOUT.mutatorGroupPaddingX * 2),
						height: LAYOUT.nodeHeight,
						borderRadius: 8,
						border: graphNode.nodeType === 'state-update'
							? '1px solid var(--vscode-testing-iconPassed)'
							: '1px solid var(--vscode-button-border)',
						background: graphNode.nodeType === 'state-update'
							? 'color-mix(in srgb, var(--vscode-testing-iconPassed) 12%, transparent)'
							: 'var(--vscode-input-background)',
						color: 'var(--vscode-foreground)',
						fontSize: 12,
					},
				});
			}

			for (const transition of mutator.transitions) {
				const source = nodeIdMap.get(transition.fromNodeId);
				const target = nodeIdMap.get(transition.toNodeId);

				if (!source || !target)
					continue;

				edges.push({
					id: `${mutatorGroupId}:edge:${transition.id}`,
					source,
					target,
					label: transition.label,
					type: 'floating',
					animated: transition.kind !== 'normal',
					markerEnd: { type: MarkerType.Arrow },
				});
			}
		}

		stateGroupOffsetX += stateGroupWidth + LAYOUT.stateGroupGapX;
	}

	return { nodes, edges };
}

export default function StateDiagram({ model }: StateDiagramProps) {
	const { nodes, edges } = useMemo(() => toFlow(model), [model]);

	return (
		<div className="h-full w-full">
			{(!model || !model.stateVariables?.length) && (
				<div className="absolute z-10 rounded border border-(--vscode-editorWidget-border) bg-(--vscode-editorWidget-background) px-3 py-2 text-xs text-(--vscode-descriptionForeground)">
					No state variables found.
				</div>
			)}
			<ReactFlow
				nodes={nodes}
				edges={edges}
				nodesConnectable={false}
				elementsSelectable
				fitView
				fitViewOptions={{ padding: 0.2 }}
			>
				<Controls />
				<Background gap={18} size={1} />
			</ReactFlow>
		</div>
	);
}
