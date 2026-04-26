import ELK, { type ElkExtendedEdge, type ElkNode } from 'elkjs/lib/elk.bundled.js';
import { Position, type Edge, type Node } from '@xyflow/react';

type LayoutDirection = 'DOWN' | 'RIGHT';

type LayoutResult = {
  nodes: Node[];
  edges: Edge[];
};

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

  // Keep layered layout acyclic by routing back-edges separately.
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

  const nodeBoxById = new Map<string, { x: number; y: number; width: number; height: number }>();

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

  const graphRightEdge = Math.max(
    0,
    ...layoutedNodes.map((node) => node.position.x + (node.width ?? 0)),
  );
  const firstLaneX = graphRightEdge + 40;
  const laneSpacing = 30;

  const layoutedBackEdges: Edge[] = backEdges.map((edge, index) => {
    const srcBox = nodeBoxById.get(String(edge.source));
    const tgtBox = nodeBoxById.get(String(edge.target));
    if (!srcBox || !tgtBox) return edge;

    const srcAnchor = { x: srcBox.x + srcBox.width, y: srcBox.y + srcBox.height / 2 };
    const tgtAnchor = { x: tgtBox.x + tgtBox.width, y: tgtBox.y + tgtBox.height / 2 };

    const laneX = firstLaneX + index * laneSpacing;
    const points = [
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

  return {
    nodes: layoutedNodes,
    edges: [...layoutedDownwardEdges, ...layoutedBackEdges],
  };
}
