import type { EdgeProps } from '@xyflow/react';
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from '@xyflow/react';

type Point = { x: number; y: number };

const LABEL_OFFSET_FROM_END = 28;

function pointBackFromEnd(prev: Point, end: Point, offset: number): Point {
	const dx = end.x - prev.x;
	const dy = end.y - prev.y;
	const length = Math.sqrt(dx * dx + dy * dy) || 1;

	return {
		x: end.x - (dx / length) * offset,
		y: end.y - (dy / length) * offset,
	};
}

export default function DynamicPathEdge(props: EdgeProps) {
	const {
		id,
		style,
		label,
		markerEnd,
		sourceX,
		sourceY,
		targetX,
		targetY,
		sourcePosition,
		targetPosition,
	} = props;

	const [path] = getSmoothStepPath({
		sourceX,
		sourceY,
		targetX,
		targetY,
		sourcePosition,
		targetPosition,
		borderRadius: 8,
		offset: 24,
	});

	const labelPos = pointBackFromEnd(
		{ x: sourceX, y: sourceY },
		{ x: targetX, y: targetY },
		LABEL_OFFSET_FROM_END,
	);

	return (
		<>
			<BaseEdge
				path={path}
				markerEnd={markerEnd}
				style={{ fill: 'none', ...style }}
			/>

			{label && (
				<EdgeLabelRenderer>
					<div
						style={{
							position: 'absolute',
							transform: `translate(-50%, -50%) translate(${labelPos.x}px, ${labelPos.y}px)`,
							background: 'black',
							padding: '1px 4px',
							fontSize: 10,
							pointerEvents: 'all',
							borderRadius: 3,
							color: 'white',
							whiteSpace: 'nowrap',
						}}
						className="nodrag nopan"
						onContextMenu={(event) => {
							event.preventDefault();
							event.stopPropagation();

							window.dispatchEvent(
								new CustomEvent('activity/edgeLabelContextMenu', {
									detail: {
										edgeId: String(id),
										label: typeof label === 'string' ? label : '',
									},
								}),
							);
						}}
					>
						{typeof label === 'string' ? label : null}
					</div>
				</EdgeLabelRenderer>
			)}
		</>
	);
}