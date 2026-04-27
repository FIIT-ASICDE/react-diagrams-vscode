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
    animated: isBackEdge ? true : false,
    label,
    type: isBackEdge ? 'back' : 'default',
    style: {
      stroke: 'rgb(0, 0, 0)',
      strokeWidth: 1,
      ...(isBackEdge && { strokeDasharray: '6 4', stroke: 'rgb(200, 0, 0)' }),
    },
    markerEnd: {
      type: 'arrowclosed',
      color: '#000000',
    },
  });
}
}