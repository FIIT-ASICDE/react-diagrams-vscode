import type { EdgeProps } from '@xyflow/react';
import { BaseEdge, EdgeLabelRenderer } from '@xyflow/react';

type Point = { x: number; y: number };

const LABEL_OFFSET_FROM_END = 28;
const EDGE_GAP = 10; // 👈 toto si doladíš (8–14 vyzerá dobre)

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

function offsetPoint(from: Point, to: Point, offset: number): Point {
	const dx = to.x - from.x;
	const dy = to.y - from.y;
	const length = Math.sqrt(dx * dx + dy * dy) || 1;

	return {
		x: from.x + (dx / length) * offset,
		y: from.y + (dy / length) * offset,
	};
}

function pointBackFromEnd(prev: Point, end: Point, offset: number): Point {
	const dx = end.x - prev.x;
	const dy = end.y - prev.y;
	const length = Math.sqrt(dx * dx + dy * dy) || 1;
	return {
		x: end.x - (dx / length) * offset,
		y: end.y - (dy / length) * offset,
	};
}

export default function ElkPathEdge(props: EdgeProps) {
	const { id, style, label, data, markerEnd, sourceX, sourceY, targetX, targetY } = props;

	let path: string;
	let labelPos: Point;

	if (hasElkPoints(data)) {
		const points = [...data.points];

		// 👉 posuň prvý a posledný bod
		points[0] = offsetPoint(points[0], points[1], EDGE_GAP);
		points[points.length - 1] = offsetPoint(
			points[points.length - 1],
			points[points.length - 2],
			EDGE_GAP,
		);

		path = pointsToPath(points);

		labelPos = pointBackFromEnd(
			points[points.length - 2],
			points[points.length - 1],
			LABEL_OFFSET_FROM_END,
		);
	} else {
		// fallback
		const source: Point = { x: sourceX, y: sourceY };
		const target: Point = { x: targetX, y: targetY };

		const adjustedSource = offsetPoint(source, target, EDGE_GAP);
		const adjustedTarget = offsetPoint(target, source, EDGE_GAP);

		path = `M ${adjustedSource.x} ${adjustedSource.y}
		        L ${adjustedSource.x} ${adjustedTarget.y}
		        L ${adjustedTarget.x} ${adjustedTarget.y}`;

		labelPos = pointBackFromEnd(
			adjustedSource,
			adjustedTarget,
			LABEL_OFFSET_FROM_END,
		);
	}

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