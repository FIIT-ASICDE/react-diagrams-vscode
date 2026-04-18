import {
  Block,
  CallExpression,
  DoStatement,
  ExpressionStatement,
  ForInStatement,
  ForOfStatement,
  ForStatement,
  IfStatement,
  Node as MorphNode,
  ReturnStatement,
  Statement,
  SwitchStatement,
  SyntaxKind,
  TryStatement,
  WhileStatement,
} from 'ts-morph';
import { GraphWriter } from '../graph-writer';
import {
  getCallbackBranch,
  getExpandableMeta,
  getHookMeta,
  isForEachLikeCall,
} from './metadata';
import type { BuildResult, HookMeta } from './types';
import {
  compactLabel,
  countDecisionsInBranch,
  getFallthroughEdgeLabel,
} from './utils';

export class StatementVisitor {
  constructor(private writer: GraphWriter) {}

  visitStatements(statements: Statement[]): BuildResult {
    let entry: string | undefined;
    let pendingExits: string[] = [];
    const endExits: string[] = [];

    for (let index = 0; index < statements.length; index += 1) {
      if (statements[index].getKind() === SyntaxKind.ImportDeclaration) {
        continue;
      }

      const result = this.visitStatement(statements[index]);
      if (!result.entry) {
        continue;
      }

      if (!entry) {
        entry = result.entry;
      }

      for (const exit of pendingExits) {
        this.writer.addEdge(exit, result.entry, getFallthroughEdgeLabel(exit));
      }

      pendingExits = result.exits;
      endExits.push(...result.endExits);
    }

    return {
      entry,
      exits: entry ? pendingExits : [],
      endExits,
    };
  }

  visitStatement(stmt: Statement): BuildResult {
    const hookMeta = getHookMeta(stmt);
    if (hookMeta) {
      return this.visitHook(hookMeta);
    }

    const expandableMeta = getExpandableMeta(stmt);
    if (expandableMeta) {
      const id = this.writer.addFlowNode('expandable', compactLabel(expandableMeta.label), {
        sourceText: expandableMeta.sourceText ?? stmt.getText(),
        nodeKind: expandableMeta.nodeKind,
      });
      return { entry: id, exits: [id], endExits: [] };
    }

    if (stmt.getKind() === SyntaxKind.ExpressionStatement) {
      const expressionStatement = stmt as ExpressionStatement;
      const expression = expressionStatement.getExpression();

      if (MorphNode.isCallExpression(expression) && isForEachLikeCall(expression)) {
        return this.visitForEachLike(expression);
      }

      return this.visitAction(expression.getText(), stmt.getText());
    }

    if (stmt.getKind() === SyntaxKind.IfStatement) {
      return this.visitIf(stmt as IfStatement);
    }

    if (stmt.getKind() === SyntaxKind.WhileStatement) {
      return this.visitWhile(stmt as WhileStatement);
    }

    if (stmt.getKind() === SyntaxKind.DoStatement) {
      return this.visitDoWhile(stmt as DoStatement);
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

    if (stmt.getKind() === SyntaxKind.ReturnStatement) {
      return this.visitReturn(stmt as ReturnStatement);
    }

    if (stmt.getKind() === SyntaxKind.Block) {
      return this.visitStatements((stmt as Block).getStatements());
    }

    return this.visitAction(compactLabel(stmt.getText()), stmt.getText());
  }

  visitHook(hookMeta: HookMeta): BuildResult {
    const bodyId = this.writer.addFlowNode('expandable', compactLabel(hookMeta.label), {
      sourceText: hookMeta.sourceText,
      nodeKind: 'function',
      deps: hookMeta.dependencyText,
    });

    return { entry: bodyId, exits: [bodyId], endExits: [] };
  }

  visitForEachLike(callExpression: CallExpression): BuildResult {
    const decisionId = this.createDecisionNode(
      compactLabel(callExpression.getExpression().getText()),
      callExpression.getText(),
    );

    const callbackBranch = getCallbackBranch(callExpression);
    const innerDecisionCount = callbackBranch ? countDecisionsInBranch(callbackBranch) : 0;
    const body = callbackBranch ? this.visitBranch(callbackBranch) : undefined;

    if (body?.entry) {
      this.writer.addEdge(decisionId, body.entry, 'each');
      this.connectLoopBackEdges(body.exits, decisionId, innerDecisionCount);
    } else {
      this.writer.addEdge(decisionId, decisionId, 'each', true, { innerDecisionCount });
    }

    return { entry: decisionId, exits: [decisionId], endExits: [] };
  }

  visitAction(label: string, sourceText?: string): BuildResult {
    const id = this.writer.addFlowNode('action', compactLabel(label), {
      sourceText,
      nodeKind: 'action',
    });
    return { entry: id, exits: [id], endExits: [] };
  }

  visitReturn(stmt: ReturnStatement): BuildResult {
    const expressionText = stmt.getExpression()?.getText();
    const label = expressionText ? `return ${expressionText}` : 'return';
    const id = this.writer.addFlowNode('action', compactLabel(label), {
      sourceText: stmt.getText(),
      nodeKind: 'action',
    });

    return { entry: id, exits: [], endExits: [id] };
  }

  visitIf(stmt: IfStatement): BuildResult {
    const elseStmt = stmt.getElseStatement();
    const decisionId = this.createDecisionNode(
      compactLabel(stmt.getExpression().getText()),
      stmt.getExpression().getText(),
    );

    const thenResult = this.visitBranch(stmt.getThenStatement());
    const elseResult = elseStmt ? this.visitBranch(elseStmt) : undefined;
    const mergeId = this.writer.addFlowNode('merge', '');
    const endExits: string[] = [];

    if (thenResult.entry) {
      this.writer.addEdge(decisionId, thenResult.entry, 'yes');
      for (const exit of thenResult.exits) {
        this.writer.addEdge(exit, mergeId);
      }
      endExits.push(...thenResult.endExits);
    } else {
      this.writer.addEdge(decisionId, mergeId, 'yes');
    }

    if (elseResult?.entry) {
      this.writer.addEdge(decisionId, elseResult.entry, 'no');
      for (const exit of elseResult.exits) {
        this.writer.addEdge(exit, mergeId);
      }
      endExits.push(...elseResult.endExits);
    } else {
      this.writer.addEdge(decisionId, mergeId, 'no');
    }

    return { entry: decisionId, exits: [mergeId], endExits };
  }

  visitWhile(stmt: WhileStatement): BuildResult {
    return this.visitStandardLoop(
      this.createDecisionNode(
        compactLabel(stmt.getExpression().getText()),
        stmt.getExpression().getText(),
      ),
      stmt.getStatement(),
    );
  }

  visitDoWhile(stmt: DoStatement): BuildResult {
    const decisionId = this.createDecisionNode(
      compactLabel(stmt.getExpression().getText()),
      stmt.getExpression().getText(),
    );

    const loopBranch = stmt.getStatement();
    const innerDecisionCount = countDecisionsInBranch(loopBranch);
    const body = this.visitBranch(loopBranch);

    if (body.entry) {
      for (const exit of body.exits) {
        this.writer.addEdge(exit, decisionId);
      }

      this.writer.addEdge(decisionId, body.entry, 'yes', true, { innerDecisionCount });
      return { entry: body.entry, exits: [decisionId], endExits: body.endExits };
    }

    this.writer.addEdge(decisionId, decisionId, 'yes', true, { innerDecisionCount });
    return { entry: decisionId, exits: [decisionId], endExits: [] };
  }

  visitFor(stmt: ForStatement): BuildResult {
    let firstEntry: string | undefined;

    const initializer = stmt.getInitializer();
    if (initializer) {
      firstEntry = this.writer.addFlowNode('action', compactLabel(initializer.getText()), {
        sourceText: stmt.getText(),
        nodeKind: 'action',
      });
    }

    const decisionId = this.createDecisionNode(
      compactLabel(stmt.getCondition()?.getText() ?? 'for'),
      stmt.getCondition()?.getText() ?? 'for',
    );

    if (firstEntry) {
      this.writer.addEdge(firstEntry, decisionId);
    } else {
      firstEntry = decisionId;
    }

    const loopBranch = stmt.getStatement();
    const innerDecisionCount = countDecisionsInBranch(loopBranch);
    const body = this.visitBranch(loopBranch);
    const incrementor = stmt.getIncrementor();

    let incrementId: string | undefined;
    if (incrementor) {
      incrementId = this.writer.addFlowNode('action', compactLabel(incrementor.getText()), {
        sourceText: stmt.getText(),
        nodeKind: 'action',
      });
    }

    if (body.entry) {
      this.writer.addEdge(decisionId, body.entry, 'yes');
      for (const exit of body.exits) {
        if (incrementId) {
          this.writer.addEdge(exit, incrementId, getFallthroughEdgeLabel(exit));
        } else {
          this.writer.addEdge(exit, decisionId, '', true, { innerDecisionCount });
        }
      }
    } else if (incrementId) {
      this.writer.addEdge(decisionId, incrementId, 'yes');
    } else {
      this.writer.addEdge(decisionId, decisionId, 'yes', true, { innerDecisionCount });
    }

    if (incrementId) {
      this.writer.addEdge(incrementId, decisionId, '', true, { innerDecisionCount });
    }

    return { entry: firstEntry, exits: [decisionId], endExits: body.endExits };
  }

  visitForOf(stmt: ForOfStatement): BuildResult {
    return this.visitIteratorLoop(stmt);
  }

  visitForIn(stmt: ForInStatement): BuildResult {
    return this.visitIteratorLoop(stmt);
  }

  visitTry(stmt: TryStatement): BuildResult {
    const decisionId = this.createDecisionNode('try', stmt.getText());
    const mergeId = this.writer.addFlowNode('merge', '');
    const finallyBlock = stmt.getFinallyBlock();
    const finallyResult = finallyBlock ? this.visitBranch(finallyBlock) : undefined;
    const finalTarget = finallyResult?.entry ?? mergeId;
    const endExits: string[] = [];

    const tryResult = this.visitBranch(stmt.getTryBlock());
    if (tryResult.entry) {
      this.writer.addEdge(decisionId, tryResult.entry, 'try');
      for (const exit of tryResult.exits) {
        this.writer.addEdge(exit, finalTarget);
      }
      endExits.push(...tryResult.endExits);
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
        endExits.push(...catchResult.endExits);
      } else {
        this.writer.addEdge(decisionId, finalTarget, 'catch');
      }
    }

    if (finallyResult?.entry) {
      for (const exit of finallyResult.exits) {
        this.writer.addEdge(exit, mergeId);
      }

      if (finallyResult.endExits.length > 0) {
        return { entry: decisionId, exits: [mergeId], endExits: finallyResult.endExits };
      }
    }

    return { entry: decisionId, exits: [mergeId], endExits };
  }

  visitSwitch(stmt: SwitchStatement): BuildResult {
    const expressionText = stmt.getExpression().getText();
    const decisionId = this.createDecisionNode(compactLabel(expressionText), expressionText);
    const mergeId = this.writer.addFlowNode('merge', '');
    const clauses = stmt.getCaseBlock().getClauses();
    let pendingLabels: string[] = [];
    const endExits: string[] = [];

    for (const clause of clauses) {
      const caseClause = clause.asKind(SyntaxKind.CaseClause);
      const label = caseClause
        ? `case ${compactLabel(caseClause.getExpression().getText())}`
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
        endExits.push(...body.endExits);
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

    return { entry: decisionId, exits: [mergeId], endExits };
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

  private createDecisionNode(label: string, sourceText: string): string {
    return this.writer.addFlowNode('decision', label, {
      sourceText,
      nodeKind: 'decision',
    });
  }

  private connectLoopBackEdges(exits: string[], decisionId: string, innerDecisionCount: number): void {
    for (const exit of exits) {
      this.writer.addEdge(exit, decisionId, '', true, { innerDecisionCount });
    }
  }

  private visitStandardLoop(decisionId: string, loopBranch: MorphNode): BuildResult {
    const innerDecisionCount = countDecisionsInBranch(loopBranch);
    const body = this.visitBranch(loopBranch);

    if (body.entry) {
      this.writer.addEdge(decisionId, body.entry, 'yes');
      this.connectLoopBackEdges(body.exits, decisionId, innerDecisionCount);
    } else {
      this.writer.addEdge(decisionId, decisionId, 'yes', true, { innerDecisionCount });
    }

    return { entry: decisionId, exits: [decisionId], endExits: body.endExits };
  }

  private visitIteratorLoop(stmt: ForOfStatement | ForInStatement): BuildResult {
    return this.visitStandardLoop(
      this.createDecisionNode(
        compactLabel(stmt.getExpression().getText()),
        stmt.getExpression().getText(),
      ),
      stmt.getStatement(),
    );
  }
}
