import ELK, { type ElkExtendedEdge, type ElkNode } from 'elkjs/lib/elk.bundled.js';
import { Position, type Edge, type Node } from '@xyflow/react';

type LayoutDirection = 'DOWN' | 'RIGHT';

type LayoutResult = {
	nodes: Node[];
	edges: Edge[];
};

type Box = { x: number; y: number; width: number; height: number };
type Point = { x: number; y: number };

const BACK_EDGE_LANE_GAP = 40;
const BACK_EDGE_LANE_SPACING = 30;

function isBackEdge(edge: Edge): boolean {
	return edge.type === 'back';
}

function estimateNodeSize(_node: Node): { width: number; height: number } {
	return { width: 200, height: 56 };
}

const elk = new ELK();

// ── Activity (read-only) layout — UNCHANGED ────────────────────────────────

export async function applyActivityElkLayout(
	nodes: Node[],
	edges: Edge[],
	direction: LayoutDirection = 'DOWN',
): Promise<LayoutResult> {
	const isHorizontal = direction === 'RIGHT';

	const normalEdges = edges.filter((e) => !isBackEdge(e));
	const backEdges = edges.filter(isBackEdge);
	const reversedBackEdges = backEdges.map((edge) => ({
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
	for (const child of layout.children ?? []) elkNodeById.set(child.id, child);

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
	for (const elkEdge of layout.edges ?? []) elkEdgeById.set(elkEdge.id, elkEdge);

	const layoutedNormalEdges: Edge[] = normalEdges.map((edge) => {
		const elkEdge = elkEdgeById.get(String(edge.id));
		const section = elkEdge?.sections?.[0];
		if (!section) return edge;
		const points = [
			{ x: section.startPoint.x, y: section.startPoint.y },
			...(section.bendPoints ?? []).map((p) => ({ x: p.x, y: p.y })),
			{ x: section.endPoint.x, y: section.endPoint.y },
		];
		return { ...edge, data: { ...(edge.data ?? {}), points } };
	});

	const layoutedBackEdges: Edge[] = reversedBackEdges.map((reversedEdge) => {
		const elkEdge = elkEdgeById.get(String(reversedEdge.id));
		const section = elkEdge?.sections?.[0];
		const originalBackEdge = backEdges.find((e) => e.id === reversedEdge.id)!;
		if (!section) return originalBackEdge;
		const points = [
			{ x: section.endPoint.x, y: section.endPoint.y },
			...(section.bendPoints ?? []).reverse().map((p) => ({ x: p.x, y: p.y })),
			{ x: section.startPoint.x, y: section.startPoint.y },
		];
		return { ...originalBackEdge, data: { ...(originalBackEdge.data ?? {}), points } };
	});

	return {
		nodes: layoutedNodes,
		edges: [...layoutedNormalEdges, ...layoutedBackEdges],
	};
}

// ── Back-edge routing helpers (used by activity layout) ────────────────────

function topAnchor(box: Box): Point {
	return { x: box.x + box.width / 2, y: box.y };
}

function bottomAnchor(box: Box): Point {
	return { x: box.x + box.width / 2, y: box.y + box.height };
}

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

	const rightLane = graphRight + BACK_EDGE_LANE_GAP;
	const leftLane = graphLeft - BACK_EDGE_LANE_GAP;

	const rightCost = rightLane - srcRight + (rightLane - tgtRight);
	const leftCost = srcLeft - leftLane + (tgtLeft - leftLane);

	return leftCost < rightCost ? 'left' : 'right';
}

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

		return { ...edge, data: { ...(edge.data ?? {}), points } };
	});
}

// ── Playground layout ──────────────────────────────────────────────────────

type Side = 'top' | 'right' | 'bottom' | 'left';

const POSITION_BY_SIDE: Record<Side, Position> = {
	top: Position.Top,
	right: Position.Right,
	bottom: Position.Bottom,
	left: Position.Left,
};

/**
 * Determine which side of `box` a point is closest to. Used to derive
 * handle ids from ELK's start/end-point coordinates.
 *
 * IMPORTANT: the available handles are asymmetric.
 *   - source handles exist on:  bottom, left, right    (NOT top)
 *   - target handles exist on:  top, left, right       (NOT bottom)
 *
 * If a node configures `sides: false` it has only flow handles
 * (`source-bottom` / `target-top`), but our layout assigns side handles
 * only for nodes whose handle config includes them; for action /
 * expandable nodes that's currently `sides: true` per `handles.tsx`,
 * so we can rely on side handles being present everywhere.
 *
 * Picking a handle that doesn't exist on the node makes React Flow
 * silently drop the edge — which is exactly the back-edge disappearance
 * the user reported. The two helpers below return only handle ids that
 * the node component is guaranteed to have rendered.
 */
function classifySourceSide(point: Point, box: Box): Side {
	// Available source sides: bottom, left, right. NOT top.
	const distRight = Math.abs(point.x - (box.x + box.width));
	const distBottom = Math.abs(point.y - (box.y + box.height));
	const distLeft = Math.abs(point.x - box.x);

	const minDist = Math.min(distLeft, distRight, distBottom);

	if (minDist === distBottom) return 'bottom';
	if (minDist === distLeft) return 'left';
	return 'right';
}

function classifyTargetSide(point: Point, box: Box): Side {
	// Available target sides: top, left, right. NOT bottom.
	const distRight = Math.abs(point.x - (box.x + box.width));
	const distTop = Math.abs(point.y - box.y);
	const distLeft = Math.abs(point.x - box.x);

	const minDist = Math.min(distLeft, distRight, distTop);

	if (minDist === distTop) return 'top';
	if (minDist === distLeft) return 'left';
	return 'right';
}

/**
 * Playground layout.
 *
 * Strategy: same ELK pass as View, with the same orthogonal edge
 * routing — this produces the clean, non-overlapping look the user
 * already likes in View. The difference is that Playground nodes are
 * draggable, which means the baked ELK bend-points become stale once
 * the user drags a node.
 *
 * To keep things visually aligned both before and after drag:
 *
 *   1. Compute ELK layout exactly like View — node positions plus edge
 *      sections with start/end points and bend points.
 *
 *   2. Bake bend-points into `data.points`. The Playground edge
 *      component (`PlaygroundEdge.tsx`) uses these as its primary path
 *      data — same as View — so the initial render looks identical.
 *
 *   3. ALSO assign per-edge `sourceHandle` / `targetHandle` matching the
 *      side of each node where ELK's edge enters / exits. This means
 *      that when the user drags a node, React Flow's source/target X/Y
 *      automatically follow the correct handle — and the edge component
 *      can fall back to dynamic routing from the right anchor without
 *      jumping to the bottom-of-node default.
 *
 * The Playground edge component is responsible for the "if points are
 * stale, self-route" logic. This file just gives it the best possible
 * starting state.
 */
export async function applyPlaygroundElkLayout(
	nodes: Node[],
	edges: Edge[],
	direction: LayoutDirection = 'DOWN',
): Promise<LayoutResult> {
	const isHorizontal = direction === 'RIGHT';

	const normalEdges = edges.filter((e) => !isBackEdge(e));
	const backEdges = edges.filter(isBackEdge);
	const reversedBackEdges = backEdges.map((edge) => ({
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
	for (const child of layout.children ?? []) elkNodeById.set(child.id, child);

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
			width,
			height,
			draggable: true,
			sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
			targetPosition: isHorizontal ? Position.Left : Position.Top,
		};
	});

	const elkEdgeById = new Map<string, ElkExtendedEdge>();
	for (const elkEdge of layout.edges ?? []) elkEdgeById.set(elkEdge.id, elkEdge);

	const layoutedNormalEdges: Edge[] = normalEdges.map((edge) => {
		const elkEdge = elkEdgeById.get(String(edge.id));
		const section = elkEdge?.sections?.[0];
		const srcBox = nodeBoxById.get(String(edge.source));
		const tgtBox = nodeBoxById.get(String(edge.target));

		// Strip stale baked points first.
		const { points: _stripped, ...restData } = (edge.data ?? {}) as {
			points?: unknown;
			[key: string]: unknown;
		};

		if (!section || !srcBox || !tgtBox) {
			return { ...edge, data: restData };
		}

		const points: Point[] = [
			{ x: section.startPoint.x, y: section.startPoint.y },
			...(section.bendPoints ?? []).map((p) => ({ x: p.x, y: p.y })),
			{ x: section.endPoint.x, y: section.endPoint.y },
		];

		const sourceSide = classifySourceSide(section.startPoint, srcBox);
		const targetSide = classifyTargetSide(section.endPoint, tgtBox);

		return {
			...edge,
			sourceHandle: `source-${sourceSide}`,
			targetHandle: `target-${targetSide}`,
			sourcePosition: POSITION_BY_SIDE[sourceSide],
			targetPosition: POSITION_BY_SIDE[targetSide],
			data: { ...restData, points },
		};
	});

	const layoutedBackEdges: Edge[] = reversedBackEdges.map((reversedEdge) => {
		const elkEdge = elkEdgeById.get(String(reversedEdge.id));
		const section = elkEdge?.sections?.[0];
		const originalBackEdge = backEdges.find((e) => e.id === reversedEdge.id)!;

		const { points: _stripped, ...restData } = (originalBackEdge.data ?? {}) as {
			points?: unknown;
			[key: string]: unknown;
		};

		if (!section) {
			return { ...originalBackEdge, data: restData };
		}

		// We laid this out with swapped source/target, so ELK's start /
		// end / bend-points need to be reversed to match the edge's
		// real direction (original source → original target).
		const points: Point[] = [
			{ x: section.endPoint.x, y: section.endPoint.y },
			...(section.bendPoints ?? []).reverse().map((p) => ({ x: p.x, y: p.y })),
			{ x: section.startPoint.x, y: section.startPoint.y },
		];

		// Back edges always exit the source from the bottom (it's a
		// "later" node looping back) and enter the target at its top
		// (the loop header). We don't try to derive these sides from
		// ELK's geometry because:
		//
		//   - we ran ELK with reversed source/target, so its endpoint
		//     classification doesn't match the real edge direction;
		//
		//   - even unreversed, ELK would land back-edges on whichever
		//     face it found convenient for the LAYOUT pass, not where
		//     we want React Flow to render them;
		//
		//   - the available source handles don't include `source-top`,
		//     so an ELK-derived `source-top` would silently drop the
		//     edge — exactly the disappearing-back-edge bug we hit.
		//
		// Bottom → top is the convention for back edges in this codebase
		// and matches what View renders (the dashed red line going
		// around the side of the graph).
		return {
			...originalBackEdge,
			sourceHandle: 'source-bottom',
			targetHandle: 'target-top',
			sourcePosition: Position.Bottom,
			targetPosition: Position.Top,
			data: { ...restData, points },
		};
	});

	return {
		nodes: layoutedNodes,
		edges: [...layoutedNormalEdges, ...layoutedBackEdges],
	};
}