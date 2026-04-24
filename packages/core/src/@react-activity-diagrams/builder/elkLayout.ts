// import ELK, { type ElkNode, type ElkExtendedEdge } from 'elkjs/lib/elk.bundled.js';
// import { Position, type Edge, type Node } from '@xyflow/react';

// type LayoutDirection = 'DOWN' | 'RIGHT';

// export interface LayoutResult {
//   nodes: Node[];
//   edges: Edge[];
// }

// function isBackEdge(edge: Edge): boolean {
//   return edge.type === 'back';
// }

// export function adjustDecisionEdgeHandles(_nodes: Node[], edges: Edge[]): Edge[] {
//   return edges;
// }

// function estimateNodeSize(_node: Node): { width: number; height: number } {
//   return { width: 200, height: 56 };
// }

// const elk = new ELK();

// export async function applyElkLayout(
//   nodes: Node[],
//   edges: Edge[],
//   direction: LayoutDirection = 'DOWN',
// ): Promise<LayoutResult> {
//   const isHorizontal = direction === 'RIGHT';

//   // Split: downward edges go to ELK; back edges are routed manually afterwards
//   // so the layered layout sees a purely acyclic graph and stays top-to-bottom.
//   const downwardEdges = edges.filter((e) => !isBackEdge(e));
//   const backEdges = edges.filter((e) => isBackEdge(e));

//   const elkGraph: ElkNode = {
//     id: 'root',
//     layoutOptions: {
//       'elk.algorithm': 'layered',
//       'elk.direction': isHorizontal ? 'RIGHT' : 'DOWN',
//       'elk.layered.spacing.nodeNodeBetweenLayers': '90',
//       'elk.spacing.nodeNode': '50',
//       'elk.spacing.edgeNode': '40',
//       'elk.spacing.edgeEdge': '25',
//       'elk.padding': '[top=20,left=20,bottom=20,right=20]',
//       'elk.edgeRouting': 'ORTHOGONAL',
//       'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
//       'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
//       'elk.layered.thoroughness': '10',
//     },
//     children: nodes.map((node) => {
//       const { width, height } = estimateNodeSize(node);
//       return { id: String(node.id), width, height };
//     }),
//     edges: downwardEdges.map((edge) => ({
//       id: String(edge.id),
//       sources: [String(edge.source)],
//       targets: [String(edge.target)],
//     })) satisfies ElkExtendedEdge[],
//   };

//   const layout = await elk.layout(elkGraph);

//   // Collect node boxes for back-edge routing.
//   const elkNodeById = new Map<string, ElkNode>();
//   for (const child of layout.children ?? []) elkNodeById.set(child.id, child);

//   const nodeBoxById = new Map<string, { x: number; y: number; width: number; height: number }>();

//   const layoutedNodes: Node[] = nodes.map((node) => {
//     const { width, height } = estimateNodeSize(node);
//     const elkNode = elkNodeById.get(String(node.id));
//     const x = elkNode?.x ?? 0;
//     const y = elkNode?.y ?? 0;

//     nodeBoxById.set(String(node.id), { x, y, width, height });

//     return {
//       id: node.id,
//       position: { x, y },
//       data: node.data ?? {},
//       type: node.type,
//       draggable: true,
//       sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
//       targetPosition: isHorizontal ? Position.Left : Position.Top,
//       width,
//       height,
//     };
//   });

//   // Downward edges: use ELK's computed points.
//   const elkEdgeById = new Map<string, ElkExtendedEdge>();
//   for (const elkEdge of layout.edges ?? []) elkEdgeById.set(elkEdge.id, elkEdge);

//   const layoutedDownwardEdges: Edge[] = downwardEdges.map((edge) => {
//     const elkEdge = elkEdgeById.get(String(edge.id));
//     const section = elkEdge?.sections?.[0];
//     if (!section) return edge;

//     const points = [
//       { x: section.startPoint.x, y: section.startPoint.y },
//       ...(section.bendPoints ?? []).map((p) => ({ x: p.x, y: p.y })),
//       { x: section.endPoint.x, y: section.endPoint.y },
//     ];

//     return { ...edge, data: { ...(edge.data ?? {}), points } };
//   });

//   // Back edges: manually route a "C"-shape up the right side of the graph.
//   // Each back edge gets its own lane so they don't overlap.
//   const graphRightEdge = Math.max(
//     0,
//     ...layoutedNodes.map((n) => n.position.x + (n.width ?? 0)),
//   );
//   const firstLaneX = graphRightEdge + 40;
//   const laneSpacing = 30;

//   const layoutedBackEdges: Edge[] = backEdges.map((edge, idx) => {
//     const srcBox = nodeBoxById.get(String(edge.source));
//     const tgtBox = nodeBoxById.get(String(edge.target));
//     if (!srcBox || !tgtBox) return edge;

//     // Source anchors on its right side; target anchors on its right side.
//     const srcAnchor = { x: srcBox.x + srcBox.width, y: srcBox.y + srcBox.height / 2 };
//     const tgtAnchor = { x: tgtBox.x + tgtBox.width, y: tgtBox.y + tgtBox.height / 2 };

//     const laneX = firstLaneX + idx * laneSpacing;

//     const points = [
//       srcAnchor,
//       { x: laneX, y: srcAnchor.y },
//       { x: laneX, y: tgtAnchor.y },
//       tgtAnchor,
//     ];

//     return { ...edge, data: { ...(edge.data ?? {}), points } };
//   });

//   return {
//     nodes: layoutedNodes,
//     edges: [...layoutedDownwardEdges, ...layoutedBackEdges],
//   };
// }











import ELK, { type ElkNode, type ElkExtendedEdge, type ElkPort } from 'elkjs/lib/elk.bundled.js';
import { Position, type Edge, type Node } from '@xyflow/react';

type LayoutDirection = 'DOWN' | 'RIGHT';

export interface LayoutResult {
  nodes: Node[];
  edges: Edge[];
}

function isUpwardEdge(edge: Edge): boolean {
  return edge.type === 'back';
}

function handleToElkSide(handle: string | null | undefined): 'NORTH' | 'SOUTH' | 'EAST' | 'WEST' {
  if (!handle) return 'SOUTH';
  if (handle.endsWith('-left')) return 'WEST';
  if (handle.endsWith('-right')) return 'EAST';
  if (handle.endsWith('-top')) return 'NORTH';
  return 'SOUTH';
}

/**
 * Kept for API compatibility. Handles are now picked at edge-creation time
 * inside GraphWriter, so this is a no-op passthrough.
 */
export function adjustDecisionEdgeHandles(nodes: Node[], edges: Edge[]): Edge[] {
  void nodes;
  return edges;
}

function estimateNodeSize(_node: Node): { width: number; height: number } {
  return { width: 200, height: 56 };
}

const elk = new ELK();

export async function applyElkLayout(
  nodes: Node[],
  edges: Edge[],
  direction: LayoutDirection = 'DOWN',
): Promise<LayoutResult> {
  const isHorizontal = direction === 'RIGHT';

  // Build ELK ports from the handles the edges already have.
  const portsByNode = new Map<string, Map<string, ElkPort>>();
  const ensurePort = (nodeId: string, handle: string): string => {
    const portId = `${nodeId}__${handle}`;
    let nodePorts = portsByNode.get(nodeId);
    if (!nodePorts) {
      nodePorts = new Map();
      portsByNode.set(nodeId, nodePorts);
    }
    if (!nodePorts.has(portId)) {
      nodePorts.set(portId, {
        id: portId,
        layoutOptions: {
          'elk.port.side': handleToElkSide(handle),
        },
      });
    }
    return portId;
  };

  // Reverse upward edges so ELK sees an acyclic downward graph.
  const reversedEdgeIds = new Set<string>();
  const elkEdges: ElkExtendedEdge[] = edges.map((edge) => {
    const srcHandle = edge.sourceHandle ?? 'source-bottom';
    const tgtHandle = edge.targetHandle ?? 'target-top';

    if (isUpwardEdge(edge)) {
      // ELK sees: original TARGET → original SOURCE.
      // We anchor the reversed edge on the ELK-visible sides:
      //   - ELK source = bottom of original target node
      //   - ELK target = top of original source node
      const sourcePortId = ensurePort(String(edge.target), 'source-bottom');
      const targetPortId = ensurePort(String(edge.source), 'target-top');
      reversedEdgeIds.add(String(edge.id));
      return {
        id: String(edge.id),
        sources: [sourcePortId],
        targets: [targetPortId],
      };
    }

    const sourcePortId = ensurePort(String(edge.source), srcHandle);
    const targetPortId = ensurePort(String(edge.target), tgtHandle);
    return {
      id: String(edge.id),
      sources: [sourcePortId],
      targets: [targetPortId],
    };
  });

  const elkGraph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': isHorizontal ? 'RIGHT' : 'DOWN',
      'elk.layered.spacing.nodeNodeBetweenLayers': '90',
      'elk.spacing.nodeNode': '50',
      'elk.spacing.edgeNode': '40',
      'elk.spacing.edgeEdge': '25',
      'elk.padding': '[top=20,left=20,bottom=20,right=20]',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.portConstraints': 'FIXED_SIDE',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.layered.thoroughness': '10',
    },
    children: nodes.map((node) => {
      const { width, height } = estimateNodeSize(node);
      const ports = Array.from(portsByNode.get(String(node.id))?.values() ?? []);
      return {
        id: String(node.id),
        width,
        height,
        ports,
        layoutOptions: {
          'elk.portConstraints': 'FIXED_SIDE',
        },
      };
    }),
    edges: elkEdges,
  };

  const layout = await elk.layout(elkGraph);

  const elkNodeById = new Map<string, ElkNode>();
  for (const child of layout.children ?? []) elkNodeById.set(child.id, child);

  const layoutedNodes: Node[] = nodes.map((node) => {
    const { width, height } = estimateNodeSize(node);
    const elkNode = elkNodeById.get(String(node.id));
    return {
      id: node.id,
      position: { x: elkNode?.x ?? 0, y: elkNode?.y ?? 0 },
      data: node.data ?? {},
      type: node.type,
      draggable: true,
      sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
      targetPosition: isHorizontal ? Position.Left : Position.Top,
      width,
      height,
    };
  });

  const elkEdgeById = new Map<string, ElkExtendedEdge>();
  for (const elkEdge of layout.edges ?? []) elkEdgeById.set(elkEdge.id, elkEdge);

  const layoutedEdges: Edge[] = edges.map((edge) => {
    const elkEdge = elkEdgeById.get(String(edge.id));
    const section = elkEdge?.sections?.[0];
    if (!section) return edge;

    const rawPoints = [
      { x: section.startPoint.x, y: section.startPoint.y },
      ...(section.bendPoints ?? []).map((p) => ({ x: p.x, y: p.y })),
      { x: section.endPoint.x, y: section.endPoint.y },
    ];

    const points = reversedEdgeIds.has(String(edge.id))
      ? [...rawPoints].reverse()
      : rawPoints;

    return {
      ...edge,
      data: {
        ...(edge.data ?? {}),
        points,
      },
    };
  });

  return { nodes: layoutedNodes, edges: layoutedEdges };
}