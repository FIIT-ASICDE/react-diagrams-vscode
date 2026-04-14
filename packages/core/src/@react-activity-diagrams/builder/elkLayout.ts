import ELK from 'elkjs/lib/elk.bundled';
import { Position, type Edge, type Node } from '@xyflow/react';

const elk = new ELK();

type ElkDirection = 'DOWN' | 'RIGHT';
type ElkLayoutOptions = Record<string, string>;

export interface LayoutResult {
  nodes: Node[];
  edges: Edge[];
}

const elkBaseOptions: ElkLayoutOptions = {
  'elk.algorithm': 'layered',
  'elk.layered.spacing.nodeNodeBetweenLayers': '70',
  'elk.layered.cycleBreaking.strategy': 'DEPTH_FIRST',
  'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
  'elk.layered.nodePlacement.favorStraightEdges': 'true',
  'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  'elk.layered.feedbackEdges': 'true',
  'elk.edgeRouting': 'ORTHOGONAL',
};

function estimateNodeSize(node: Node): { width: number; height: number } {
  return { width: 500, height: 56 };
}

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
  direction: ElkDirection = 'DOWN',
): Promise<LayoutResult> {
  const isHorizontal = direction === 'RIGHT';

  const graph = {
    id: 'root',
    layoutOptions: {
      ...elkBaseOptions,
      'elk.direction': isHorizontal ? 'RIGHT' : 'DOWN',
    },
    children: nodes.map((node) => {
      const { width, height } = estimateNodeSize(node);
      return {
        id: node.id,
        width,
        height,
      };
    }),
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
    draggable: true,
    sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
    targetPosition: isHorizontal ? Position.Left : Position.Top,
  }));
  return { nodes: layoutedNodes, edges };
}
