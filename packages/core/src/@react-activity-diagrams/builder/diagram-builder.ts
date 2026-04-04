import { Edge, Node } from '@xyflow/react';
import {
  SourceFile,
} from 'ts-morph';
import { GraphWriter, type WriterState } from './graph-writer';
import { StatementVisitor } from './visitors';

export class DiagramBuilder {
  private nodes: Node[] = [];
  private edges: Edge[] = [];
  private nodeIdCounter = 0;

  public build(ast: SourceFile): { nodes: Node[]; edges: Edge[] } {
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

    return { nodes: this.nodes, edges: this.edges };
  }

  private reset() {
    this.nodes = [];
    this.edges = [];
    this.nodeIdCounter = 0;
  }
}