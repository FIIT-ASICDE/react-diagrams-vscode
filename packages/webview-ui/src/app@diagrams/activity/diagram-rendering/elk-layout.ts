import ELK, { type ElkExtendedEdge, type ElkNode } from 'elkjs/lib/elk.bundled.js';
import { Position, type Edge, type Node } from '@xyflow/react';

type LayoutDirection = 'DOWN' | 'RIGHT';

type LayoutResult = {
  nodes: Node[];
  edges: Edge[];
};

type Box = { x: number; y: number; width: number; height: number };
type Point = { x: number; y: number };

const BACK_EDGE_LANE_GAP = 40; // distance from graph edge to first lane
const BACK_EDGE_LANE_SPACING = 30; // distance between successive lanes on the same side

function isBackEdge(edge: Edge): boolean {
  return edge.type === 'back';
}

function estimateNodeSize(_node: Node): { width: number; height: number } {
  return { width: 200, height: 56 };
}

const elk = new ELK();

export async function applyActivityElkLayout(
  nodes: Node[],
  edges: Edge[],
  direction: LayoutDirection = 'DOWN',
): Promise<LayoutResult> {
  const isHorizontal = direction === 'RIGHT';

  // ELK runs the layered algorithm on a DAG. Back-edges are routed
  // separately so the layered pass stays acyclic.
  const downwardEdges = edges.filter((edge) => !isBackEdge(edge));
  const backEdges = edges.filter((edge) => isBackEdge(edge));

  const elkGraph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': isHorizontal ? 'RIGHT' : 'DOWN',
      'elk.layered.spacing.nodeNodeBetweenLayers': '90',
      'elk.spacing.nodeNode': '50',
      'elk.spacing.edgeNode': '40',
      'elk.spacing.edgeEdge': '10',
      'elk.padding': '[top=20,left=20,bottom=20,right=20]',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.layered.thoroughness': '10',
    },
    children: nodes.map((node) => {
      const { width, height } = estimateNodeSize(node);
      return { id: String(node.id), width, height };
    }),
    edges: downwardEdges.map((edge) => ({
      id: String(edge.id),
      sources: [String(edge.source)],
      targets: [String(edge.target)],
    })) satisfies ElkExtendedEdge[],
  };

  const layout = await elk.layout(elkGraph);

  const elkNodeById = new Map<string, ElkNode>();
  for (const child of layout.children ?? []) {
    elkNodeById.set(child.id, child);
  }

  const nodeBoxById = new Map<string, Box>();

  const layoutedNodes: Node[] = nodes.map((node) => {
    const { width, height } = estimateNodeSize(node);
    const elkNode = elkNodeById.get(String(node.id));
    const x = elkNode?.x ?? 0;
    const y = elkNode?.y ?? 0;

    nodeBoxById.set(String(node.id), { x, y, width, height });

    return {
      ...node,
      position: { x, y },
      sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
      targetPosition: isHorizontal ? Position.Left : Position.Top,
      width,
      height,
      draggable: true,
    };
  });

  const elkEdgeById = new Map<string, ElkExtendedEdge>();
  for (const elkEdge of layout.edges ?? []) {
    elkEdgeById.set(elkEdge.id, elkEdge);
  }

  const layoutedDownwardEdges: Edge[] = downwardEdges.map((edge) => {
    const elkEdge = elkEdgeById.get(String(edge.id));
    const section = elkEdge?.sections?.[0];
    if (!section) return edge;

    const points = [
      { x: section.startPoint.x, y: section.startPoint.y },
      ...(section.bendPoints ?? []).map((point) => ({ x: point.x, y: point.y })),
      { x: section.endPoint.x, y: section.endPoint.y },
    ];

    return {
      ...edge,
      data: {
        ...(edge.data ?? {}),
        points,
      },
    };
  });

  const layoutedBackEdges = routeBackEdges(backEdges, nodeBoxById, layoutedNodes);

  return {
    nodes: layoutedNodes,
    edges: [...layoutedDownwardEdges, ...layoutedBackEdges],
  };
}

// ── Back-edge routing ──────────────────────────────────────────────────────

/**
 * Decide for each back-edge whether to route through a lane on the LEFT or
 * the RIGHT side of the graph, based on which side is cheaper (Manhattan
 * distance). Each side stacks its own back-edges into separate lanes so
 * they don't overlap.
 *
 * Why: the previous behaviour always routed through the right side, which
 * made back-edges originating from left-leaning nodes traverse the entire
 * graph horizontally — visually noisy, and they crossed unrelated edges.
 *
 * Trade-off: this is a "pick the closer side" heuristic, not a real
 * obstacle-avoiding router. It doesn't try to dodge nodes inside the
 * graph itself — both lanes are OUTSIDE the graph's left and right edges
 * — so collision with arbitrary node placements isn't a concern.
 */
function routeBackEdges(
  backEdges: Edge[],
  nodeBoxById: Map<string, Box>,
  layoutedNodes: Node[],
): Edge[] {
  if (backEdges.length === 0) return [];

  // Bounding box of the laid-out graph. If it's empty (no positioned
  // nodes), we have nothing sensible to route against.
  const allBoxes = layoutedNodes
    .map((node) => nodeBoxById.get(String(node.id)))
    .filter((box): box is Box => Boolean(box));

  if (allBoxes.length === 0) return backEdges;

  const graphLeft = Math.min(...allBoxes.map((box) => box.x));
  const graphRight = Math.max(...allBoxes.map((box) => box.x + box.width));

  // Right lanes grow rightward from the graph's right edge.
  // Left lanes grow leftward from the graph's left edge.
  const firstRightLaneX = graphRight + BACK_EDGE_LANE_GAP;
  const firstLeftLaneX = graphLeft - BACK_EDGE_LANE_GAP;

  let rightLaneCount = 0;
  let leftLaneCount = 0;

  return backEdges.map((edge) => {
    const srcBox = nodeBoxById.get(String(edge.source));
    const tgtBox = nodeBoxById.get(String(edge.target));
    if (!srcBox || !tgtBox) return edge;

    const side = chooseBackEdgeSide(srcBox, tgtBox, graphLeft, graphRight);

    let laneX: number;
    let srcAnchor: Point;
    let tgtAnchor: Point;

    if (side === 'right') {
      laneX = firstRightLaneX + rightLaneCount * BACK_EDGE_LANE_SPACING;
      rightLaneCount += 1;
      srcAnchor = rightAnchor(srcBox);
      tgtAnchor = rightAnchor(tgtBox);
    } else {
      laneX = firstLeftLaneX - leftLaneCount * BACK_EDGE_LANE_SPACING;
      leftLaneCount += 1;
      srcAnchor = leftAnchor(srcBox);
      tgtAnchor = leftAnchor(tgtBox);
    }

    const points: Point[] = [
      srcAnchor,
      { x: laneX, y: srcAnchor.y },
      { x: laneX, y: tgtAnchor.y },
      tgtAnchor,
    ];

    return {
      ...edge,
      data: {
        ...(edge.data ?? {}),
        points,
      },
    };
  });
}

/**
 * Pick the cheaper side (left vs right) for routing a back-edge between
 * `srcBox` and `tgtBox`. Cost is the total horizontal distance the edge
 * has to travel to get out to the lane and then back in.
 *
 * Tie-breaks toward 'right' for backward compatibility with the previous
 * always-right behaviour.
 */
function chooseBackEdgeSide(
  srcBox: Box,
  tgtBox: Box,
  graphLeft: number,
  graphRight: number,
): 'left' | 'right' {
  const srcLeft = srcBox.x;
  const srcRight = srcBox.x + srcBox.width;
  const tgtLeft = tgtBox.x;
  const tgtRight = tgtBox.x + tgtBox.width;

  // Horizontal distance from each box's nearest face to the lane on each
  // side. We don't include the vertical leg in the comparison — that's
  // identical for both sides — only the two horizontal legs differ.
  const rightLane = graphRight + BACK_EDGE_LANE_GAP;
  const leftLane = graphLeft - BACK_EDGE_LANE_GAP;

  const rightCost = (rightLane - srcRight) + (rightLane - tgtRight);
  const leftCost = (srcLeft - leftLane) + (tgtLeft - leftLane);

  return leftCost < rightCost ? 'left' : 'right';
}

function rightAnchor(box: Box): Point {
  return { x: box.x + box.width, y: box.y + box.height / 2 };
}

function leftAnchor(box: Box): Point {
  return { x: box.x, y: box.y + box.height / 2 };
}