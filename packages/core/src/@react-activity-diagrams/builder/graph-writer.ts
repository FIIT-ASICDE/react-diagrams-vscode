import { Edge, Node } from '@xyflow/react';
import type { FlowNodeData } from './types';

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

  addEdge(source: string, target: string, label?: string, isBackEdge = false, data?: Record<string, unknown>): void {
    this.edges.push({
      id: `edge-${this.nextEdgeId++}`,
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