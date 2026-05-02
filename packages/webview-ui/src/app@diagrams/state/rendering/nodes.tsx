import LabeledGroupNode from '@/app@components/xyflow-react/components/LabeledGroupNode';
import { memo, type CSSProperties, type ReactNode } from 'react';
import { Handle, Position, type NodeTypes } from '@xyflow/react';
import { getColor } from '@/app@utils/utils';
import { commonSourceHandles, commonTargetHandles } from '@/app@diagrams/activity/diagram-rendering/nodeTypes';
import { cn } from '@/app@shadcn/lib/utils';

const labelClass = "leading-none font-semibold px-0.75 py-0.5 rounded text-center"

export type StateVisualNodeData = {
	label?: string;
	color?: string;
	width?: number;
	height?: number;
};

export function NodeShell({ width, height, children }: { width?: number; height?: number; children: ReactNode }) {
	return (
		<>
			{commonSourceHandles(false, 0, 0)}
			<div className="relative flex items-center justify-center box-border overflow-visible" style={{ width, height }}>
				{children}
			</div>
			{commonTargetHandles(false, 0, 0)}
		</>
	);
}

export function CenteredLabel({ label, color, background, className }: { label?: string, color?: string, background?: string, className?: string }) {
	if (!label?.length)
		return null;

	return (
		<span
			className={cn(`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 truncate text-[10px]`, labelClass, className)}
			style={{ color: color ?? 'var(--vscode-foreground)', background }}
		>
			{label}
		</span>
	);
}

export function StateUpdateBadge({label, color, className}: { label?: string; color?: string; className?: string }) {
	return (
		<span className={cn(labelClass, className)} style={{ color: 'white', background: color }}>
			{label?.length ? label : 'update'}
		</span>
	);
}

type RFNodeProps = { data: StateVisualNodeData };

export const StateUpdateNode = memo(({ data }: RFNodeProps) => {
	const width = data.width;
	const height = data.height;

	return (
		<NodeShell width={width} height={height}>
			<div
				className="flex items-center justify-center box-border rounded-xl border px-2 text-center text-[12.5px]"
				style={{
					width,
					height,
					border: '1px solid var(--vscode-button-border)',
					background: data.color ?? 'var(--vscode-input-background)',
					color: 'white',
				}}
			>
				<StateUpdateBadge label={data.label} color={data.color} />
			</div>
		</NodeShell>
	);
});

export const DecisionNode = memo(({ data }: RFNodeProps) => {
	const width = data.width;
	const height = data.height;

	return (
		<NodeShell width={width} height={height}>
			{/* <p>{width}</p>
			<p>{height}</p> */}
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
			<CenteredLabel label={data.label} background={data.color} color="white" className='not-[&:hover]:max-w-58' />
		</NodeShell>
	);
});

export const EntryNode = memo(({ data }: RFNodeProps) => {
	const size = Math.min(data.width ?? 0, data.height ?? 0);

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

export const ExitNode = memo(({ data }: RFNodeProps) => {
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
			<CenteredLabel label={data.label} background={data.color} className='translate-y-[170%] not-[&:hover]:max-w-30' />
		</NodeShell>
	);
});

export const ExceptionNode = memo(({ data }: RFNodeProps) => {
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
			<CenteredLabel label={data.label} background={data.color} className='translate-y-[170%] not-[&:hover]:max-w-30' />
		</NodeShell>
	);
});

export const nodeTypes: NodeTypes = {
	labeledGroupNode: LabeledGroupNode,
	stateUpdateNode: StateUpdateNode,
	decisionNode: DecisionNode,
	entryNode: EntryNode,
	exitNode: ExitNode,
	exceptionNode: ExceptionNode,
};

const NODE_COLORS = {
	neutral: 'color-mix(in srgb, #454545 88%, transparent)',
	decision: 'color-mix(in srgb, #24af78 88%, transparent)',
	tryDecision: 'color-mix(in srgb, #af6b07 88%, transparent)',
	switchDecision: 'color-mix(in srgb, #7c9b2e 88%, transparent)',
	loopDecision: 'color-mix(in srgb, #008f9e 88%, transparent)',
	throw: 'color-mix(in srgb, #ff4440 88%, transparent)',
	stateVariable: (text) => getColor(text, { lightness: 23, blockedHueRanges: [ [-1, -1] ] }),
	mutator: (text) => getColor(text, { lightness: 38, blockedHueRanges: [ [-1, -1] ] }),
	stateUpdate: (text) => `color-mix(in srgb, ${getColor(text, { lightness: 74, blockedHueRanges: [ [350, 20] ] })} 88%, transparent)`,
};

export function getNodeColor(type: string | keyof typeof NODE_COLORS, text: string): string {
	const clr = NODE_COLORS[type]
	if (clr)
		return typeof clr == 'function' ? clr(text) : clr;
	return NODE_COLORS.neutral;
}

export function getGraphNodeVisual(graphNode) {
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

	if (graphNode.kind == 'switch-decision') {
		return {
			type: 'decisionNode',
			data: { label: graphNode.label, color: getNodeColor('switchDecision', graphNode.label) },
		};
	}

	if (graphNode.kind == 'loop-decision') {
		return {
			type: 'decisionNode',
			data: { label: graphNode.label, color: getNodeColor('loopDecision', graphNode.label) },
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
