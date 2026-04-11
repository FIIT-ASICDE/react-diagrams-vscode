import {
  Statement,
  Node as MorphNode,
  SyntaxKind,
  IfStatement,
  WhileStatement,
  ForStatement,
  ForInStatement,
  ForOfStatement,
  TryStatement,
  SwitchStatement,
  ExpressionStatement,
  VariableStatement,
  Block,
} from 'ts-morph';
import { GraphWriter } from './graph-writer';

export type BuildResult = {
  entry?: string;
  exits: string[];
};

export class StatementVisitor {
  constructor(private writer: GraphWriter) {}

  private getExpandableMeta(stmt: Statement): { label: string; nodeKind: 'function' | 'class' | 'interface' | 'type' } | undefined {
    if (stmt.getKind() === SyntaxKind.FunctionDeclaration) {
      const name = stmt.asKind(SyntaxKind.FunctionDeclaration)?.getName() ?? 'anonymous';
      return { label: `function ${name}()`, nodeKind: 'function' };
    }

    if (stmt.getKind() === SyntaxKind.ClassDeclaration) {
      const name = stmt.asKind(SyntaxKind.ClassDeclaration)?.getName() ?? 'anonymous';
      return { label: `class ${name}`, nodeKind: 'class' };
    }

    if (stmt.getKind() === SyntaxKind.VariableStatement) {
      const variableStmt = stmt as VariableStatement;
      for (const declaration of variableStmt.getDeclarations()) {
        const initializer = declaration.getInitializer();
        if (!initializer) {
          continue;
        }

        const hasFunctionInitializer =
          initializer.getKind() === SyntaxKind.ArrowFunction ||
          initializer.getKind() === SyntaxKind.FunctionExpression ||
          initializer.getDescendantsOfKind(SyntaxKind.ArrowFunction).length > 0 ||
          initializer.getDescendantsOfKind(SyntaxKind.FunctionExpression).length > 0;
        const hasClassInitializer =
          initializer.getKind() === SyntaxKind.ClassExpression ||
          initializer.getDescendantsOfKind(SyntaxKind.ClassExpression).length > 0;

        if (hasFunctionInitializer) {
          const name = declaration.getName() ?? 'anonymous';
          return { label: `function ${name}()`, nodeKind: 'function' };
        }

        if (hasClassInitializer) {
          const name = declaration.getName() ?? 'anonymous';
          return { label: `class ${name}`, nodeKind: 'class' };
        }
      }
    }

    return undefined;
  }

  private compact(text: string): string {
    const cleaned = text.replace(/\s+/g, ' ').trim();
    return cleaned.length > 40 ? `${cleaned.slice(0, 37)}...` : cleaned;
  }

  private isDecisionKind(kind: SyntaxKind): boolean {
    return (
      kind === SyntaxKind.IfStatement ||
      kind === SyntaxKind.WhileStatement ||
      kind === SyntaxKind.ForStatement ||
      kind === SyntaxKind.ForInStatement ||
      kind === SyntaxKind.ForOfStatement ||
      kind === SyntaxKind.TryStatement ||
      kind === SyntaxKind.SwitchStatement
    );
  }

  private countDecisionsInBranch(node: MorphNode): number {
    const isDecisionNode = (candidate: MorphNode) => this.isDecisionKind(candidate.getKind());
    const decisions: MorphNode[] = [];

    if (isDecisionNode(node)) {
      decisions.push(node);
    }

    decisions.push(...node.getDescendants().filter(isDecisionNode));

    let maxDepth = 0;

    for (const decision of decisions) {
      let depth = 0;
      let current: MorphNode | undefined = decision;

      while (current && current !== node) {
        if (isDecisionNode(current)) {
          depth += 1;
        }
        current = current.getParent();
      }

      if (current === node && isDecisionNode(current)) {
        depth += 1;
      }

      if (depth > maxDepth) {
        maxDepth = depth;
      }
    }

    return maxDepth;
  }

  visitStatements(statements: Statement[]): BuildResult {
    let entry: string | undefined;
    let pendingExits: string[] = [];

    for (let i = 0; i < statements.length; i++) {
      if (statements[i].getKind() === SyntaxKind.ImportDeclaration) {
        continue;
      }

      const result = this.visitStatement(statements[i]);

      if (!result.entry) continue;

      if (!entry) {
        entry = result.entry;
      }

      for (const exit of pendingExits) {
        this.writer.addEdge(exit, result.entry);
      }

      pendingExits = result.exits;
    }

    return {
      entry,
      exits: entry ? pendingExits.length ? pendingExits : [] : [],
    };
  }

  visitStatement(stmt: Statement): BuildResult {
    const expandableMeta = this.getExpandableMeta(stmt);
    if (expandableMeta) {
      const id = this.writer.addFlowNode('expandable', this.compact(expandableMeta.label), {
        sourceText: stmt.getText(),
        nodeKind: expandableMeta.nodeKind,
      });
      return { entry: id, exits: [id] };
    }

    if (stmt.getKind() === SyntaxKind.ExpressionStatement) {
      return this.visitAction((stmt as ExpressionStatement).getExpression().getText(), stmt.getText());
    }
    if (stmt.getKind() === SyntaxKind.ReturnStatement) {
      const id = this.writer.addFlowNode('action', this.compact(stmt.getText()), {
        sourceText: stmt.getText(),
        nodeKind: 'return',
      });
      return { entry: id, exits: [id] };
    }

    if (stmt.getKind() === SyntaxKind.IfStatement) {
      return this.visitIf(stmt as IfStatement);
    }

    if (stmt.getKind() === SyntaxKind.WhileStatement) {
      return this.visitWhile(stmt as WhileStatement);
    }

    if (stmt.getKind() === SyntaxKind.ForStatement) {
      return this.visitFor(stmt as ForStatement);
    }

    if (stmt.getKind() === SyntaxKind.ForOfStatement) {
      return this.visitForOf(stmt as ForOfStatement);
    }

    if (stmt.getKind() === SyntaxKind.ForInStatement) {
      return this.visitForIn(stmt as ForInStatement);
    }

    if (stmt.getKind() === SyntaxKind.TryStatement) {
      return this.visitTry(stmt as TryStatement);
    }

    if (stmt.getKind() === SyntaxKind.SwitchStatement) {
      return this.visitSwitch(stmt as SwitchStatement);
    }

    if (stmt.getKind() === SyntaxKind.Block) {
      return this.visitStatements((stmt as Block).getStatements());
    }

    return this.visitAction(this.compact(stmt.getText()), stmt.getText());
  }

  visitAction(label: string, sourceText?: string): BuildResult {
    const id = this.writer.addFlowNode('action', this.compact(label), {
      sourceText,
      nodeKind: 'action',
    });
    return { entry: id, exits: [id] };
  }

  visitIf(stmt: IfStatement): BuildResult {
    const elseStmt = stmt.getElseStatement();
    const decisionId = this.writer.addFlowNode('decision', this.compact(stmt.getExpression().getText()), {
      sourceText: stmt.getExpression().getText(),
      nodeKind: 'decision',
    });

    const thenResult = this.visitBranch(stmt.getThenStatement());
    const elseResult = elseStmt
      ? this.visitBranch(elseStmt)
      : undefined;

    const mergeId = this.writer.addFlowNode('merge', '');

    if (thenResult.entry) {
      this.writer.addEdge(decisionId, thenResult.entry, 'yes');
      for (const exit of thenResult.exits) this.writer.addEdge(exit, mergeId);
    } else {
      this.writer.addEdge(decisionId, mergeId, 'yes');
    }

    if (elseResult?.entry) {
      this.writer.addEdge(decisionId, elseResult.entry, 'no');
      for (const exit of elseResult.exits) this.writer.addEdge(exit, mergeId);
    } else {
      this.writer.addEdge(decisionId, mergeId, 'no');
    }

    return { entry: decisionId, exits: [mergeId] };
  }

  visitWhile(stmt: WhileStatement): BuildResult {
    const decisionId = this.writer.addFlowNode('decision', this.compact(stmt.getExpression().getText()), {
      sourceText: stmt.getExpression().getText(),
      nodeKind: 'decision',
    });

    const loopBranch = stmt.getStatement();
    const innerDecisionCount = this.countDecisionsInBranch(loopBranch);
    const body = this.visitBranch(loopBranch);

    if (body.entry) {
      this.writer.addEdge(decisionId, body.entry, 'yes');
      for (const exit of body.exits) {
        this.writer.addEdge(exit, decisionId, '', 'dashed', { innerDecisionCount });
      }
    } else {
      this.writer.addEdge(decisionId, decisionId, 'yes', 'dashed', { innerDecisionCount });
    }

    const afterId = this.writer.addFlowNode('merge', '');
    this.writer.addEdge(decisionId, afterId, 'no');

    return { entry: decisionId, exits: [afterId] };
  }

  visitFor(stmt: ForStatement): BuildResult {
    let firstEntry: string | undefined;

    const initializer = stmt.getInitializer();
    if (initializer) {
      firstEntry = this.writer.addFlowNode('action', this.compact(initializer.getText()), {
        sourceText: stmt.getText(),
        nodeKind: 'action',
      });
    }

    const decisionId = this.writer.addFlowNode(
      'decision',
      this.compact(stmt.getCondition()?.getText() ?? 'for'),
      {
        sourceText: stmt.getCondition()?.getText() ?? 'for',
        nodeKind: 'decision',
      },
    );

    if (firstEntry) {
      this.writer.addEdge(firstEntry, decisionId);
    } else {
      firstEntry = decisionId;
    }

    const loopBranch = stmt.getStatement();
    const innerDecisionCount = this.countDecisionsInBranch(loopBranch);
    const body = this.visitBranch(loopBranch);
    const incrementor = stmt.getIncrementor();

    let incrementId: string | undefined;
    if (incrementor) {
      incrementId = this.writer.addFlowNode('action', this.compact(incrementor.getText()), {
        sourceText: stmt.getText(),
        nodeKind: 'action',
      });
    }

    if (body.entry) {
      this.writer.addEdge(decisionId, body.entry, 'yes');
      for (const exit of body.exits) {
        if (incrementId) this.writer.addEdge(exit, incrementId);
        else this.writer.addEdge(exit, decisionId, '', 'dashed', { innerDecisionCount });
      }
    } else {
      if (incrementId) this.writer.addEdge(decisionId, incrementId, 'yes');
      else this.writer.addEdge(decisionId, decisionId, 'yes', 'dashed', { innerDecisionCount });
    }

    if (incrementId) {
      this.writer.addEdge(incrementId, decisionId, '', 'dashed', { innerDecisionCount });
    }

    const afterId = this.writer.addFlowNode('merge', '');
    this.writer.addEdge(decisionId, afterId, 'no');

    return { entry: firstEntry, exits: [afterId] };
  }

  visitForOf(stmt: ForOfStatement): BuildResult {
    const decisionId = this.writer.addFlowNode(
      'decision',
      this.compact(stmt.getExpression().getText()),
      {
        sourceText: stmt.getExpression().getText(),
        nodeKind: 'decision',
      },
    );

    const loopBranch = stmt.getStatement();
    const innerDecisionCount = this.countDecisionsInBranch(loopBranch);
    const body = this.visitBranch(loopBranch);

    if (body.entry) {
      this.writer.addEdge(decisionId, body.entry, 'yes');
      for (const exit of body.exits) {
        this.writer.addEdge(exit, decisionId, '', 'dashed', { innerDecisionCount });
      }
    } else {
      this.writer.addEdge(decisionId, decisionId, 'yes', 'dashed', { innerDecisionCount });
    }

    const afterId = this.writer.addFlowNode('merge', '');
    this.writer.addEdge(decisionId, afterId, 'no');

    return { entry: decisionId, exits: [afterId] };
  }

  visitForIn(stmt: ForInStatement): BuildResult {
    const decisionId = this.writer.addFlowNode(
      'decision',
      this.compact(stmt.getExpression().getText()),
      {
        sourceText: stmt.getExpression().getText(),
        nodeKind: 'decision',
      },
    );

    const loopBranch = stmt.getStatement();
    const innerDecisionCount = this.countDecisionsInBranch(loopBranch);
    const body = this.visitBranch(loopBranch);

    if (body.entry) {
      this.writer.addEdge(decisionId, body.entry, 'yes');
      for (const exit of body.exits) {
        this.writer.addEdge(exit, decisionId, '', 'dashed', { innerDecisionCount });
      }
    } else {
      this.writer.addEdge(decisionId, decisionId, 'yes', 'dashed', { innerDecisionCount });
    }

    const afterId = this.writer.addFlowNode('merge', '');
    this.writer.addEdge(decisionId, afterId, 'no');

    return { entry: decisionId, exits: [afterId] };
  }

  visitTry(stmt: TryStatement): BuildResult {
    const decisionId = this.writer.addFlowNode('decision', 'try', {
      sourceText: stmt.getText(),
      nodeKind: 'decision',
    });

    const mergeId = this.writer.addFlowNode('merge', '');
    const finallyBlock = stmt.getFinallyBlock();
    const finallyResult = finallyBlock ? this.visitBranch(finallyBlock) : undefined;
    const finalTarget = finallyResult?.entry ?? mergeId;

    const tryResult = this.visitBranch(stmt.getTryBlock());
    if (tryResult.entry) {
      this.writer.addEdge(decisionId, tryResult.entry, 'try');
      for (const exit of tryResult.exits) {
        this.writer.addEdge(exit, finalTarget);
      }
    } else {
      this.writer.addEdge(decisionId, finalTarget, 'try');
    }

    const catchClause = stmt.getCatchClause();
    if (catchClause) {
      const catchResult = this.visitBranch(catchClause.getBlock());
      if (catchResult.entry) {
        this.writer.addEdge(decisionId, catchResult.entry, 'catch');
        for (const exit of catchResult.exits) {
          this.writer.addEdge(exit, finalTarget);
        }
      } else {
        this.writer.addEdge(decisionId, finalTarget, 'catch');
      }
    }

    if (finallyResult?.entry) {
      for (const exit of finallyResult.exits) {
        this.writer.addEdge(exit, mergeId);
      }
    }

    return { entry: decisionId, exits: [mergeId] };
  }

  visitSwitch(stmt: SwitchStatement): BuildResult {
    const expressionText = stmt.getExpression().getText();
    const decisionId = this.writer.addFlowNode('decision', this.compact(expressionText), {
      sourceText: expressionText,
      nodeKind: 'decision',
    });

    const mergeId = this.writer.addFlowNode('merge', '');
    const clauses = stmt.getCaseBlock().getClauses();
    let pendingLabels: string[] = [];

    for (const clause of clauses) {
      const caseClause = clause.asKind(SyntaxKind.CaseClause);
      const label = caseClause
        ? `case ${this.compact(caseClause.getExpression().getText())}`
        : 'default';

      pendingLabels.push(label);

      const statements = clause.getStatements();
      if (statements.length === 0) {
        continue;
      }

      const body = this.visitStatements(statements);

      if (body.entry) {
        for (const branchLabel of pendingLabels) {
          this.writer.addEdge(decisionId, body.entry, branchLabel);
        }

        for (const exit of body.exits) {
          this.writer.addEdge(exit, mergeId);
        }
      } else {
        for (const branchLabel of pendingLabels) {
          this.writer.addEdge(decisionId, mergeId, branchLabel);
        }
      }

      pendingLabels = [];
    }

    for (const branchLabel of pendingLabels) {
      this.writer.addEdge(decisionId, mergeId, branchLabel);
    }

    return { entry: decisionId, exits: [mergeId] };
  }

  visitBranch(node: MorphNode): BuildResult {
    if (MorphNode.isBlock(node)) {
      return this.visitStatements(node.getStatements());
    }

    if (MorphNode.isStatement(node)) {
      return this.visitStatement(node);
    }

    return this.visitAction(node.getText());
  }
}
