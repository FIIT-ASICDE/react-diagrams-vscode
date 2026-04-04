import ELK from 'elkjs/lib/elk.bundled';
import { Position, type Edge, type Node } from '@xyflow/react';

const elk = new ELK();

type ElkDirection = 'DOWN' | 'RIGHT';
type ElkLayoutOptions = Record<string, string>;

export interface LayoutResult {
  nodes: Node[];
  edges: Edge[];
}

const elkOptions: ElkLayoutOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.layered.spacing.nodeNodeBetweenLayers': '100',
  'elk.spacing.nodeNode': '80',
  'elk.layered.cycleBreaking.strategy': 'DEPTH_FIRST',
  'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.layered.feedbackEdges': 'true',
  'elk.edgeRouting': 'ORTHOGONAL',
};

/**
 * Applies ELK layered layout algorithm to nodes and edges
 * @param nodes - Array of React Flow nodes to layout
 * @param edges - Array of React Flow edges
 * @param direction - Layout direction: 'DOWN' (default) or 'RIGHT'
 * @returns Promise with layouted nodes and edges
 */
export async function applyElkLayout(
  nodes: Node[],
  edges: Edge[],
  direction: ElkDirection = 'RIGHT',
): Promise<LayoutResult> {
  const isHorizontal = direction === 'RIGHT';

  const graph = {
    id: 'root',
    layoutOptions: {
      'elk.direction': isHorizontal ? 'RIGHT' : 'RIGHT',
      ...elkOptions,
    },
    children: nodes.map((node) => ({
      ...node,
      targetPosition: isHorizontal ? Position.Left : Position.Top,
      sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
      width: 150,
      height: 50,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };

  const layoutedGraph = await elk.layout(graph);
  const layoutedChildren = layoutedGraph.children ?? [];

  const layoutedNodes: Node[] = layoutedChildren.map((elkNode) => ({
    id: elkNode.id,
    position: { x: elkNode.x ?? 0, y: elkNode.y ?? 0 },
    data: nodes.find((n) => n.id === elkNode.id)?.data ?? {},
    type: nodes.find((n) => n.id === elkNode.id)?.type,
    sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
    targetPosition: isHorizontal ? Position.Left : Position.Top,
  }));
  return { nodes: layoutedNodes, edges };
}
