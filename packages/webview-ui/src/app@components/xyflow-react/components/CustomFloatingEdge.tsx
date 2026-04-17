import { BaseEdge, EdgeLabelRenderer, getBezierPath, getSmoothStepPath, getStraightPath, useInternalNode, useNodes, type EdgeProps, type Node } from '@xyflow/react';
// import {
// 	getSmartEdge,
// 	// pathfindingAStarDiagonal,
// 	// pathfindingAStarNoDiagonal,
// 	// pathfindingJumpPointNoDiagonal
// } from '@jalez/react-flow-smart-edge'
import { getEdgeParams } from '../initialElements';
import { useState } from 'react';

function FloatingEdge({ id, source, target, markerEnd, style, label, data }: EdgeProps) {
  const [hover, setHover] = useState(false);

  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  // const nodes = useNodes();

  if (!sourceNode || !targetNode) {
    return null;
  }

  const { sx: sourceX, sy: sourceY, tx: targetX, ty: targetY, sourcePos: sourcePosition, targetPos: targetPosition } = getEdgeParams(sourceNode, targetNode);
  // console.log(data)

  const distance = Math.sqrt(Math.pow(targetX - sourceX, 2) + Math.pow(targetY - sourceY, 2));
  // const smallerMove = Math.min(Math.abs(targetX - sourceX), Math.abs(targetY - sourceY));
  // console.log('Edge distance:', sourceNode, targetNode, distance);

  const isLongEdge = distance > 250;
  if (isLongEdge) {
    var [edgePath, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetPosition, targetX, targetY, stepPosition: 1 })
  }
  else {
    var [edgePath, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY })
  }

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
          {isLongEdge && <div className="pointer-events-none absolute rounded border border-(--vscode-widget-border) p-1 leading-none text-[11px] text-(--vscode-foreground) shadow-sm"
            style={{
              transform: `translate(-50%, 0%) translate(${sourceX}px, ${sourceY}px)`,
              background: hover ? `var(--vscode-editor-background)` : `color-mix(in srgb, var(--vscode-editor-background) 80%, transparent)`,
              zIndex: hover ? 30 : 10,
              filter: hover ? 'drop-shadow(0 2px 8px rgba(0,0,0,0.3))' : 'none',
            }}
          >
            {label}
          </div>}
          {!isLongEdge && <div 
            className="pointer-events-none absolute rounded border border-(--vscode-widget-border) p-1 leading-none text-[11px] text-(--vscode-foreground) shadow-sm"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              background: hover ? `var(--vscode-editor-background)` : `color-mix(in srgb, var(--vscode-editor-background) 80%, transparent)`,
              zIndex: hover ? 30 : 10,
              filter: hover ? 'drop-shadow(0 2px 8px rgba(0,0,0,0.3))' : 'none',
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
