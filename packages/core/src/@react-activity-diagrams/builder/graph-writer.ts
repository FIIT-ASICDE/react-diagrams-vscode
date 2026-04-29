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

  // ── Public API for visitors ─────────────────────────────────────────
  //
  // Visitors used to access `this.nodes` directly through an unsafe
  // `(host as unknown as { nodes?: Node[] }).nodes` cast in a separate
  // node-data-utils module. That cast bypassed the `private readonly`
  // declaration above and silently returned `undefined` whenever the
  // host shape didn't match. The three methods below replace that
  // pattern with proper type-checked accessors:
  //
  //   - `getNodeData`     reads merged data from a node
  //   - `updateNodeData`  merges new entries into a node's data
  //   - `getNodeType`     reads the node's `type` field (used by
  //                       `tagLoopLabel` and similar callers that only
  //                       need to discriminate node kind)
  //
  // All three throw an explicit error when the id doesn't exist —
  // visitors only call these on ids they themselves just allocated, so
  // a miss indicates a bug rather than an expected case to silently
  // swallow.

  /**
   * Read the data object attached to a node. Returns `undefined` only
   * when the node id doesn't exist; an existing node with no extra
   * data still returns its `{ label }` data object.
   */
  getNodeData(id: string): Record<string, unknown> | undefined {
    const node = this.findNodeById(id);
    return node?.data as Record<string, unknown> | undefined;
  }

  /**
   * Merge `extra` into the node's existing data. Visitors use this to
   * tag nodes after creation with construct kind, loop labels,
   * try-exit-boundary markers, etc.
   *
   * Existing keys are overwritten; absent keys are preserved.
   */
  updateNodeData(id: string, extra: Record<string, unknown>): void {
    const node = this.findNodeById(id);
    if (!node) return;
    node.data = { ...(node.data ?? {}), ...extra };
  }

  /**
   * Read the node's React Flow `type` (`'decision'`, `'loop'`,
   * `'action'`, etc.). Used by `tagLoopLabel` to decide whether a
   * pending labeled-statement label applies to the entry node.
   */
  getNodeType(id: string): string | undefined {
    return this.findNodeById(id)?.type;
  }

  private findNodeById(id: string): Node | undefined {
    return this.nodes.find((node) => node.id === id);
  }


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
      // Let React Flow pick default handles. ELK will route to/from node boundaries.
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