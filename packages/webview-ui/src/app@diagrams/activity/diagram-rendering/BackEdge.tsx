import { BaseEdge, type EdgeProps } from '@xyflow/react';

export function buildBackEdgePath(sourceX: number, sourceY: number, targetX: number, targetY: number, innerDecisionCount: number): string {
	const leftDetourDistance = 200 + innerDecisionCount * 125;
	const leftDetourX = sourceX - leftDetourDistance;

	return [
		`M ${sourceX} ${sourceY}`,
		`L ${leftDetourX} ${sourceY}`,
		`L ${leftDetourX} ${targetY}`,
		`L ${targetX} ${targetY}`,
	].join(' ');
}

export default function BackEdge({ id, sourceX, sourceY, targetX, targetY, markerEnd, style, data }: EdgeProps) {
	const rawInnerDecisionCount = (data as { innerDecisionCount?: unknown } | undefined)?.innerDecisionCount;
	const innerDecisionCount = typeof rawInnerDecisionCount === 'number' ? rawInnerDecisionCount : 0;
	const path = buildBackEdgePath(sourceX, sourceY, targetX, targetY, innerDecisionCount);

	return (
		<BaseEdge
			id={id}
			path={path}
			markerEnd={markerEnd}
			style={style}
		/>
	);
}