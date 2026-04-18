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
    const returnTargetId = main.endExits.length > 1
      ? writer.addFlowNode('merge', '')
      : endId;

    if (returnTargetId !== endId) {
      writer.addEdge(returnTargetId, endId);
    }

    if (main.entry) {
      writer.addEdge(startId, main.entry);
      for (const exit of main.exits) {
        writer.addEdge(exit, endId, exit.startsWith('decision-') ? 'no' : undefined);
      }

      for (const endExit of main.endExits) {
        writer.addEdge(endExit, returnTargetId);
      }
    } else {
      writer.addEdge(startId, endId);
    }

    this.removeRedundantMergeNodes();
	this.reindexEdgeIds();
	const layoutedGraph = await applyElkLayout(this.nodes, this.edges);
    return { nodes: layoutedGraph.nodes, edges: layoutedGraph.edges };
  }

  private removeRedundantMergeNodes(): void {
    while (true) {
      const redundantMerge = this.nodes.find((node) => {
        if (node.type !== 'merge') {
          return false;
        }

        const incomingCount = this.edges.filter((edge) => edge.target === node.id).length;
        return incomingCount < 2;
      });

      if (!redundantMerge) {
        return;
      }

      const incomingEdges = this.edges.filter((edge) => edge.target === redundantMerge.id);
      const outgoingEdges = this.edges.filter((edge) => edge.source === redundantMerge.id);

      const bypassEdges: Edge[] = [];
      if (incomingEdges.length === 1) {
        const [incomingEdge] = incomingEdges;

        for (const outgoingEdge of outgoingEdges) {
          bypassEdges.push({
            ...outgoingEdge,
            source: incomingEdge.source,
            sourceHandle: incomingEdge.sourceHandle,
            label: outgoingEdge.label ?? incomingEdge.label,
          });
        }
      }

      this.nodes = this.nodes.filter((node) => node.id !== redundantMerge.id);
      this.edges = this.edges.filter(
        (edge) => edge.source !== redundantMerge.id && edge.target !== redundantMerge.id,
      );

      this.edges.push(...bypassEdges);
    }
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