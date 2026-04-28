import type { EdgeProps } from '@xyflow/react';
import { BaseEdge } from '@xyflow/react';
import { EdgeLabel } from './edges/EdgeLabel';
import { hasElkPoints, pointBackFromEnd, pointsToRoundedPath, type Point } from './edges/edge-utils';

const LABEL_OFFSET_FROM_END = 44;
const CORNER_RADIUS = 8;

function fallbackPoints(props: EdgeProps): Point[] {
	const { sourceX, sourceY, targetX, targetY } = props;
	const midY = sourceY + (targetY - sourceY) / 2;

	return [
		{ x: sourceX, y: sourceY },
		{ x: sourceX, y: midY },
		{ x: targetX, y: midY },
		{ x: targetX, y: targetY },
	];
}

export default function ElkPathEdge(props: EdgeProps) {
	const { id, style, label, data, markerEnd } = props;

	const points = hasElkPoints(data) ? data.points : fallbackPoints(props);
	const path = pointsToRoundedPath(points, CORNER_RADIUS);
	const labelPos = pointBackFromEnd(points, LABEL_OFFSET_FROM_END);

	return (
		<>
			<BaseEdge
				path={path}
				markerEnd={markerEnd}
				style={{
					fill: 'none',
					strokeWidth: 1.5,
					...style,
				}}
			/>

			<EdgeLabel id={id} label={label} x={labelPos.x} y={labelPos.y} variant="view" />
		</>
	);
}