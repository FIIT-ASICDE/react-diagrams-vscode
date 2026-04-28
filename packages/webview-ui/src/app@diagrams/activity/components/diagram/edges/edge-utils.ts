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
