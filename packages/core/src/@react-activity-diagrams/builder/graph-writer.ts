import { Edge, Node } from '@xyflow/react';
import type { FlowNodeData } from './types';

export type EdgeSemanticKind = 'positive' | 'negative' | 'case' | 'default' | 'loop-back' | 'normal';

export class GraphWriter {
  private nextNodeId = 0;
  private nextEdgeId = 0;

  constructor(
    private readonly nodes: Node[],
    private readonly edges: Edge[],
  ) {}

  addFlowNode(type: string, label: string, data: Partial<FlowNodeData> = {}): string {
    const id = `${type}-${this.nextNodeId++}`;

    this.nodes.push({
      id,
      type,
      position: { x: 0, y: 0 },
      data: { label, ...data },
    });

    return id;
  }

  /**
   * Find a node by id so we know its type (decision, loop, action, ...).
   * The source node type determines what handles are available.
   */
  private findNode(id: string): Node | undefined {
    return this.nodes.find((n) => n.id === id);
  }

  /**
   * Derive edge semantic kind from its label. This label is what visitors
   * pass in ("yes", "no", "each", "exception", ...), so we map it to a
   * stable semantic tag used later for handle picking and styling.
   */
  private deriveSemanticKind(label: string | undefined, isBackEdge: boolean): EdgeSemanticKind {
    if (isBackEdge) return 'loop-back';
    if (!label) return 'normal';
    const l = label.trim().toLowerCase();
    if (l === 'yes' || l === 'each' || l === 'try') return 'positive';
    if (l === 'no' || l === 'exception' || l === 'catch' || l === 'error') return 'negative';
    if (l === 'default') return 'default';
    if (l.startsWith('case')) return 'case';
    return 'normal';
  }

  /**
   * Pick the correct source handle based on the source node type and the
   * edge's semantic kind. Decision/loop nodes have three outbound handles
   * (left/right/bottom); everything else only uses bottom.
   */
  private pickSourceHandle(sourceNode: Node | undefined, kind: EdgeSemanticKind): string {
    if (kind === 'loop-back') return 'source-top';

    if (sourceNode && (sourceNode.type === 'decision' || sourceNode.type === 'loop')) {
      if (kind === 'positive') return 'source-right';
      if (kind === 'negative') return 'source-left';
      // case/default/normal fall through the bottom
    }
    return 'source-bottom';
  }

  private pickTargetHandle(kind: EdgeSemanticKind): string {
    if (kind === 'loop-back') return 'target-top';
    return 'target-top';
  }

addEdge(source: string, target: string, label?: string, isBackEdge = false): void {
  this.edges.push({
    id: `edge-${this.nextEdgeId++}`,
    source,
    target,
    // Let React Flow pick default handles. ELK will route to/from node boundaries.
    animated: isBackEdge ? true : undefined,
    label,
    type: isBackEdge ? 'back' : 'default',   // ← 'default' instead of 'smoothstep'
    style: isBackEdge
      ? { strokeDasharray: '6 4', stroke: '#024105' }
      : { stroke: 'rgb(0, 5, 71)', strokeWidth: 1 },
    markerEnd: {
      type: 'arrowclosed',
      color: '#000000',
    },
  });
}
}