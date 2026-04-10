import { BaseEdge, type EdgeProps } from '@xyflow/react';

function buildBackEdgePath(sourceX: number, sourceY: number, targetX: number, targetY: number): string {
	// Route feedback edges to the left, with enough padding to clear nodes
	const minX = Math.min(sourceX, targetX);
	const detourX = minX - 200;

	return [
		`M ${sourceX} ${sourceY}`,
		`L ${detourX} ${sourceY}`,
		`L ${detourX} ${targetY}`,
		`L ${targetX} ${targetY}`,
	].join(' ');
}

export default function BackEdge({ id, sourceX, sourceY, targetX, targetY, markerEnd, style }: EdgeProps) {
	const path = buildBackEdgePath(sourceX, sourceY, targetX, targetY);

	return (
		<BaseEdge
			id={id}
			path={path}
			markerEnd={markerEnd}
			style={style}
		/>
	);
}