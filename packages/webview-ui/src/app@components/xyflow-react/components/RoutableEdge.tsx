import { BaseEdge, EdgeLabelRenderer, getStraightPath, useInternalNode, type EdgeProps, type Node, type XYPosition } from '@xyflow/react';
import { getEdgeParams } from '../initialElements';
import { useState } from 'react';

export function getRoutablePath(pathPoints: XYPosition[], borderRadius: string | number = 5, sourceNode?: Node, targetNode?: Node): [string, number, number] | null {
	if (pathPoints.length > 2) { // autocconect first / last as floating
		if (!pathPoints[0] && sourceNode) {
			const { sx: x, sy: y } = getEdgeParams(sourceNode, pathPoints[1]);
			pathPoints[0] = { x, y };
		}

		if (!pathPoints[pathPoints.length - 1] && targetNode) {
			const { tx: x, ty: y } = getEdgeParams(pathPoints[pathPoints.length - 2], targetNode);
			pathPoints[pathPoints.length - 1] = { x, y };
		}
	}

	if (!pathPoints.some(Boolean))
		return null;

	let stringPath = `M ${pathPoints[0].x} ${pathPoints[0].y}`;
	let labelX = 0;
	let labelY = 0;
	let maxSegmentLen = -1;

	if (!borderRadius) {
		for (let i = 1; i < pathPoints.length; i++) {
			const { x, y } = pathPoints[i];
			stringPath += ` L ${x} ${y}`;

			const dPrev = Math.hypot(x - x, y - y);
			if (dPrev > maxSegmentLen) {
				maxSegmentLen = dPrev;
				[labelX, labelY] = [(x + x)/2, (y + y)/2];
			}
		}
	}
	else {
		for (let i = 1; i < pathPoints.length; i++) {
			const { x, y } = pathPoints[i];
			const prev = pathPoints[i - 1];
			const next = pathPoints[i + 1];
			if (!next) {
				stringPath += ` L ${x} ${y}`;
				continue;
			}

			const dPrev = Math.hypot(x - prev.x, y - prev.y); // all of this for rounded corners... 
			const dNext = Math.hypot(next.x - x, next.y - y);
			
			const r = Math.min(+borderRadius, dPrev / 2, dNext / 2);
			const startX = x - (r / dPrev) * (x - prev.x);
			const startY = y - (r / dPrev) * (y - prev.y);
			const endX = x + (r / dNext) * (next.x - x);
			const endY = y + (r / dNext) * (next.y - y);

			stringPath += ` L ${startX} ${startY} Q ${x} ${y}, ${endX} ${endY}`;
		
			if (dPrev > maxSegmentLen) {
				maxSegmentLen = dPrev;
				[labelX, labelY] = [(prev.x + x)/2, (prev.y + y)/2];
			}
		}
	}

	const mid = Math.floor(pathPoints.length/2);
	labelX ||= pathPoints.length == 2 ? (pathPoints[0].x + pathPoints[1].x)/2 : pathPoints[mid].x;
	labelY ||= pathPoints.length == 2 ? (pathPoints[0].y + pathPoints[1].y)/2 : pathPoints[mid].y;

	return [stringPath, labelX, labelY];
}

export function getFloatingEdgePath({sourceNode, targetNode, sourceX, sourceY, targetX, targetY}: { sourceNode, targetNode, sourceX: number, sourceY: number, targetX: number, targetY: number }) {
	if (!sourceNode || !targetNode)
		return getStraightPath({ sourceX, sourceY, targetX, targetY });
	
	var { sx: sourceX, sy: sourceY, tx: targetX, ty: targetY } = getEdgeParams(sourceNode, targetNode);
	return getStraightPath({ sourceX, sourceY, targetX, targetY });
}

export type RoutableEdgeProps = EdgeProps & { data: { pathPoints?: XYPosition[], labelPos?: XYPosition, minPoints?: number } };

export default function RoutableEdge({ id, source, target, style, label, data: { pathPoints, labelPos, minPoints = 1 } = {}, ...props }: RoutableEdgeProps) {
	const [hover, setHover] = useState(false);
	const sourceNode = useInternalNode(source);
	const targetNode = useInternalNode(target);

	const handleMouseEnter = () => {
		// console.log('edge hover');
		setHover(true);
	}
	
	const handleMouseLeave = () => {
		setHover(false);
	}

	let [edgePath, lblX, lblY] = pathPoints instanceof Array && pathPoints.length > minPoints ? 
		(getRoutablePath(pathPoints, style?.borderRadius, sourceNode, targetNode) ?? getFloatingEdgePath({sourceNode, targetNode, ...props})) : 
		getFloatingEdgePath({sourceNode, targetNode, ...props});
	
	const labelX = labelPos?.x || lblX;
	const labelY = labelPos?.y || lblY;
	return (
		<>
			<g onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
				<BaseEdge
					id={id}
					path={edgePath}
					style={{...style, strokeWidth: hover ? (style?.strokeWidth ? +style.strokeWidth * 1.5 : 2) : style?.strokeWidth }}
					{...props}
				/>
			</g>
			{label && (
				<EdgeLabelRenderer>
					<div className="text-nowrap pointer-events-none absolute rounded border border-(--vscode-widget-border) p-1 leading-none text-[11px] text-(--vscode-foreground) shadow-sm"
						style={{
							transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
							background: hover ? `var(--vscode-editor-background)` : `color-mix(in srgb, var(--vscode-editor-background) 80%, transparent)`,
							zIndex: hover ? 30 : 10,
							filter: hover ? 'drop-shadow(0 2px 8px rgba(65,65,75,0.5))' : 'none',
						}}
					>
						{label}
					</div>
				</EdgeLabelRenderer>
			)}
		</>
	);
}