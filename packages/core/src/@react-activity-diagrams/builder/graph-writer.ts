import { Edge, Node } from '@xyflow/react';

export type WriterState = {
  nodeIdCounter: number;
};

export class GraphWriter {
  constructor(
    private readonly nodes: Node[],
    private readonly edges: Edge[],
    private readonly state: WriterState,
  ) {}

  addFlowNode(type: string, label: string): string {
    const id = `${type}-${this.state.nodeIdCounter++}`;

    this.nodes.push({
      id,
      type,
      position: { x: 0, y: 0 },
      data: { label },
    });

    return id;
  }

  addEdge(source: string, target: string, label?: string): void {
    this.edges.push({
      id: `edge-${this.edges.length}-${source}-${target}`,
      source,
      target,
      label,
      type: 'floating',
    });
  }
}