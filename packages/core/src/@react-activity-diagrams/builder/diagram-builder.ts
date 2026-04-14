import { Edge, Node } from '@xyflow/react';
import {
  Statement,
  SourceFile,
} from 'ts-morph';
import { GraphWriter } from './graph-writer';
import { StatementVisitor } from './visitors';
import { applyElkLayout } from './elkLayout';
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

    const endId = writer.addFlowNode('end', 'End');

    if (main.entry) {
      writer.addEdge(startId, main.entry);
      for (const exit of main.exits) {
        writer.addEdge(exit, endId, exit.startsWith('decision-') ? 'no' : undefined);
      }
    } else {
      writer.addEdge(startId, endId);
    }
	const layoutedGraph = await applyElkLayout(this.nodes, this.edges);
    return { nodes: layoutedGraph.nodes, edges: layoutedGraph.edges };
  }

  private reset() {
    this.nodes = [];
    this.edges = [];
  }
}