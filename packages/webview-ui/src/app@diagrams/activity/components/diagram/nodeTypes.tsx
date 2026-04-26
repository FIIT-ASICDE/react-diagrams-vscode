import React, { memo } from 'react';
import { Diamond } from './Diamond';
import { HANDLE_CONFIGS, NodeHandles } from './handles';
import { nodeStyles } from '../../styles/node-styles';
import {
	DECISION_HEIGHT,
	FINAL_DOT_SIZE,
	FINAL_RING_SIZE,
	INITIAL_DOT_SIZE,
	MERGE_DIAMOND_SIZE,
	NODE_WRAPPER_WIDTH,
} from '../../styles/design-tokens';

type NodeData = {
	label?: string;
	color?: string;
	deps?: string;
	previewWidth?: number;
	previewHeight?: number;
};

const MAX_NODE_LABEL_LENGTH = 20;

function getRenderedNodeLabel(data: NodeData, fallback: string): string {
	const rawLabel = String(data.label ?? fallback).trim();
	if (!rawLabel) return fallback;
	return rawLabel.length > MAX_NODE_LABEL_LENGTH
		? `${rawLabel.slice(0, MAX_NODE_LABEL_LENGTH - 3)}...`
		: rawLabel;
}

type NodeProps = {
	data: NodeData;
	isConnectable: boolean;
};

// ─── Reusable shell ─────────────────────────────────────────────────────────

function NodeShell({ children }: { children: React.ReactNode }) {
	return <div style={nodeStyles.shell}>{children}</div>;
}

// ─── Stadium-shape nodes (action / expandable) ──────────────────────────────

const ActionNode = memo(({ data, isConnectable }: NodeProps) => (
	<NodeShell>
		<NodeHandles isConnectable={isConnectable} config={HANDLE_CONFIGS.flowOnly} />
		<div style={{ ...nodeStyles.action, background: data.color ?? nodeStyles.action.background }}>
			{getRenderedNodeLabel(data, 'Action')}
		</div>
	</NodeShell>
));

const ExpandableNode = memo(({ data, isConnectable }: NodeProps) => (
	<NodeShell>
		<NodeHandles isConnectable={isConnectable} config={HANDLE_CONFIGS.flowOnly} />
		<div
			style={{
				...nodeStyles.expandable,
				background: data.color ?? nodeStyles.expandable.background,
			}}
		>
			<span style={nodeStyles.expandableLabel}>{getRenderedNodeLabel(data, 'Expandable')}</span>
		</div>
	</NodeShell>
));

// ─── Diamond-shape nodes (decision / loop share one component) ──────────────

/**
 * Decision and loop are visually identical UML diamonds. Their only
 * difference in source code was the default fallback label, so we collapse
 * both into a single component parameterized by `defaultLabel`.
 */
function DiamondLabelNode({
	data,
	isConnectable,
	defaultLabel,
}: NodeProps & { defaultLabel: string }) {
	return (
		<NodeShell>
			<NodeHandles isConnectable={isConnectable} config={HANDLE_CONFIGS.decision} />
			<div style={nodeStyles.decisionWrap}>
				<Diamond width={NODE_WRAPPER_WIDTH} height={DECISION_HEIGHT} />
				<div style={nodeStyles.decisionLabel}>{getRenderedNodeLabel(data, defaultLabel)}</div>
			</div>
		</NodeShell>
	);
}

const DecisionNode = memo((props: NodeProps) => (
	<DiamondLabelNode {...props} defaultLabel="Decision" />
));

const LoopNode = memo((props: NodeProps) => (
	<DiamondLabelNode {...props} defaultLabel="Loop" />
));

// ─── Small-shape nodes (merge / initial / final) ────────────────────────────

const MergeNode = memo(({ isConnectable }: NodeProps) => (
	<NodeShell>
		<NodeHandles isConnectable={isConnectable} config={HANDLE_CONFIGS.mergeSmallShape} />
		<div style={nodeStyles.smallShapeWrap}>
			<Diamond width={MERGE_DIAMOND_SIZE} height={MERGE_DIAMOND_SIZE} />
		</div>
	</NodeShell>
));

const InitialNode = memo(({ isConnectable }: NodeProps) => (
	<NodeShell>
		<NodeHandles isConnectable={isConnectable} config={HANDLE_CONFIGS.initialSmallShape} />
		<div style={nodeStyles.smallShapeWrap}>
			<div style={{ ...nodeStyles.initialDot, width: INITIAL_DOT_SIZE, height: INITIAL_DOT_SIZE }} />
		</div>
	</NodeShell>
));

const FinalNode = memo(({ isConnectable }: NodeProps) => (
	<NodeShell>
		<NodeHandles isConnectable={isConnectable} config={HANDLE_CONFIGS.finalSmallShape} />
		<div style={nodeStyles.smallShapeWrap}>
			<div style={{ ...nodeStyles.finalRing, width: FINAL_RING_SIZE, height: FINAL_RING_SIZE }}>
				<div style={{ ...nodeStyles.finalDot, width: FINAL_DOT_SIZE, height: FINAL_DOT_SIZE }} />
			</div>
		</div>
	</NodeShell>
));

// ─── Text preview node ──────────────────────────────────────────────────────

const TextPreviewNode = memo(({ data, isConnectable }: NodeProps) => (
	<NodeShell>
		<NodeHandles isConnectable={isConnectable} config={HANDLE_CONFIGS.flowOnly} />
		<div
			style={{
				...nodeStyles.textPreview,
				width: typeof data.previewWidth === 'number' ? data.previewWidth : nodeStyles.textPreview.width,
				minHeight:
					typeof data.previewHeight === 'number'
						? data.previewHeight
						: nodeStyles.textPreview.minHeight,
			}}
		>
			{getRenderedNodeLabel(data, 'Preview')}
		</div>
	</NodeShell>
));

// ─── Public registry ────────────────────────────────────────────────────────

export const nodeTypes = {
	action: ActionNode,
	expandable: ExpandableNode,
	merge: MergeNode,
	decision: DecisionNode,
	loop: LoopNode,
	initial: InitialNode,
	end: FinalNode,
	textPreview: TextPreviewNode,
};