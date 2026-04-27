import type { EdgeProps } from '@xyflow/react';
import { BaseEdge, EdgeLabelRenderer, Position } from '@xyflow/react';

type Point = { x: number; y: number };

const LABEL_OFFSET_FROM_END = 34;
const STUB = 32;

/**
 * Tolerance (in pixels) for matching baked ELK points to current React
 * Flow source/target coordinates. ELK lands edge endpoints on node faces;
 * React Flow places handles slightly inside the face for visual styling,
 * so a few pixels of slack is normal even before any drag has happened.
 */
const POINTS_FRESHNESS_TOLERANCE = 8;

/**
 * Strategy:
 *
 *   - If the edge has baked-in `data.points` from ELK AND those points
 *     still match the edge's current React Flow source / target
 *     positions (within a small tolerance), use them. This produces the
 *     same clean orthogonal routing as the View panel.
 *
 *   - Otherwise (the user has dragged a node, so the baked geometry is
 *     stale), self-route: emit a 6-point orthogonal path that respects
 *     `sourcePosition` / `targetPosition`. The route uses short stubs
 *     out of each handle, then a single mid-axis bend, so even after
 *     dragging the edge stays cleanly orthogonal.
 *
 * Net effect: initial render after layout is identical to View; once
 * the user starts editing, edges follow their nodes around without
 * vanishing or zig-zagging.
 */

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
	const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition } = args;

	const source: Point = { x: sourceX, y: sourceY };
	const target: Point = { x: targetX, y: targetY };
	const sourceStub = offsetByPosition(source, sourcePosition, STUB);
	const targetStub = offsetByPosition(target, targetPosition, STUB);

	const sourceIsVertical =
		sourcePosition === Position.Top || sourcePosition === Position.Bottom;
	const targetIsVertical =
		targetPosition === Position.Top || targetPosition === Position.Bottom;

	// Vertical → vertical: route via mid-Y bend.
	if (sourceIsVertical && targetIsVertical) {
		const midY = (sourceStub.y + targetStub.y) / 2;
		return [
			source,
			sourceStub,
			{ x: sourceStub.x, y: midY },
			{ x: targetStub.x, y: midY },
			targetStub,
			target,
		];
	}

	// Horizontal → horizontal: route via mid-X bend.
	if (!sourceIsVertical && !targetIsVertical) {
		const midX = (sourceStub.x + targetStub.x) / 2;
		return [
			source,
			sourceStub,
			{ x: midX, y: sourceStub.y },
			{ x: midX, y: targetStub.y },
			targetStub,
			target,
		];
	}

	// Mixed orientations: source vertical → target horizontal (or vice
	// versa). The natural orthogonal path is an L-shape: leave the
	// source along its axis, then turn onto the target's axis.
	if (sourceIsVertical) {
		// Source exits up/down, target enters left/right. Bend point sits
		// at (sourceStub.x, targetStub.y).
		return [
			source,
			sourceStub,
			{ x: sourceStub.x, y: targetStub.y },
			targetStub,
			target,
		];
	}

	// Source horizontal, target vertical. Bend at (targetStub.x, sourceStub.y).
	return [
		source,
		sourceStub,
		{ x: targetStub.x, y: sourceStub.y },
		targetStub,
		target,
	];
}

function pointsToPath(points: Point[]): string {
	if (points.length === 0) return '';
	let d = `M ${points[0].x} ${points[0].y}`;
	for (let i = 1; i < points.length; i += 1) {
		d += ` L ${points[i].x} ${points[i].y}`;
	}
	return d;
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

/**
 * Decide whether the baked ELK points are still valid for the current
 * React Flow edge geometry. They're valid when the first and last
 * points still coincide (within tolerance) with the live source / target
 * coordinates that React Flow is feeding into the edge component.
 *
 * Once the user drags either endpoint node, the live coordinates move
 * but the baked points don't — that's our cue to self-route instead.
 */
function arePointsFresh(
	points: Point[],
	sourceX: number,
	sourceY: number,
	targetX: number,
	targetY: number,
): boolean {
	if (points.length < 2) return false;

	const first = points[0];
	const last = points[points.length - 1];

	const startMatches =
		Math.abs(first.x - sourceX) <= POINTS_FRESHNESS_TOLERANCE &&
		Math.abs(first.y - sourceY) <= POINTS_FRESHNESS_TOLERANCE;
	const endMatches =
		Math.abs(last.x - targetX) <= POINTS_FRESHNESS_TOLERANCE &&
		Math.abs(last.y - targetY) <= POINTS_FRESHNESS_TOLERANCE;

	return startMatches && endMatches;
}

/**
 * Adapt baked ELK points to current handle positions.
 *
 * When React Flow's source/target coordinates differ from the baked
 * first/last points (because either endpoint moved a bit, or because
 * the handle position is offset from where ELK landed the edge), we
 * still want to use the BODY of the ELK route — its lane choice,
 * its bend pattern around other nodes — and just patch the endpoints.
 *
 * The result: replace points[0] with the live source coordinate and
 * points[last] with the live target coordinate, and inject extra
 * orthogonal segments so the path still looks rectilinear.
 *
 * This is useful for back edges (which ELK routes around the side of
 * the graph — we want to keep that route, just attach it to the
 * current handle positions) and any normal edge after a small drag.
 */
function adaptPointsToLiveEndpoints(
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

	const second = points[1];
	const beforeLast = points[points.length - 2];

	// Patch the source end. If the second point sits directly above /
	// below / left / right of the (old) first point, keep that
	// orientation and just snap the first point to the live source.
	// Otherwise insert an extra orthogonal step from the live source to
	// the original second point.
	const adapted: Point[] = [{ x: sourceX, y: sourceY }];

	if (second.x === points[0].x) {
		// Original first segment was vertical — keep going vertical from
		// live source down (or up) to second's Y, then continue.
		adapted.push({ x: sourceX, y: second.y });
	} else if (second.y === points[0].y) {
		// Original first segment was horizontal.
		adapted.push({ x: second.x, y: sourceY });
	} else {
		// Diagonal — preserve original first point as a bend.
		adapted.push(points[0]);
	}

	for (let i = 1; i < points.length - 1; i += 1) {
		adapted.push(points[i]);
	}

	if (beforeLast.x === points[points.length - 1].x) {
		adapted.push({ x: targetX, y: beforeLast.y });
	} else if (beforeLast.y === points[points.length - 1].y) {
		adapted.push({ x: beforeLast.x, y: targetY });
	} else {
		adapted.push(points[points.length - 1]);
	}

	adapted.push({ x: targetX, y: targetY });

	return adapted;
}

function isBackEdgeProps(props: EdgeProps): boolean {
	// React Flow doesn't pass the edge type directly to custom edge
	// components, but it does pass the edge id and the data we set in
	// the layout. We rely on the layout having stored a marker — but
	// the simplest signal is the id pattern from `graph-writer.ts`,
	// where back edges aren't distinguished by id. Fall back to
	// inspecting the edge's data for a `semanticKind: 'loop-back'` if
	// present, or check whether the path goes "upward" (target above
	// source).
	const data = (props as unknown as { data?: { semanticKind?: string } }).data;
	if (data?.semanticKind === 'loop-back') return true;
	// Heuristic: target above source by a healthy margin = back edge.
	return props.targetY < props.sourceY - 50;
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

	let points: Point[];

	const haveBaked = hasBakedPoints(data);
	const isBackEdge = isBackEdgeProps(props);

	if (haveBaked && arePointsFresh(data.points, sourceX, sourceY, targetX, targetY)) {
		// Pristine ELK routing matches current geometry — use it as-is.
		points = data.points;
	} else if (haveBaked && isBackEdge) {
		// Back edges: ELK routes them around the side of the graph in a
		// way that self-routing can't replicate. Even when the endpoints
		// have shifted slightly (after a drag), keep the ELK body and
		// just patch the endpoints to stay attached to the live handles.
		points = adaptPointsToLiveEndpoints(data.points, sourceX, sourceY, targetX, targetY);
	} else {
		// Normal edge with no baked points or stale baked points after a
		// significant drag: self-route.
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