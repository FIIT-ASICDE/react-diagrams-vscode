import { Position } from '@xyflow/react';

export type Point = { x: number; y: number };

export function hasPointPath(data: unknown): data is { points: Point[] } {
	if (!data || typeof data !== 'object') return false;
	const points = (data as { points?: unknown }).points;

	return (
		Array.isArray(points) &&
		points.length >= 2 &&
		points.every(
			(point) =>
				point &&
				typeof (point as Point).x === 'number' &&
				typeof (point as Point).y === 'number',
		)
	);
}

export function hasBakedPoints(data: unknown): data is { points: Point[] } {
	return hasPointPath(data);
}

export function hasElkPoints(data: unknown): data is { points: Point[] } {
	return hasPointPath(data);
}

export function pointsToPath(points: Point[]): string {
	if (points.length === 0) return '';

	return points
		.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
		.join(' ');
}

/**
 * Same routing as `pointsToPath` (visits the same points in order),
 * but with each interior bend softened by a quadratic-Bezier arc.
 * Matches the visual style of the state-diagram `RoutableEdge`:
 * orthogonal lanes with deliberate-looking rounded corners.
 *
 * Each bend at point[i] becomes:
 *   - a line from point[i-1] toward point[i], stopping `r` short
 *   - a Q-curve through point[i] continuing `r` along the next segment
 *
 * `r` is capped at half the length of either adjacent segment so
 * tight corners don't generate overlapping arcs.
 *
 * Pass `cornerRadius = 0` to fall back to hard corners.
 */
export function pointsToRoundedPath(points: Point[], cornerRadius = 8): string {
	if (points.length === 0) return '';
	if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
	if (cornerRadius <= 0) return pointsToPath(points);

	let d = `M ${points[0].x} ${points[0].y}`;

	for (let i = 1; i < points.length - 1; i += 1) {
		const prev = points[i - 1];
		const curr = points[i];
		const next = points[i + 1];

		const inDx = curr.x - prev.x;
		const inDy = curr.y - prev.y;
		const inLen = Math.hypot(inDx, inDy);

		const outDx = next.x - curr.x;
		const outDy = next.y - curr.y;
		const outLen = Math.hypot(outDx, outDy);

		const r = Math.min(cornerRadius, inLen / 2, outLen / 2);

		// Below this threshold the arc is barely visible AND tends to
		// look noisy — fall back to a hard line.
		if (r < 1.5) {
			d += ` L ${curr.x} ${curr.y}`;
			continue;
		}

		const inX = curr.x - (inDx / inLen) * r;
		const inY = curr.y - (inDy / inLen) * r;
		const outX = curr.x + (outDx / outLen) * r;
		const outY = curr.y + (outDy / outLen) * r;

		d += ` L ${inX} ${inY} Q ${curr.x} ${curr.y} ${outX} ${outY}`;
	}

	const last = points[points.length - 1];
	d += ` L ${last.x} ${last.y}`;

	return d;
}

export function distance(a: Point, b: Point): number {
	return Math.hypot(b.x - a.x, b.y - a.y);
}

export function pointBackFromEnd(points: Point[], offset: number): Point {
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

export function offsetByPosition(point: Point, position: Position, offset: number): Point {
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