import ELK from 'elkjs/lib/elk.bundled';
import { Position, type Edge, type Node } from '@xyflow/react';

const elk = new ELK();

type ElkDirection = 'DOWN' | 'RIGHT';
type ElkLayoutOptions = Record<string, string>;

export interface LayoutResult {
  nodes: Node[];
  edges: Edge[];
}

type EdgeSemanticKind = 'positive' | 'negative' | 'case' | 'default' | 'loop-back' | 'normal';

function getEdgeSemanticKind(edge: Edge): EdgeSemanticKind | undefined {
  const raw = (edge.data as { semanticKind?: unknown } | undefined)?.semanticKind;
  if (typeof raw !== 'string') {
    return undefined;
  }

  const normalized = raw.trim().toLowerCase();
  if (
    normalized === 'positive' ||
    normalized === 'negative' ||
    normalized === 'case' ||
    normalized === 'default' ||
    normalized === 'loop-back' ||
    normalized === 'normal'
  ) {
    return normalized;
  }

  return undefined;
}

export function adjustDecisionEdgeHandles(nodes: Node[], edges: Edge[]): Edge[] {
  const nodeById = new Map(nodes.map((node) => [String(node.id), node]));

  return edges.map((edge) => {
    if (edge.type === 'back') {
      return edge;
    }

    const semanticKind = getEdgeSemanticKind(edge);
    if (semanticKind !== 'positive' && semanticKind !== 'negative') {
      return edge;
    }

    const sourceNode = nodeById.get(String(edge.source));
    if (!sourceNode || (sourceNode.type !== 'decision' && sourceNode.type !== 'loop')) {
      return edge;
    }

    const targetNode = nodeById.get(String(edge.target));
    if (!targetNode) {
      return edge;
    }

    let sourceHandle: string = 'source-bottom';
    if (targetNode.position.x < sourceNode.position.x) {
      sourceHandle = 'source-left';
    } else if (targetNode.position.x > sourceNode.position.x) {
      sourceHandle = 'source-right';
    }

    return {
      ...edge,
      sourceHandle,
    };
  });
}

const elkBaseOptions: ElkLayoutOptions = {
  'elk.algorithm': 'layered',
  'elk.layered.spacing.nodeNodeBetweenLayers': '65',
  'elk.spacing.nodeNode': '75',
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

  return { width: 200, height: 56 };
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
