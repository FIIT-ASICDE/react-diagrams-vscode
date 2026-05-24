import { Edge, Node } from '@xyflow/react';
import {
  Statement,
  SourceFile,
} from 'ts-morph';
import { GraphWriter } from './graph-writer';
import { StatementVisitor } from './visitor';

export class DiagramBuilder {
  private nodes: Node[] = [];
  private edges: Edge[] = [];

  // Builds a graph from a source file AST.
  public async build(ast: SourceFile): Promise<{ nodes: Node[]; edges: Edge[] }> {
    return this.buildStatements(ast.getStatements());
  }

  // Builds a graph from a statement list.
  public async buildStatements(statements: Statement[]): Promise<{ nodes: Node[]; edges: Edge[] }> {
    this.reset();

    const writer = new GraphWriter(this.nodes, this.edges);
    const visitor = new StatementVisitor(writer);

    const startId = writer.addFlowNode('initial', 'Start');
    const main = visitor.visitStatements(statements);

    if (!main.entry) {
      const endId = writer.addFlowNode('end', 'End');
      writer.addEdge(startId, endId);
      this.normalizeGraphStructure();
      this.reindexEdgeIds();
      return { nodes: this.nodes, edges: this.edges };
    }

    writer.addEdge(startId, main.entry, main.entryEdgeLabel);

    const successSources = [
      ...new Set([...main.exits, ...main.returnExits]),
    ];

    this.wireSourcesToSeparateTerminals(writer, successSources, 'End');

    const throwSources = [...new Set(main.throwExits)];

    this.wireSourcesToSeparateTerminals(writer, throwSources, 'ErrorEnd');

    if (successSources.length === 0 && throwSources.length === 0) {
      const endId = writer.addFlowNode('end', 'End');
      writer.addEdge(startId, endId);
    }

    this.normalizeGraphStructure();
    this.reindexEdgeIds();

    return { nodes: this.nodes, edges: this.edges };
  }

  // Connects source nodes to dedicated terminal nodes.
  private wireSourcesToSeparateTerminals(
    writer: GraphWriter,
    sources: string[],
    terminalLabel: 'End' | 'ErrorEnd',
  ): void {
    if (sources.length === 0) return;

    for (const source of sources) {
      const sourceType = writer.getNodeType(source);
      const label = sourceType === 'decision' || sourceType === 'loop' ? 'no' : undefined;
      const terminalId = writer.addFlowNode('end', terminalLabel);
      writer.addEdge(
        source,
        terminalId,
        label,
        false,
      );
    }
  }

  // Applies post-processing passes to normalize graph structure.
  private normalizeGraphStructure(): void {
    this.removeDanglingEdges();
    this.removeDuplicateEdges();
  }

  // Removes duplicate edges while keeping insertion order.
  private removeDuplicateEdges(): void {
    const seen = new Set<string>();
    const normalized: Edge[] = [];

    for (const edge of this.edges) {
      const key = [
        String(edge.source),
        String(edge.target),
        String(edge.label ?? ''),
        String(edge.type ?? ''),
        String(edge.sourceHandle ?? ''),
        String(edge.targetHandle ?? ''),
      ].join('|');

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      normalized.push(edge);
    }

    this.edges = normalized;
  }

  // Removes edges that reference missing source or target nodes.
  private removeDanglingEdges(): void {
    const nodeIds = new Set(this.nodes.map((node) => String(node.id)));
    this.edges = this.edges.filter((edge) => nodeIds.has(String(edge.source)) && nodeIds.has(String(edge.target)));
  }

  // Reassigns edge ids to a stable sequential format.
  private reindexEdgeIds(): void {
    this.edges = this.edges.map((edge, index) => ({
      ...edge,
      id: `edge-${index}`,
    }));
  }

  // Clears current node and edge buffers.
  private reset() {
    this.nodes = [];
    this.edges = [];
  }
}