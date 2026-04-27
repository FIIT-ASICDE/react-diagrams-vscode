import type { EdgeProps } from '@xyflow/react';
import { BaseEdge, EdgeLabelRenderer, Position } from '@xyflow/react';

type Point = { x: number; y: number };

const LABEL_OFFSET_FROM_END = 34;
const STUB = 28;
const POINTS_FRESHNESS_TOLERANCE = 10;
const MIN_SEGMENT = 6;

function hasBakedPoints(data: unknown): data is { points: Point[] } {
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

function offsetByPosition(point: Point, position: Position, offset: number): Point {
	switch (position) {
		case Position.Top:
			return { x: point.x, y: point.y - offset };
		case Position.Bottom:
			return { x: point.x, y: point.y + offset };
		case Position.Left:
			return { x: point.x - offset, y: point.y };
		case Position.Right:
			return { x: point.x + offset, y: point.y };
		default:
			return point;
	}
}

function selfRoute(args: {
	sourceX: number;
	sourceY: number;
	targetX: number;
	targetY: number;
	sourcePosition: Position;
	targetPosition: Position;
}): Point[] {
	const {
		sourceX,
		sourceY,
		targetX,
		targetY,
		sourcePosition,
		targetPosition,
	} = args;

	const source: Point = { x: sourceX, y: sourceY };
	const target: Point = { x: targetX, y: targetY };

	const sourceStub = offsetByPosition(source, sourcePosition, STUB);
	const targetStub = offsetByPosition(target, targetPosition, STUB);

	const sourceVertical =
		sourcePosition === Position.Top || sourcePosition === Position.Bottom;
	const targetVertical =
		targetPosition === Position.Top || targetPosition === Position.Bottom;

	if (sourceVertical && targetVertical) {
		const midY = (sourceStub.y + targetStub.y) / 2;

		return cleanPoints([
			source,
			sourceStub,
			{ x: sourceStub.x, y: midY },
			{ x: targetStub.x, y: midY },
			targetStub,
			target,
		]);
	}

	if (!sourceVertical && !targetVertical) {
		const midX = (sourceStub.x + targetStub.x) / 2;

		return cleanPoints([
			source,
			sourceStub,
			{ x: midX, y: sourceStub.y },
			{ x: midX, y: targetStub.y },
			targetStub,
			target,
		]);
	}

	if (sourceVertical) {
		return cleanPoints([
			source,
			sourceStub,
			{ x: sourceStub.x, y: targetStub.y },
			targetStub,
			target,
		]);
	}

	return cleanPoints([
		source,
		sourceStub,
		{ x: targetStub.x, y: sourceStub.y },
		targetStub,
		target,
	]);
}

function arePointsFresh(
	points: Point[],
	sourceX: number,
	sourceY: number,
	targetX: number,
	targetY: number,
): boolean {
	const first = points[0];
	const last = points[points.length - 1];

	if (!first || !last) return false;

	return (
		Math.abs(first.x - sourceX) <= POINTS_FRESHNESS_TOLERANCE &&
		Math.abs(first.y - sourceY) <= POINTS_FRESHNESS_TOLERANCE &&
		Math.abs(last.x - targetX) <= POINTS_FRESHNESS_TOLERANCE &&
		Math.abs(last.y - targetY) <= POINTS_FRESHNESS_TOLERANCE
	);
}

function isBackEdgeProps(props: EdgeProps): boolean {
	const data = props.data as { semanticKind?: string } | undefined;

	if (data?.semanticKind === 'loop-back') return true;

	return props.targetY < props.sourceY - 50;
}

function cleanPoints(points: Point[]): Point[] {
	const withoutTinySegments: Point[] = [];

	for (const point of points) {
		const prev = withoutTinySegments[withoutTinySegments.length - 1];

		if (!prev) {
			withoutTinySegments.push(point);
			continue;
		}

		const dx = Math.abs(point.x - prev.x);
		const dy = Math.abs(point.y - prev.y);

		if (dx < MIN_SEGMENT && dy < MIN_SEGMENT) {
			continue;
		}

		withoutTinySegments.push(point);
	}

	const simplified: Point[] = [];

	for (const point of withoutTinySegments) {
		simplified.push(point);

		while (simplified.length >= 3) {
			const a = simplified[simplified.length - 3];
			const b = simplified[simplified.length - 2];
			const c = simplified[simplified.length - 1];

			const sameVertical =
				Math.abs(a.x - b.x) < 0.5 && Math.abs(b.x - c.x) < 0.5;

			const sameHorizontal =
				Math.abs(a.y - b.y) < 0.5 && Math.abs(b.y - c.y) < 0.5;

			if (!sameVertical && !sameHorizontal) break;

			simplified.splice(simplified.length - 2, 1);
		}
	}

	return simplified;
}

function snapBackEdgeEndpoints(
	points: Point[],
	sourceX: number,
	sourceY: number,
	targetX: number,
	targetY: number,
): Point[] {
	if (points.length < 2) {
		return [
			{ x: sourceX, y: sourceY },
			{ x: targetX, y: targetY },
		];
	}

	const patched = [...points];

	patched[0] = { x: sourceX, y: sourceY };
	patched[patched.length - 1] = { x: targetX, y: targetY };

	return cleanPoints(patched);
}

function pointsToPath(points: Point[]): string {
	if (points.length === 0) return '';

	return points
		.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
		.join(' ');
}

function distance(a: Point, b: Point): number {
	return Math.hypot(b.x - a.x, b.y - a.y);
}

function pointBackFromEnd(points: Point[], offset: number): Point {
	if (points.length < 2) return points[0] ?? { x: 0, y: 0 };

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

export default function DynamicPathEdge(props: EdgeProps) {
	const {
		id,
		style,
		label,
		data,
		markerEnd,
		sourceX,
		sourceY,
		targetX,
		targetY,
		sourcePosition = Position.Bottom,
		targetPosition = Position.Top,
	} = props;

	const haveBaked = hasBakedPoints(data);
	const isBackEdge = isBackEdgeProps(props);

	let points: Point[];

	if (
		haveBaked &&
		arePointsFresh(data.points, sourceX, sourceY, targetX, targetY)
	) {
		points = cleanPoints(data.points);
	} else if (haveBaked && isBackEdge) {
		points = snapBackEdgeEndpoints(
			data.points,
			sourceX,
			sourceY,
			targetX,
			targetY,
		);
	} else {
		points = selfRoute({
			sourceX,
			sourceY,
			targetX,
			targetY,
			sourcePosition,
			targetPosition,
		});
	}

	const path = pointsToPath(points);
	const labelPos = pointBackFromEnd(points, LABEL_OFFSET_FROM_END);

	return (
		<>
			<BaseEdge
				path={path}
				markerEnd={markerEnd}
				style={{
					fill: 'none',
					strokeWidth: 1.6,
					...style,
				}}
			/>

			{label && (
				<EdgeLabelRenderer>
					<div
						style={{
							position: 'absolute',
							transform: `translate(-50%, -50%) translate(${labelPos.x}px, ${labelPos.y}px)`,
							background: '#111827',
							padding: '2px 6px',
							fontSize: 11,
							borderRadius: 4,
							color: 'white',
							whiteSpace: 'nowrap',
							pointerEvents: 'all',
							boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
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