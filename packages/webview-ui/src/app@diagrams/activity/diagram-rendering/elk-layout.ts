import ELK, { type ElkExtendedEdge, type ElkNode } from 'elkjs/lib/elk.bundled.js';
import { Position, type Edge, type Node } from '@xyflow/react';

type LayoutDirection = 'DOWN' | 'RIGHT';

type LayoutResult = {
	nodes: Node[];
	edges: Edge[];
};

type Box = { x: number; y: number; width: number; height: number };

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
			// POLYLINE matches the state-diagram routing. Compared to
			// ORTHOGONAL, it allows mid-segment diagonals which makes
			// flowcharts with many decisions feel less mechanical and
			// keeps lanes shorter (less wraparound on busy graphs).
			// Bend-point geometry is still mostly orthogonal — the
			// rounded-corner renderer (`pointsToRoundedPath`) softens
			// any remaining sharp angles.
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