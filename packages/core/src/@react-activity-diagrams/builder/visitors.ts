import { Edge, Node } from '@xyflow/react';
import {
  Statement,
  Node as MorphNode,
  IfStatement,
  WhileStatement,
  ForStatement,
  ExpressionStatement,
  VariableStatement,
  ReturnStatement,
  Block,
} from 'ts-morph';

export type BuildResult = {
  entry?: string;
  exits: string[];
};

export type VisitorState = {
  nodeIdCounter: number;
  currentY: number;
};

export class StatementVisitor {
  constructor(
    private nodes: Node[],
    private edges: Edge[],
    private state: VisitorState,
    private centerX: number,
    private verticalGap: number,
    private branchOffset: number,
  ) {}

  private nextId(prefix = 'node'): string {
    return `${prefix}-${this.state.nodeIdCounter++}`;
  }

  private nextY(): number {
    const y = this.state.currentY;
    this.state.currentY += this.verticalGap;
    return y;
  }

  private addFlowNode(type: string, label: string, x: number, y: number): string {
    const id = this.nextId(type);

    this.nodes.push({
      id,
      type,
      position: { x, y },
      data: { label },
    });

    return id;
  }

  private addEdge(source: string, target: string, label?: string): void {
    this.edges.push({
      id: `edge-${this.edges.length}-${source}-${target}`,
      source,
      target,
      label,
      type: 'smoothstep',
    });
  }

  private compact(text: string): string {
    const cleaned = text.replace(/\s+/g, ' ').trim();
    return cleaned.length > 40 ? `${cleaned.slice(0, 37)}...` : cleaned;
  }

  visitStatements(statements: Statement[], x: number): BuildResult {
    let entry: string | undefined;
    let pendingExits: string[] = [];

    for (let i = 0; i < statements.length; i++) {
      const result = this.visitStatement(statements[i], x);

      if (!result.entry) continue;

      if (!entry) {
        entry = result.entry;
      }

      for (const exit of pendingExits) {
        this.addEdge(exit, result.entry);
      }

      pendingExits = result.exits;
    }

    return {
      entry,
      exits: entry ? pendingExits.length ? pendingExits : [] : [],
    };
  }

  visitStatement(stmt: Statement, x: number): BuildResult {
    if (stmt.getKind() === 1) {
      // ExpressionStatement
      return this.visitAction((stmt as ExpressionStatement).getExpression().getText(), x);
    }

    if (stmt.getKind() === 2) {
      // VariableStatement
      return this.visitAction((stmt as VariableStatement).getText(), x);
    }

    if (stmt.getKind() === 3) {
      // ReturnStatement
      const id = this.addFlowNode('action', stmt.getText(), x, this.nextY());
      return { entry: id, exits: [] };
    }

    if (stmt.getKind() === 5) {
      // IfStatement
      return this.visitIf(stmt as IfStatement, x);
    }

    if (stmt.getKind() === 6) {
      // WhileStatement
      return this.visitWhile(stmt as WhileStatement, x);
    }

    if (stmt.getKind() === 7) {
      // ForStatement
      return this.visitFor(stmt as ForStatement, x);
    }

    if (stmt.getKind() === 8) {
      // Block
      return this.visitStatements((stmt as Block).getStatements(), x);
    }

    return this.visitAction(this.compact(stmt.getText()), x);
  }

  visitAction(label: string, x: number): BuildResult {
    const id = this.addFlowNode('action', this.compact(label), x, this.nextY());
    return { entry: id, exits: [id] };
  }

  visitIf(stmt: IfStatement, x: number): BuildResult {
    const decisionId = this.addFlowNode('decision', this.compact(stmt.getExpression().getText()), x, this.nextY());

    const thenResult = this.visitBranch(stmt.getThenStatement(), x - this.branchOffset);
    const elseStmt = stmt.getElseStatement();
    const elseResult = elseStmt
      ? this.visitBranch(elseStmt, x + this.branchOffset)
      : undefined;

    const mergeId = this.addFlowNode('merge', '', x, this.nextY());

    if (thenResult.entry) {
      this.addEdge(decisionId, thenResult.entry, 'yes');
      for (const exit of thenResult.exits) this.addEdge(exit, mergeId);
    } else {
      this.addEdge(decisionId, mergeId, 'yes');
    }

    if (elseResult?.entry) {
      this.addEdge(decisionId, elseResult.entry, 'no');
      for (const exit of elseResult.exits) this.addEdge(exit, mergeId);
    } else {
      this.addEdge(decisionId, mergeId, 'no');
    }

    return { entry: decisionId, exits: [mergeId] };
  }

  visitWhile(stmt: WhileStatement, x: number): BuildResult {
    const decisionId = this.addFlowNode('decision', this.compact(stmt.getExpression().getText()), x, this.nextY());

    const body = this.visitBranch(stmt.getStatement(), x - this.branchOffset);

    if (body.entry) {
      this.addEdge(decisionId, body.entry, 'yes');
      for (const exit of body.exits) {
        this.addEdge(exit, decisionId);
      }
    } else {
      this.addEdge(decisionId, decisionId, 'yes');
    }

    const afterId = this.addFlowNode('merge', '', x, this.nextY());
    this.addEdge(decisionId, afterId, 'no');

    return { entry: decisionId, exits: [afterId] };
  }

  visitFor(stmt: ForStatement, x: number): BuildResult {
    let firstEntry: string | undefined;

    const initializer = stmt.getInitializer();
    if (initializer) {
      firstEntry = this.addFlowNode('action', this.compact(initializer.getText()), x, this.nextY());
    }

    const decisionId = this.addFlowNode(
      'decision',
      this.compact(stmt.getCondition()?.getText() ?? 'for'),
      x,
      this.nextY()
    );

    if (firstEntry) {
      this.addEdge(firstEntry, decisionId);
    } else {
      firstEntry = decisionId;
    }

    const body = this.visitBranch(stmt.getStatement(), x - this.branchOffset);
    const incrementor = stmt.getIncrementor();

    let incrementId: string | undefined;
    if (incrementor) {
      incrementId = this.addFlowNode('action', this.compact(incrementor.getText()), x + this.branchOffset, this.nextY());
    }

    if (body.entry) {
      this.addEdge(decisionId, body.entry, 'yes');
      for (const exit of body.exits) {
        if (incrementId) this.addEdge(exit, incrementId);
        else this.addEdge(exit, decisionId);
      }
    } else {
      if (incrementId) this.addEdge(decisionId, incrementId, 'yes');
      else this.addEdge(decisionId, decisionId, 'yes');
    }

    if (incrementId) {
      this.addEdge(incrementId, decisionId);
    }

    const afterId = this.addFlowNode('merge', '', x, this.nextY());
    this.addEdge(decisionId, afterId, 'no');

    return { entry: firstEntry, exits: [afterId] };
  }

  visitBranch(node: MorphNode, x: number): BuildResult {
    if (MorphNode.isBlock(node)) {
      return this.visitStatements(node.getStatements(), x);
    }

    if (MorphNode.isStatement(node)) {
      return this.visitStatement(node, x);
    }

    return this.visitAction(node.getText(), x);
  }
}
