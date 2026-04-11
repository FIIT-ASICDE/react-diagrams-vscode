import { Edge, Node } from '@xyflow/react';
import type { FlowNodeData } from './types';
export type WriterState = {
  nodeIdCounter: number;
};

export class GraphWriter {
  constructor(
    private readonly nodes: Node[],
    private readonly edges: Edge[],
    private readonly state: WriterState,
  ) {}

  addFlowNode(type: string, label: string, data: Partial<FlowNodeData> = {}): string {
    const id = `${type}-${this.state.nodeIdCounter++}`;

    this.nodes.push({
      id,
      type,
      position: { x: 0, y: 0 },
      data: { label, ...data },
    });

    return id;
  }

  addEdge(source: string, target: string, label?: string, type?: string, data?: Record<string, unknown>): void {
    const isBackEdge = type === 'dashed';

    this.edges.push({
      id: `edge-${this.edges.length}-${source}-${target}`,
      source,
      target,
      sourceHandle: isBackEdge ? 'source-left' : 'source-bottom',
      targetHandle: isBackEdge ? 'target-left' : 'target-top',
      label: label,
      type: isBackEdge ? 'back' : 'smoothstep',
      style: isBackEdge ? { strokeDasharray: '6 4' } : undefined,
      data,
    });
  }
}