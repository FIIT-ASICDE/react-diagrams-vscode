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

function snapPolylineToNodeBoundaries(
	points: Point[],
	edge: Edge,
	nodeBoxById: Map<string, Box>,
	nodes: Node[],
): Point[] {
	if (points.length < 2) return points;

	const sourceBox = nodeBoxById.get(String(edge.source));
	const targetBox = nodeBoxById.get(String(edge.target));
	if (!sourceBox || !targetBox) return points;

	const sourceNode = nodes.find((node) => String(node.id) === String(edge.source));
	const targetNode = nodes.find((node) => String(node.id) === String(edge.target));

	const nextAfterSource = points[1];
	const beforeTarget = points[points.length - 2];

	const snapped = [...points];

	snapped[0] = intersectNodeBoundary(sourceBox, nextAfterSource, sourceNode);
	snapped[snapped.length - 1] = intersectNodeBoundary(targetBox, beforeTarget, targetNode);

	return snapped;
}

function intersectNodeBoundary(box: Box, toward: Point, node?: Node): Point {
	const center = {
		x: box.x + box.width / 2,
		y: box.y + box.height / 2,
	};

	const dx = toward.x - center.x;
	const dy = toward.y - center.y;

	if (dx === 0 && dy === 0) {
		return center;
	}

	if (node?.type === 'decision') {
		return intersectDiamond(center, box.width, box.height, dx, dy);
	}

	return intersectRect(center, box.width, box.height, dx, dy);
}

function intersectRect(center: Point, width: number, height: number, dx: number, dy: number): Point {
	const halfW = width / 2;
	const halfH = height / 2;

	const tx = dx === 0 ? Infinity : halfW / Math.abs(dx);
	const ty = dy === 0 ? Infinity : halfH / Math.abs(dy);
	const t = Math.min(tx, ty);

	return {
		x: center.x + dx * t,
		y: center.y + dy * t,
	};
}

function intersectDiamond(center: Point, width: number, height: number, dx: number, dy: number): Point {
	const halfW = width / 2;
	const halfH = height / 2;

	const t = 1 / (Math.abs(dx) / halfW + Math.abs(dy) / halfH);

	return {
		x: center.x + dx * t,
		y: center.y + dy * t,
	};
}

export async function applyActivityElkLayout(
  nodes: Node[],
  edges: Edge[],
  direction: LayoutDirection = 'DOWN',
): Promise<LayoutResult> {
  const isHorizontal = direction === 'RIGHT';

  // Temporarily reverse back edges so ELK layouts them as normal forward edges
  // This keeps everything in strict TOP_DOWN flow through the graph layers
  const normalEdges = edges.filter(e => !isBackEdge(e));
  const backEdges = edges.filter(isBackEdge);
  const reversedBackEdges = backEdges.map(edge => ({
    ...edge,
    source: edge.target,
    target: edge.source,
  }));

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
    edges: [...normalEdges, ...reversedBackEdges].map((edge) => ({
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

  const layoutedNormalEdges: Edge[] = normalEdges.map((edge) => {
    const elkEdge = elkEdgeById.get(String(edge.id));
    const section = elkEdge?.sections?.[0];
    if (!section) return edge;

    const points = [
      { x: section.startPoint.x, y: section.startPoint.y },
      ...(section.bendPoints ?? []).map((point) => ({ x: point.x, y: point.y })),
      { x: section.endPoint.x, y: section.endPoint.y },
    ];
    const adjustedPoints = snapPolylineToNodeBoundaries(points, edge, nodeBoxById, nodes);
    return {
      ...edge,
      data: {
        ...(edge.data ?? {}),
        points,
      },
    };
  });

  const layoutedBackEdges: Edge[] = reversedBackEdges.map((reversedEdge) => {
    const elkEdge = elkEdgeById.get(String(reversedEdge.id));
    const section = elkEdge?.sections?.[0];
    
    // Get the original back edge to restore source/target
    const originalBackEdge = backEdges.find(e => e.id === reversedEdge.id)!;
    
    if (!section) return originalBackEdge;

    // Reverse the points since we laid out the reversed edge
    const points = [
      { x: section.endPoint.x, y: section.endPoint.y },
      ...(section.bendPoints ?? []).reverse().map((point) => ({ x: point.x, y: point.y })),
      { x: section.startPoint.x, y: section.startPoint.y },
    ];

    return {
      ...originalBackEdge,
      data: {
        ...(originalBackEdge.data ?? {}),
        points,
      },
    };
  });

  return {
    nodes: layoutedNodes,
    edges: [...layoutedNormalEdges, ...layoutedBackEdges],
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

	const allBoxes = layoutedNodes
		.map((node) => nodeBoxById.get(String(node.id)))
		.filter((box): box is Box => Boolean(box));

	if (allBoxes.length === 0) return backEdges;

	const graphLeft = Math.min(...allBoxes.map((box) => box.x));
	const graphRight = Math.max(...allBoxes.map((box) => box.x + box.width));

	const firstRightLaneX = graphRight + BACK_EDGE_LANE_GAP;
	const firstLeftLaneX = graphLeft - BACK_EDGE_LANE_GAP;

	let rightLaneCount = 0;
	let leftLaneCount = 0;

	return backEdges.map((edge) => {
		const srcBox = nodeBoxById.get(String(edge.source));
		const tgtBox = nodeBoxById.get(String(edge.target));

		if (!srcBox || !tgtBox) return edge;

		const side = chooseBackEdgeSide(srcBox, tgtBox, graphLeft, graphRight);

		const sourceExit = bottomAnchor(srcBox);
		const targetEnter = topAnchor(tgtBox);

		let laneX: number;

		if (side === 'right') {
			laneX = firstRightLaneX + rightLaneCount * BACK_EDGE_LANE_SPACING;
			rightLaneCount += 1;
		} else {
			laneX = firstLeftLaneX - leftLaneCount * BACK_EDGE_LANE_SPACING;
			leftLaneCount += 1;
		}

		const sourceStubY = sourceExit.y + 24;
		const targetStubY = targetEnter.y - 24;

		const points: Point[] = [
			sourceExit,
			{ x: sourceExit.x, y: sourceStubY },
			{ x: laneX, y: sourceStubY },
			{ x: laneX, y: targetStubY },
			{ x: targetEnter.x, y: targetStubY },
			targetEnter,
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

function topAnchor(box: Box): Point {
	return {
		x: box.x + box.width / 2,
		y: box.y,
	};
}

function bottomAnchor(box: Box): Point {
	return {
		x: box.x + box.width / 2,
		y: box.y + box.height,
	};
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