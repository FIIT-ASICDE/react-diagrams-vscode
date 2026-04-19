import { Edge, Node } from '@xyflow/react';
import {
  Statement,
  SourceFile,
} from 'ts-morph';
import { GraphWriter } from './graph-writer';
import { StatementVisitor } from './visitors';
import { adjustDecisionEdgeHandles, applyElkLayout } from './elkLayout';

export class DiagramBuilder {
  private nodes: Node[] = [];
  private edges: Edge[] = [];

  public async build(ast: SourceFile): Promise<{ nodes: Node[]; edges: Edge[] }> {
    return this.buildStatements(ast.getStatements());
  }

  public async buildStatements(statements: Statement[]): Promise<{ nodes: Node[]; edges: Edge[] }> {
  this.reset();

  const writer = new GraphWriter(this.nodes, this.edges);
  const visitor = new StatementVisitor(writer);

  const startId = writer.addFlowNode('initial', 'Start');
  const main = visitor.visitStatements(statements);

  const uniqueEndExits = [...new Set(main.endExits)];
  const uniqueNormalExits = [...new Set(main.exits)].filter((exit) => !uniqueEndExits.includes(exit));

  const endId = writer.addFlowNode('end', 'End');

  if (main.entry) {
    writer.addEdge(startId, main.entry);

    const terminalSources = [...new Set([...uniqueNormalExits, ...uniqueEndExits])];

    if (terminalSources.length === 0) {
      writer.addEdge(startId, endId);
    } else if (terminalSources.length === 1) {
      const onlyExit = terminalSources[0];
      writer.addEdge(
        onlyExit,
        endId,
        onlyExit.startsWith('decision-') || onlyExit.startsWith('loop-') ? 'no' : undefined,
        false,
        onlyExit.startsWith('decision-') || onlyExit.startsWith('loop-')
          ? { branchSide: 'left', semanticKind: 'negative' }
          : { branchSide: 'bottom', semanticKind: 'normal' },
      );
    } else {
      const finalMergeId = writer.addFlowNode('merge', '');

      for (const exit of terminalSources) {
        writer.addEdge(
          exit,
          finalMergeId,
          exit.startsWith('decision-') || exit.startsWith('loop-') ? 'no' : undefined,
          false,
          exit.startsWith('decision-') || exit.startsWith('loop-')
            ? { branchSide: 'left', semanticKind: 'negative' }
            : { branchSide: 'bottom', semanticKind: 'normal' },
        );
      }

      writer.addEdge(finalMergeId, endId);
    }
  } else {
    writer.addEdge(startId, endId);
  }

  this.normalizeGraphStructure();
  this.reindexEdgeIds();

  const layoutedGraph = await applyElkLayout(this.nodes, this.edges);
  const adjustedEdges = adjustDecisionEdgeHandles(layoutedGraph.nodes, layoutedGraph.edges);
  return { nodes: layoutedGraph.nodes, edges: adjustedEdges };
}

  private normalizeGraphStructure(): void {
    this.removeDuplicateEdges();
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