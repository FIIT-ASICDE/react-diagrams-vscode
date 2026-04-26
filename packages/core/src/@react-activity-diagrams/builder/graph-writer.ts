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