import type { EdgeProps } from '@xyflow/react';
import { BaseEdge, EdgeLabelRenderer } from '@xyflow/react';

type Point = { x: number; y: number };

const LABEL_OFFSET_FROM_END = 44;

function hasElkPoints(data: unknown): data is { points: Point[] } {
	if (!data || typeof data !== 'object') return false;
	const pts = (data as { points?: unknown }).points;

	return (
		Array.isArray(pts) &&
		pts.length >= 2 &&
		pts.every(
			(p) =>
				p &&
				typeof (p as Point).x === 'number' &&
				typeof (p as Point).y === 'number',
		)
	);
}

function pointsToPath(points: Point[]): string {
	return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
}

function distance(a: Point, b: Point): number {
	return Math.hypot(b.x - a.x, b.y - a.y);
}

function pointBackFromEnd(points: Point[], offset: number): Point {
	let remaining = offset;

	for (let i = points.length - 1; i > 0; i -= 1) {
		const end = points[i];
		const start = points[i - 1];
		const len = distance(start, end);

		if (len >= remaining) {
			const t = (len - remaining) / len;
			return {
				x: start.x + (end.x - start.x) * t,
				y: start.y + (end.y - start.y) * t,
			};
		}

		remaining -= len;
	}

	return points[0];
}

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
	const path = pointsToPath(points);
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

			{label && (
				<EdgeLabelRenderer>
					<div
						style={{
							position: 'absolute',
							transform: `translate(-50%, -50%) translate(${labelPos.x}px, ${labelPos.y}px)`,
							background: 'black',
							padding: '2px 6px',
							fontSize: 11,
							pointerEvents: 'all',
							borderRadius: 4,
							color: 'white',
							whiteSpace: 'nowrap',
							zIndex: 20,
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