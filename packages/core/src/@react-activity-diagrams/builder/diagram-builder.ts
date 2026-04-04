import { Edge, Node } from '@xyflow/react';
import {
  SourceFile,
} from 'ts-morph';
import { GraphWriter, type WriterState } from './graph-writer';
import { StatementVisitor } from './visitors';
import { applyElkLayout } from './elkLayout';
export class DiagramBuilder {
  private nodes: Node[] = [];
  private edges: Edge[] = [];
  private nodeIdCounter = 0;

  public async build(ast: SourceFile): Promise<{ nodes: Node[]; edges: Edge[] }> {
    this.reset();

    const state: WriterState = { nodeIdCounter: 0 };
    const writer = new GraphWriter(this.nodes, this.edges, state);
    const visitor = new StatementVisitor(writer);

    const startId = writer.addFlowNode('terminator', 'Start');
    const main = visitor.visitStatements(ast.getStatements());

    this.nodeIdCounter = state.nodeIdCounter;

    const endId = writer.addFlowNode('terminator', 'End');

    if (main.entry) {
      writer.addEdge(startId, main.entry);
      for (const exit of main.exits) {
        writer.addEdge(exit, endId);
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
    this.nodeIdCounter = 0;
  }
}