import { Edge, Node } from '@xyflow/react';
import {
  SourceFile,
  Statement,
  SyntaxKind,
  IfStatement,
  WhileStatement,
  ForStatement,
} from 'ts-morph';
import { StatementVisitor, type VisitorState } from './visitors';

export class DiagramBuilder {
  private nodes: Node[] = [];
  private edges: Edge[] = [];
  private nodeIdCounter = 0;
  private currentY = 0;

  private readonly centerX = 300;
  private readonly verticalGap = 100;
  private readonly branchOffset = 220;

  public build(ast: SourceFile): { nodes: Node[]; edges: Edge[] } {
    this.reset();

    const state = { nodeIdCounter: 0, currentY: 0 };
    const visitor = new StatementVisitor(
      this.nodes,
      this.edges,
      state,
      this.centerX,
      this.verticalGap,
      this.branchOffset,
    );

    const startId = this.createFlowNode('terminator', 'Start', this.centerX, state);
    const main = visitor.visitStatements(ast.getStatements(), this.centerX);

    this.nodeIdCounter = state.nodeIdCounter;
    this.currentY = state.currentY;

    const endId = this.createFlowNode('terminator', 'End', this.centerX, state);

    if (main.entry) {
      this.createEdge(startId, main.entry);
      for (const exit of main.exits) {
        this.createEdge(exit, endId);
      }
    } else {
      this.createEdge(startId, endId);
    }

    return { nodes: this.nodes, edges: this.edges };
  }

  private reset() {
    this.nodes = [];
    this.edges = [];
    this.nodeIdCounter = 0;
    this.currentY = 0;
  }

  private nextId(prefix = 'node') {
    return `${prefix}-${this.nodeIdCounter++}`;
  }

  private nextY(state?: { nodeIdCounter: number; currentY: number }) {
    const y = state ? state.currentY : this.currentY;
    if (state) {
      state.currentY += this.verticalGap;
    } else {
      this.currentY += this.verticalGap;
    }
    return y;
  }

  private createFlowNode(type: string, label: string, x: number, state: { nodeIdCounter: number; currentY: number }): string {
    const prefix = type;
    const id = `${prefix}-${state.nodeIdCounter++}`;

    this.nodes.push({
      id,
      type,
      position: { x, y: this.nextY(state) },
      data: { label },
    });

    return id;
  }

  private createEdge(source: string, target: string, label?: string) {
    this.edges.push({
      id: `edge-${this.edges.length}-${source}-${target}`,
      source,
      target,
      label,
      type: 'smoothstep',
    });
  }
}