import { Edge, Node } from '@xyflow/react';
import type { FlowNodeData } from './types';

export type BranchSide = 'left' | 'right' | 'bottom';
export type SemanticKind = 'positive' | 'negative' | 'case' | 'default' | 'loop-back' | 'normal';

export type EdgeBranchData = Record<string, unknown> & {
  branchSide?: BranchSide;
  semanticKind?: SemanticKind;
};

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

  addEdge(source: string, target: string, label?: string, isBackEdge = false, data?: EdgeBranchData): void {
    const branchSide: BranchSide = data?.branchSide ?? 'bottom';
    const sourceHandle = isBackEdge
      ? 'source-bottom'
      : (branchSide === 'right' ? 'source-left' : branchSide === 'left' ? 'source-right' : 'source-bottom');

    this.edges.push({
      id: `edge-${this.nextEdgeId++}`,
      source,
      target,
      sourceHandle,
      targetHandle: isBackEdge ? 'target-left' : 'target-top',
      label: label,
      type: isBackEdge ? 'back' : 'smoothstep',
      style: isBackEdge ? { strokeDasharray: '6 4' } : undefined,
      data,
    });
  }
}