import type { EdgeProps } from '@xyflow/react';
import { BaseEdge, EdgeLabelRenderer } from '@xyflow/react';

type Point = { x: number; y: number };

function hasElkPoints(data: unknown): data is { points: Point[] } {
  if (!data || typeof data !== 'object') return false;
  const pts = (data as { points?: unknown }).points;
  return Array.isArray(pts) && pts.length >= 2
    && pts.every((p) => p && typeof (p as Point).x === 'number' && typeof (p as Point).y === 'number');
}

function pointsToPath(points: Point[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
}

export default function ElkPathEdge(props: EdgeProps) {
  const { style, label, data, markerEnd, sourceX, sourceY, targetX, targetY } = props;

  let path: string;
  let midX: number;
  let midY: number;

  if (hasElkPoints(data)) {
    path = pointsToPath(data.points);
    const mid = data.points[Math.floor(data.points.length / 2)];
    midX = mid.x;
    midY = mid.y;
  } else {
    // Fallback for edges before layout has run (e.g. user just dragged a new connection).
    path = `M ${sourceX} ${sourceY} L ${sourceX} ${targetY} L ${targetX} ${targetY}`;
    midX = (sourceX + targetX) / 2;
    midY = (sourceY + targetY) / 2;
  }

  return (
    <>
      <BaseEdge path={path} markerEnd={markerEnd} style={{ fill: 'none', ...style }} />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${midX}px, ${midY}px)`,
              background: 'white',
              padding: '1px 4px',
              fontSize: 10,
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
          >
            {typeof label === 'string' ? label : null}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}