import LabeledGroupNode from '@/app@components/xyflow-react/components/LabeledGroupNode';
import { memo, type CSSProperties, type ReactNode } from 'react';
import { Handle, Position, type NodeTypes } from '@xyflow/react';
import { getColor } from '@/app@utils/utils';

export type StateVisualNodeData = {
	label?: string;
	color?: string;
	width?: number;
	height?: number;
};

function NodeShell({ width, height, children }: { width: number; height: number; children: ReactNode }) {
	return (
		<>
			<div
				className="relative flex items-center justify-center box-border overflow-visible"
				style={{
					width,
					height,
				}}
			>
				{children}
			</div>
			<Handle type="source" position={Position.Top} />
			<Handle type="target" position={Position.Bottom} />
		</>
	);
}

function CenteredLabel({ label }: { label?: string }) {
	if (!label?.length)
		return null;

	return (
		<span
			className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 overflow-hidden text-ellipsis whitespace-nowrap text-center text-[10px] leading-none font-semibold z-50"
			style={{
				color: 'var(--vscode-foreground)',
			}}
		>
			{label}
		</span>
	);
}

type RFNodeProps = { data: StateVisualNodeData };

const StateUpdateNode = memo(({ data }: RFNodeProps) => {
	const width = data.width ?? 220;
	const height = data.height ?? 56;

	return (
		<NodeShell width={width} height={height}>
			<div
				className="flex items-center justify-center box-border rounded-lg border px-2 text-center text-[12px]"
				style={{
					width,
					height,
					border: '1px solid var(--vscode-button-border)',
					background: data.color ?? 'var(--vscode-input-background)',
					color: 'var(--vscode-foreground)',
				}}
			>
				{data.label}
			</div>
		</NodeShell>
	);
});

const DecisionNode = memo(({ data }: RFNodeProps) => {
	const width = data.width ?? 36;
	const height = data.height ?? 24;

	return (
		<NodeShell width={width} height={height}>
			<div
				className="box-border border"
				style={{
					width,
					height,
					background: data.color ?? 'var(--vscode-input-background)',
					border: '1px solid var(--vscode-button-border)',
					clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
					boxSizing: 'border-box',
				}}
			/>
			<CenteredLabel label={data.label} />
		</NodeShell>
	);
});

const EntryNode = memo(({ data }: RFNodeProps) => {
	const size = Math.min(data.width ?? 20, data.height ?? 20);

	return (
		<NodeShell width={size} height={size}>
			<div
				className="box-border rounded-full"
				style={{
					width: size,
					height: size,
					background: data.color ?? 'var(--vscode-input-background)',
				}}
			/>
			<CenteredLabel label={data.label} />
		</NodeShell>
	);
});

const ExitNode = memo(({ data }: RFNodeProps) => {
	const size = Math.min(data.width ?? 20, data.height ?? 20);

	return (
		<NodeShell width={size} height={size}>
			<div
				className="box-border rounded-full"
				style={{
					width: size,
					height: size,
					border: '1px solid #808080',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					boxSizing: 'border-box',
				}}
			>
				<div
					className="rounded-full"
					style={{
						width: size - 6,
						height: size - 6,
						background: data.color ?? 'var(--vscode-input-background)',
					}}
				/>
			</div>
			<CenteredLabel label={data.label} />
		</NodeShell>
	);
});

const ExceptionNode = memo(({ data }: RFNodeProps) => {
	const size = Math.min(data.width ?? 20, data.height ?? 20);

	const stroke = Math.max(2, Math.round(size * 0.12)); // thickness
	const length = Math.max(8, Math.round(size * 1.1));
	return (
		<NodeShell width={size} height={size}>
			<div
				className="relative shrink-0"
				style={{
					width: size,
					height: size,
				}}
			>
				<div
					className="absolute left-1/2 top-1/2 rounded-sm -translate-x-1/2 -translate-y-1/2 rotate-45"
					style={{
						width: length,
						height: stroke,
						background: data.color ?? 'var(--vscode-input-background)',
					}}
				/>
				<div
					className="absolute left-1/2 top-1/2 rounded-sm -translate-x-1/2 -translate-y-1/2 -rotate-45"
					style={{
						width: length,
						height: stroke,
						background: data.color ?? 'var(--vscode-input-background)',
					}}
				/>
			</div>
			<CenteredLabel label={data.label} />
		</NodeShell>
	);
});

// function IconNode({ data, children }: { data: StateVisualNodeData; children: ReactNode }) {
// 	const size = Math.min(data.width ?? 20, data.height ?? 20);

// 	const tintStyle: CSSProperties = {
// 		width: size,
// 		height: size,
// 		color: data.color ?? 'var(--vscode-input-background)',
// 		display: 'flex',
// 		alignItems: 'center',
// 		justifyContent: 'center',
// 		flexShrink: 0,
// 	};

// 	return (
// 		<NodeShell width={size} height={size}>
// 			<div className="w-full h-full shrink-0" style={tintStyle}>
// 				{children}
// 			</div>
// 			<CenteredLabel label={data.label} />
// 		</NodeShell>
// 	);
// }

// const ExitNode = memo(({ data }: RFNodeProps) => (
// 	<IconNode data={data}>
// 		<svg
// 			xmlns="http://www.w3.org/2000/svg"
// 			viewBox="0 0 64 64"
// 			width="100%"
// 			height="100%"
// 			preserveAspectRatio="xMidYMid meet"
// 			style={{ display: 'block' }}
// 		>
// 			<circle
// 				cx="32"
// 				cy="32"
// 				r="10"
// 				fill="none"
// 				stroke="currentColor"
// 				strokeWidth="4"
// 			/>
// 			<circle
// 				cx="32"
// 				cy="32"
// 				r="6"
// 				fill="currentColor"
// 			/>
// 		</svg>
// 	</IconNode>
// ));

// const ExceptionNode = memo(({ data }: RFNodeProps) => (
// 	<IconNode data={data}>
// 		<svg
// 			xmlns="http://www.w3.org/2000/svg"
// 			viewBox="0 0 82.167 82.167"
// 			width="100%"
// 			height="100%"
// 			preserveAspectRatio="xMidYMid meet"
// 			style={{ display: 'block' }}
// 		>
// 			<path
// 				d="M4 4 L78 78"
// 				stroke="currentColor"
// 				strokeWidth="6"
// 				strokeLinecap="round"
// 			/>
// 			<path
// 				d="M78 4 L4 78"
// 				stroke="currentColor"
// 				strokeWidth="6"
// 				strokeLinecap="round"
// 			/>
// 		</svg>
// 	</IconNode>
// ));

export const nodeTypes: NodeTypes = {
	labeledGroupNode: LabeledGroupNode,
	stateUpdateNode: StateUpdateNode,
	decisionNode: DecisionNode,
	entryNode: EntryNode,
	exitNode: ExitNode,
	exceptionNode: ExceptionNode,
};

const NODE_COLORS = {
	neutral: 'var(--vscode-input-background)',
	decision: 'color-mix(in srgb, var(--vscode-testing-iconPassed) 64%, transparent)',
	tryDecision: 'color-mix(in srgb, var(--vscode-testing-iconQueued, #f59e0b) 64%, transparent)',
	throw: 'var(--vscode-errorForeground, #ef4444)',
	stateUpdate: (text) => `color-mix(in srgb, ${getColor(text, { depth: 4, blockedHueRanges: [ [350, 20] ] })} 64%, transparent)`,
};

export function getNodeColor(type: string, text: string) {
	const clr = NODE_COLORS[type]
	if (clr)
		return typeof clr == 'function' ? clr(text) : clr;
	return NODE_COLORS.neutral;
}

export function getGraphNodeVisual(graphNode): { type: string; data: any } {
	if (graphNode.nodeType == 'state-update') {
		return {
			type: 'stateUpdateNode',
			data: { label: graphNode.label, color: getNodeColor('stateUpdate', graphNode.label) },
		};
	}

	if (graphNode.kind == 'entry') {
		return {
			type: 'entryNode',
			data: { label: null, color: getNodeColor('neutral', graphNode.label) },
		};
	}

	if (graphNode.kind == 'decision') {
		return {
			type: 'decisionNode',
			data: { label: graphNode.label, color: getNodeColor('decision', graphNode.label) },
		};
	}

	if (graphNode.kind == 'try-decision') {
		return {
			type: 'decisionNode',
			data: { label: graphNode.label, color: getNodeColor('tryDecision', graphNode.label) },
		};
	}

	if (graphNode.kind == 'throw') {
		return {
			type: 'exceptionNode',
			data: { label: graphNode.label, color: getNodeColor('throw', graphNode.label) },
		};
	}

	if (graphNode.kind == 'merge') {
		return {
			type: 'decisionNode',
			data: { label: graphNode.label, color: getNodeColor('merge', graphNode.label) },
		};
	}

	if (graphNode.kind == 'exit') {
		return {
			type: 'exitNode',
			data: { label: graphNode.label, color: getNodeColor('exit', graphNode.label) },
		};
	}

	return {
		type: 'decisionNode',
		data: { label: graphNode.label, color: getNodeColor('neutral', graphNode.label) },
	};
}
