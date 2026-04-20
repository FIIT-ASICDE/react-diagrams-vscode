import { BaseEdge, EdgeLabelRenderer, getBezierPath, getSmoothStepPath, getStraightPath, useInternalNode, useNodes, type EdgeProps, type Node } from '@xyflow/react';
// import {
// 	getSmartEdge,
// 	// pathfindingAStarDiagonal,
// 	// pathfindingAStarNoDiagonal,
// 	// pathfindingJumpPointNoDiagonal
// } from '@jalez/react-flow-smart-edge'
import { getEdgeParams } from '../initialElements';
import { useState } from 'react';

function buildBackEdge({ sourceX, sourceY, targetX, targetY, detourDistance = 150, detourDir = -1, labelPos = 0.9 }: { sourceX: number, sourceY: number, targetX: number, targetY: number, detourDistance?: number, detourDir?: number, labelPos?: number }): [string, number, number] {
    const detourX = sourceX + detourDistance * detourDir;

    return [`
      M ${sourceX} ${sourceY}
      L ${detourX} ${sourceY}
      L ${detourX} ${targetY}
      L ${targetX} ${targetY}
    `, detourX, sourceY*(1-labelPos) + targetY*labelPos];
}

function FloatingEdge({ id, source, target, sourceX, sourceY, targetX, targetY, sourceHandleId, targetHandleId, markerEnd, style, label, data }: EdgeProps) {
  const [hover, setHover] = useState(false);

  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  // const nodes = useNodes();

  if (!sourceNode || !targetNode) {
    return null;
  }

  if (!sourceHandleId && !targetHandleId)
    var { sx: sourceX, sy: sourceY, tx: targetX, ty: targetY } = getEdgeParams(sourceNode, targetNode);
  
  const distance = Math.sqrt(Math.pow(targetX - sourceX, 2) + Math.pow(targetY - sourceY, 2));
  // const smallerMove = Math.min(Math.abs(targetX - sourceX), Math.abs(targetY - sourceY));
  // console.log('Edge distance:', sourceNode, targetNode, distance);

  const isLongEdge = distance > 250;
  if (data?.backEdge) {
    var [edgePath, labelX, labelY] = buildBackEdge({ sourceX, sourceY, targetX, targetY, detourDir: +data?.backEdge * (isLongEdge ? 1 : 0.25), labelPos: isLongEdge ? 0.9 : 0.5 });
  }
  else if (isLongEdge) {
    var [edgePath, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, stepPosition: 1 })
  }
  else {
    var [edgePath, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY })
  }

  // console.log(data)
  // var { svgPathString: edgePath, edgeCenterX: labelX, edgeCenterY: labelY } = getSmartEdge({
  //   sourceX,
  //   sourceY,
  //   sourcePosition,
  //   targetPosition,
  //   targetX,
  //   targetY,
  //   nodes: data?.nodes as Node[] ,
  //   options: {
  //     nodePadding: 0,
  //   }
  // }) ?? {};

  // if (!edgePath) {
  //   return null;
  // }


  const handleMouseEnter = () => {
    // console.log('edge hover');
    setHover(true);
  }

  const handleMouseLeave = () => {
    setHover(false);
  }

  const lblNear = isLongEdge && !data?.backEdge
  return (
    <>
      <g onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
        <BaseEdge
          id={id}
          path={edgePath}
          markerEnd={markerEnd}
          style={style}
        />
      </g>
      {label && (
        <EdgeLabelRenderer>
          {lblNear && <div className="pointer-events-none absolute rounded border border-(--vscode-widget-border) p-1 leading-none text-[11px] text-(--vscode-foreground) shadow-sm"
            style={{
              transform: `translate(-50%, 0%) translate(${sourceX}px, ${sourceY}px)`,
              background: hover ? `var(--vscode-editor-background)` : `color-mix(in srgb, var(--vscode-editor-background) 80%, transparent)`,
              zIndex: hover ? 30 : 10,
              filter: hover ? 'drop-shadow(0 2px 8px rgba(65,65,75,0.5))' : 'none',
            }}
          >
            {label}
          </div>}
          {!lblNear && <div 
            className="pointer-events-none absolute rounded border border-(--vscode-widget-border) p-1 leading-none text-[11px] text-(--vscode-foreground) shadow-sm"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              background: hover ? `var(--vscode-editor-background)` : `color-mix(in srgb, var(--vscode-editor-background) 80%, transparent)`,
              zIndex: hover ? 30 : 10,
              filter: hover ? 'drop-shadow(0 2px 8px rgba(65,65,75,0.5))' : 'none',
            }}
          >
            {label}
          </div>}
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export default FloatingEdge;
