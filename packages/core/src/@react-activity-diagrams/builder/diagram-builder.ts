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

  public async build(ast: SourceFile): Promise<{ nodes: Node[]; edges: Edge[] }> {
    return this.buildStatements(ast.getStatements());
  }

  /**
   * Build the diagram for a function body.
   *
   * The visitor produces three kinds of out-edges:
   *
   *   exits        — NORMAL fall-through. After visiting, anything still
   *                  in `exits` is "completed normally" and goes to End.
   *
   *   returnExits  — `return` statements. They go to End too, but kept
   *                  in their own bucket so they're never merged with
   *                  THROW flow on the way there.
   *
   *   throwExits   — UNHANDLED `throw` statements that escape the
   *                  function. They go to a SEPARATE ErrorEnd node so
   *                  exception flow stays visually and semantically
   *                  distinct from success / return flow.
   *
   * Merge rules (strict):
   *   - merging multiple normal exits into one merge is OK
   *   - merging multiple return exits is OK
   *   - merging normal + return into one merge before End is OK
   *   - merging throw flows with anything else is FORBIDDEN — they get
   *     their own merge (if multiple) and their own End node.
   */
  public async buildStatements(statements: Statement[]): Promise<{ nodes: Node[]; edges: Edge[] }> {
    this.reset();

    const writer = new GraphWriter(this.nodes, this.edges);
    const visitor = new StatementVisitor(writer);

    const startId = writer.addFlowNode('initial', 'Start');
    const main = visitor.visitStatements(statements);

    if (!main.entry) {
      // Empty function body — single Start → End edge.
      const endId = writer.addFlowNode('end', 'End');
      writer.addEdge(startId, endId);
      this.normalizeGraphStructure();
      this.reindexEdgeIds();
      return { nodes: this.nodes, edges: this.edges };
    }

    writer.addEdge(startId, main.entry, main.entryEdgeLabel);

    // ── Success-side End: normal exits + return exits ─────────────────

    const successSources = [
      ...new Set([...main.exits, ...main.returnExits]),
    ];

    this.wireSourcesToSeparateTerminals(writer, successSources, 'End');

    // ── Error-side End: unhandled throws only ─────────────────────────

    const throwSources = [...new Set(main.throwExits)];

    this.wireSourcesToSeparateTerminals(writer, throwSources, 'ErrorEnd');

    // Edge case: function had a body but produced NEITHER success nor
    // throw exits (every path was already terminated somewhere in the
    // graph — unusual but possible with malformed input). Add a dangling
    // End so the graph remains structurally valid.
    if (successSources.length === 0 && throwSources.length === 0) {
      const endId = writer.addFlowNode('end', 'End');
      writer.addEdge(startId, endId);
    }

    this.normalizeGraphStructure();
    this.reindexEdgeIds();

    return { nodes: this.nodes, edges: this.edges };
  }

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

  private normalizeGraphStructure(): void {
    this.removeDanglingEdges();
    this.removeDuplicateEdges();
  }

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

  private removeDanglingEdges(): void {
    const nodeIds = new Set(this.nodes.map((node) => String(node.id)));
    this.edges = this.edges.filter((edge) => nodeIds.has(String(edge.source)) && nodeIds.has(String(edge.target)));
  }

  private reindexEdgeIds(): void {
    this.edges = this.edges.map((edge, index) => ({
      ...edge,
      id: `edge-${index}`,
    }));
  }

  private reset() {
    this.nodes = [];
    this.edges = [];
  }
}