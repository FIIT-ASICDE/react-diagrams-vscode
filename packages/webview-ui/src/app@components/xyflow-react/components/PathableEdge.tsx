import { BaseEdge, EdgeLabelRenderer, getStraightPath, useInternalNode, type EdgeProps, type Node, type XYPosition } from '@xyflow/react';
import { getEdgeParams } from '../initialElements';
import { useState } from 'react';

function getPathableEdge(pathPoints: XYPosition[]): [string, number, number] {
	let stringPath = `M ${pathPoints[0].x} ${pathPoints[0].y}`;
	for (let i = 1; i < pathPoints.length; i++)
		stringPath += ` L ${pathPoints[i].x} ${pathPoints[i].y}`;

	const labelX = pathPoints.length == 2 ? (pathPoints[0].x + pathPoints[1].x)/2 : pathPoints[Math.floor(pathPoints.length/2)].x;
	const labelY = pathPoints.length == 2 ? (pathPoints[0].y + pathPoints[1].y)/2 : pathPoints[Math.floor(pathPoints.length/2)].y;
	return [stringPath, labelX, labelY];
}

function getFloatingEdgePath({sourceNode, targetNode, sourceX, sourceY, targetX, targetY}: { sourceNode, targetNode, sourceX: number, sourceY: number, targetX: number, targetY: number }) {
	if (!sourceNode || !targetNode)
		return getStraightPath({ sourceX, sourceY, targetX, targetY });
	
	var { sx: sourceX, sy: sourceY, tx: targetX, ty: targetY } = getEdgeParams(sourceNode, targetNode);
	return getStraightPath({ sourceX, sourceY, targetX, targetY });
}

export default function PathableEdge({ id, source, target, style, label, data, ...props }: EdgeProps) {
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

	const [edgePath, labelX, labelY] = data?.pathPoints ? getPathableEdge(data.pathPoints as XYPosition[]) : getFloatingEdgePath({sourceNode, targetNode, ...props});
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