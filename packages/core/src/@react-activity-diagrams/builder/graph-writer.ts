import { Edge, Node } from '@xyflow/react';
import type { FlowNodeData } from './types';

export class GraphWriter {
  private nextNodeId = 0;
  private nextEdgeId = 0;

  // Initializes the writer with mutable node and edge collections.
  constructor(
    private readonly nodes: Node[],
    private readonly edges: Edge[],
  ) {}

  // Adds a flow node and returns its generated id.
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

  // Returns the data object for a node id.
  getNodeData(id: string): Record<string, unknown> | undefined {
    const node = this.findNodeById(id);
    return node?.data as Record<string, unknown> | undefined;
  }

  // Merges additional data into an existing node.
  updateNodeData(id: string, extra: Record<string, unknown>): void {
    const node = this.findNodeById(id);
    if (!node) return;
    node.data = { ...(node.data ?? {}), ...extra };
  }

  // Returns the React Flow type for a node id.
  getNodeType(id: string): string | undefined {
    return this.findNodeById(id)?.type;
  }

  // Finds a node by id in the current collection.
  private findNodeById(id: string): Node | undefined {
    return this.nodes.find((node) => node.id === id);
  }

  // Adds an edge between two nodes with optional label and back-edge styling.
  addEdge(source: string, target: string, label?: string, isBackEdge = false): void {
    let normalizedLabel = label;
    const sourceNode = this.findNodeById(source);
    const sourceData = sourceNode?.data as Record<string, unknown> | undefined;
    const sourceConstruct = typeof sourceData?.construct === 'string' ? sourceData.construct : '';

    if (
      sourceNode?.type === 'decision' &&
      sourceConstruct !== 'switch' &&
      (typeof normalizedLabel !== 'string' || normalizedLabel.trim() === '')
    ) {
      normalizedLabel = 'no';
    }

    this.edges.push({
      id: `edge-${this.nextEdgeId++}`,
      source,
      target,
      animated: isBackEdge ? true : undefined,
      label: normalizedLabel,
      type: isBackEdge ? 'back' : 'default',
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