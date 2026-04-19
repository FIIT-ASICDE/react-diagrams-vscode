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
  ThrowStatement,
  TryStatement,
  WhileStatement,
} from 'ts-morph';
import { EdgeBranchData, GraphWriter } from '../graph-writer';
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

  private edgeMeta(branchSide: 'left' | 'right' | 'bottom', semanticKind: 'positive' | 'negative' | 'case' | 'default' | 'loop-back' | 'normal', extra?: Record<string, unknown>): EdgeBranchData {
    return {
      branchSide,
      semanticKind,
      ...extra,
    };
  }

  private createContinuation(label = 'Continue'): string {
    return this.writer.addFlowNode('action', label, {
      sourceText: '',
      nodeKind: 'continuation',
    });
  }

  private createContinuationFrom(sourceId: string, edgeLabel?: string, edgeData?: EdgeBranchData): string {
    const continuationId = this.createContinuation();
    this.writer.addEdge(sourceId, continuationId, edgeLabel, false, edgeData);
    return continuationId;
  }

  private createMergeForSources(sources: string[]): string | undefined {
    const uniqueSources = [...new Set(sources)].filter(Boolean);

    if (uniqueSources.length < 2) {
      return undefined;
    }

    const mergeId = this.writer.addFlowNode('merge', '');
    for (const source of uniqueSources) {
      this.writer.addEdge(source, mergeId);
    }
    return mergeId;
  }

  private resolveExitSources(sources: string[]): string[] {
    const uniqueSources = [...new Set(sources)].filter(Boolean);
    if (uniqueSources.length <= 1) {
      return uniqueSources;
    }

    const mergeId = this.createMergeForSources(uniqueSources);
    return mergeId ? [mergeId] : uniqueSources;
  }

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
      exits: entry ? [...new Set(pendingExits)] : [],
      endExits: [...new Set(endExits)],
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

    if (stmt.getKind() === SyntaxKind.ThrowStatement) {
      return this.visitThrow(stmt as ThrowStatement);
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
    const loopId = this.createLoopNode(
      compactLabel(callExpression.getExpression().getText()),
      callExpression.getText(),
    );

    const callbackBranch = getCallbackBranch(callExpression);
    const innerDecisionCount = callbackBranch ? countDecisionsInBranch(callbackBranch) : 0;
    const body = callbackBranch ? this.visitBranch(callbackBranch) : undefined;

    if (body?.entry) {
      this.writer.addEdge(loopId, body.entry, 'each', false, this.edgeMeta('right', 'positive'));
      this.connectLoopBackEdges(body.exits, loopId, innerDecisionCount);
      const exitId = this.createContinuationFrom(loopId, 'done', this.edgeMeta('left', 'negative'));
      return { entry: loopId, exits: [exitId], endExits: body.endExits };
    }

    this.writer.addEdge(loopId, loopId, 'each', true, this.edgeMeta('left', 'loop-back', { innerDecisionCount }));
    const exitId = this.createContinuationFrom(loopId, 'done', this.edgeMeta('left', 'negative'));
    return { entry: loopId, exits: [exitId], endExits: [] };
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

  visitThrow(stmt: ThrowStatement): BuildResult {
    const expressionText = stmt.getExpression()?.getText();
    const label = expressionText ? `throw ${expressionText}` : 'throw';
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
    const mergeSources: string[] = [];
    const endExits: string[] = [];

    if (thenResult.entry) {
      this.writer.addEdge(decisionId, thenResult.entry, 'yes', false, this.edgeMeta('right', 'positive'));
      mergeSources.push(...thenResult.exits);
      endExits.push(...thenResult.endExits);
    } else {
      mergeSources.push(this.createContinuationFrom(decisionId, 'yes', this.edgeMeta('right', 'positive')));
    }

    if (elseResult) {
      if (elseResult.entry) {
        this.writer.addEdge(decisionId, elseResult.entry, 'no', false, this.edgeMeta('left', 'negative'));
        mergeSources.push(...elseResult.exits);
        endExits.push(...elseResult.endExits);
      } else {
        mergeSources.push(this.createContinuationFrom(decisionId, 'no', this.edgeMeta('left', 'negative')));
      }
    } else {
      mergeSources.push(this.createContinuationFrom(decisionId, 'no', this.edgeMeta('left', 'negative')));
    }

    return {
      entry: decisionId,
      exits: this.resolveExitSources(mergeSources),
      endExits: [...new Set(endExits)],
    };
  }

  visitWhile(stmt: WhileStatement): BuildResult {
    return this.visitStandardLoop(
      this.createLoopNode(
        compactLabel(stmt.getExpression().getText()),
        stmt.getExpression().getText(),
      ),
      stmt.getStatement(),
      'yes',
      'no',
    );
  }

visitDoWhile(stmt: DoStatement): BuildResult {
  const loopId = this.createLoopNode(
    compactLabel(stmt.getExpression().getText()),
    stmt.getExpression().getText(),
  );

  const loopBranch = stmt.getStatement();
  const innerDecisionCount = countDecisionsInBranch(loopBranch);
  const body = this.visitBranch(loopBranch);

  if (!body.entry) {
    this.writer.addEdge(loopId, loopId, 'yes', true, this.edgeMeta('left', 'loop-back', { innerDecisionCount }));
    const exitId = this.createContinuationFrom(loopId, 'no', this.edgeMeta('left', 'negative'));
    return { entry: loopId, exits: [exitId], endExits: [] };
  }

  // body flows normally into condition
  for (const exit of body.exits) {
    this.writer.addEdge(exit, loopId, getFallthroughEdgeLabel(exit));
  }

  // only the successful condition branch is the real loop-back
  this.writer.addEdge(
    loopId,
    body.entry,
    'yes',
    true,
    this.edgeMeta('left', 'loop-back', { innerDecisionCount }),
  );

  const exitId = this.createContinuationFrom(loopId, 'no', this.edgeMeta('left', 'negative'));

  return {
    entry: body.entry,
    exits: [exitId],
    endExits: [...new Set(body.endExits)],
  };
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

  const loopId = this.createLoopNode(
    compactLabel(stmt.getCondition()?.getText() ?? 'for'),
    stmt.getCondition()?.getText() ?? 'for',
  );

  if (firstEntry) {
    this.writer.addEdge(firstEntry, loopId);
  } else {
    firstEntry = loopId;
  }

  const loopBranch = stmt.getStatement();
  const innerDecisionCount = countDecisionsInBranch(loopBranch);
  const body = this.visitBranch(loopBranch);
  const incrementor = stmt.getIncrementor();

  let incrementId: string | undefined;
  if (incrementor) {
    incrementId = this.writer.addFlowNode('action', compactLabel(incrementor.getText()), {
      sourceText: incrementor.getText(),
      nodeKind: 'action',
    });
  }

  // yes -> body (or increment if body is empty)
  if (body.entry) {
    this.writer.addEdge(loopId, body.entry, 'yes', false, this.edgeMeta('right', 'positive'));
  } else if (incrementId) {
    this.writer.addEdge(loopId, incrementId, 'yes', false, this.edgeMeta('right', 'positive'));
  } else {
    this.writer.addEdge(
      loopId,
      loopId,
      'yes',
      true,
      this.edgeMeta('left', 'loop-back', { innerDecisionCount }),
    );
  }

  // Make increment the linear tail of the body
  if (incrementId) {
    if (body.entry) {
      const uniqueBodyExits = [...new Set(body.exits)].filter(Boolean);
      for (const exit of uniqueBodyExits) {
        this.writer.addEdge(exit, incrementId, getFallthroughEdgeLabel(exit));
      }
    }

    this.writer.addEdge(
      incrementId,
      loopId,
      '',
      true,
      this.edgeMeta('left', 'loop-back', { innerDecisionCount }),
    );
  } else if (body.entry) {
    this.connectLoopBackEdges(body.exits, loopId, innerDecisionCount);
  }

  const exitId = this.createContinuationFrom(loopId, 'no', this.edgeMeta('left', 'negative'));

  return {
    entry: firstEntry,
    exits: [exitId],
    endExits: [...new Set(body.endExits)],
  };
}

  visitForOf(stmt: ForOfStatement): BuildResult {
    return this.visitIteratorLoop(stmt);
  }

  visitForIn(stmt: ForInStatement): BuildResult {
    return this.visitIteratorLoop(stmt);
  }

  visitTry(stmt: TryStatement): BuildResult {
    const decisionId = this.createDecisionNode('try', stmt.getText());
    const normalSources: string[] = [];
    const abruptSources: string[] = [];
    const endExits: string[] = [];

    const tryResult = this.visitBranch(stmt.getTryBlock());
    if (tryResult.entry) {
      this.writer.addEdge(decisionId, tryResult.entry, 'try', false, this.edgeMeta('right', 'positive'));
      normalSources.push(...tryResult.exits);
      abruptSources.push(...tryResult.endExits);
    } else {
      normalSources.push(this.createContinuationFrom(decisionId, 'try', this.edgeMeta('right', 'positive')));
    }

    const catchClause = stmt.getCatchClause();
    if (catchClause) {
      const catchResult = this.visitBranch(catchClause.getBlock());
      if (catchResult.entry) {
        this.writer.addEdge(decisionId, catchResult.entry, 'catch', false, this.edgeMeta('left', 'negative'));
        normalSources.push(...catchResult.exits);
        abruptSources.push(...catchResult.endExits);
      } else {
        normalSources.push(this.createContinuationFrom(decisionId, 'catch', this.edgeMeta('left', 'negative')));
      }
    }

    const finallyBlock = stmt.getFinallyBlock();
    if (!finallyBlock) {
      endExits.push(...abruptSources);
      return {
        entry: decisionId,
        exits: this.resolveExitSources(normalSources),
        endExits: [...new Set(endExits)],
      };
    }

    const combinedSources = [...new Set([...normalSources, ...abruptSources])];
    if (combinedSources.length === 0) {
      return { entry: decisionId, exits: [], endExits: [] };
    }

    const finallyResult = this.visitBranch(finallyBlock);
    if (!finallyResult.entry) {
      return {
        entry: decisionId,
        exits: this.resolveExitSources(normalSources),
        endExits: [...new Set([...abruptSources, ...endExits])],
      };
    }

    const finallyInput = this.resolveExitSources(combinedSources)[0];
    if (finallyInput) {
      this.writer.addEdge(finallyInput, finallyResult.entry);
    }

    const normalSet = new Set(normalSources);
    const abruptSet = new Set(abruptSources);

    for (const source of combinedSources) {
      if (source === finallyInput) continue;
      if (normalSet.has(source) || abruptSet.has(source)) {
        this.writer.addEdge(source, finallyResult.entry);
      }
    }

    const finallyNormalExits = finallyResult.exits;
    const finallyAbruptExits = finallyResult.endExits;

    return {
      entry: decisionId,
      exits: this.resolveExitSources(finallyNormalExits),
      endExits: [...new Set(finallyAbruptExits)],
    };
  }

  private containsBreakForCurrentSwitch(node: MorphNode): boolean {
    if (node.getKind() === SyntaxKind.BreakStatement) {
      return true;
    }

    if (
      MorphNode.isSwitchStatement(node) ||
      MorphNode.isForStatement(node) ||
      MorphNode.isForInStatement(node) ||
      MorphNode.isForOfStatement(node) ||
      MorphNode.isWhileStatement(node) ||
      MorphNode.isDoStatement(node)
    ) {
      return false;
    }

    for (const child of node.getChildren()) {
      if (this.containsBreakForCurrentSwitch(child)) {
        return true;
      }
    }

    return false;
  }

  private analyzeStatementsSemantics(statements: Statement[]): BuildResult {
    const scratchNodes: import('@xyflow/react').Node[] = [];
    const scratchEdges: import('@xyflow/react').Edge[] = [];
    const scratchVisitor = new StatementVisitor(new GraphWriter(scratchNodes, scratchEdges));
    return scratchVisitor.visitStatements(statements);
  }

  private formatSwitchGroupLabel(labels: string[]): string {
    const caseValues = labels
      .filter((label) => label !== 'default')
      .map((label) => label.replace(/^case\s+/i, ''));
    const hasDefault = labels.includes('default');

    if (caseValues.length === 0) {
      return 'default';
    }

    const caseLabel = `case: ${caseValues.join(' | ')}`;
    return hasDefault ? `default | ${caseLabel}` : caseLabel;
  }

  visitSwitch(stmt: SwitchStatement): BuildResult {
    interface SwitchCaseGroup {
      labels: string[];
      clauseStatements: Statement[];
      executableStatements: Statement[];
      hasBreak: boolean;
    }

    const expressionText = stmt.getExpression().getText();
    const decisionId = this.createDecisionNode(compactLabel(expressionText), expressionText);
    const clauses = stmt.getCaseBlock().getClauses();
    const groups: SwitchCaseGroup[] = [];
    let pendingLabels: string[] = [];

    for (const clause of clauses) {
      const caseClause = clause.asKind(SyntaxKind.CaseClause);
      const label = caseClause
        ? `case ${compactLabel(caseClause.getExpression().getText())}`
        : 'default';
      pendingLabels.push(label);

      const clauseStatements = clause.getStatements();
      const hasBreak = clauseStatements.some((statement) => this.containsBreakForCurrentSwitch(statement));
      const executableStatements = clauseStatements.filter(
        (statement) => statement.getKind() !== SyntaxKind.BreakStatement,
      );

      if (executableStatements.length > 0 || hasBreak) {
        groups.push({
          labels: pendingLabels,
          clauseStatements,
          executableStatements,
          hasBreak,
        });
        pendingLabels = [];
      }
    }

    const normalExitSources: string[] = [];
    const endExits: string[] = [];
    const directBreakBranches: Array<{ label: string; semanticKind: 'case' | 'default' }> = [];

    const mergeId = this.writer.addFlowNode('merge', '');

    for (const group of groups) {
      const isDefaultOnly = group.labels.every((label) => label === 'default');
      const semanticKind = isDefaultOnly ? 'default' as const : 'case' as const;
      const displayLabelBase = this.formatSwitchGroupLabel(group.labels);

      if (group.executableStatements.length === 0) {
        if (group.hasBreak) {
          directBreakBranches.push({ label: displayLabelBase, semanticKind });
        }
        continue;
      }

      const analysis = this.analyzeStatementsSemantics(group.executableStatements);
      const displayLabel = analysis.exits.length > 0 && !group.hasBreak
        ? `${displayLabelBase} (falls through)`
        : displayLabelBase;

      const caseNodeId = this.writer.addFlowNode('expandable', compactLabel(displayLabel), {
        sourceText: group.clauseStatements.map((statement) => statement.getText()).join('\n'),
        nodeKind: 'switch-case',
      });

      this.writer.addEdge(
        decisionId,
        caseNodeId,
        "",
        false,
        this.edgeMeta('bottom', semanticKind),
      );

      if (analysis.endExits.length > 0 && analysis.exits.length === 0) {
        endExits.push(caseNodeId);
      }

      if (analysis.exits.length > 0) {
        this.writer.addEdge(caseNodeId, mergeId);
        normalExitSources.push(caseNodeId);
      }
    }

    const normalPathCount = normalExitSources.length + directBreakBranches.length;
    if (normalPathCount === 0) {
      return {
        entry: decisionId,
        exits: [],
        endExits: [...new Set(endExits)],
      };
    }

    for (const branch of directBreakBranches) {
      this.writer.addEdge(
        decisionId,
        mergeId,
        "",
        false,
        this.edgeMeta('bottom', branch.semanticKind),
      );
    }

    return {
      entry: decisionId,
      exits: [mergeId],
      endExits: [...new Set(endExits)],
    };
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

  private createLoopNode(label: string, sourceText: string): string {
    return this.writer.addFlowNode('loop', label, {
      sourceText,
      nodeKind: 'loop',
    });
  }

  private connectLoopBackEdges(exits: string[], loopId: string, innerDecisionCount: number): void {
    const uniqueExits = [...new Set(exits)].filter((exit) => exit && exit !== loopId);

    for (const exit of uniqueExits) {
      this.writer.addEdge(
        exit,
        loopId,
        '',
        true,
        this.edgeMeta('left', 'loop-back', { innerDecisionCount }),
      );
    }
  }

  private visitStandardLoop(
    loopId: string,
    loopBranch: MorphNode,
    bodyLabel = 'yes',
    exitLabel = 'no',
  ): BuildResult {
    const innerDecisionCount = countDecisionsInBranch(loopBranch);
    const body = this.visitBranch(loopBranch);

    if (body.entry) {
      this.writer.addEdge(loopId, body.entry, bodyLabel, false, this.edgeMeta('right', 'positive'));
      this.connectLoopBackEdges(body.exits, loopId, innerDecisionCount);
    } else {
      this.writer.addEdge(loopId, loopId, bodyLabel, true, this.edgeMeta('left', 'loop-back', { innerDecisionCount }));
    }

    const exitId = this.createContinuationFrom(loopId, exitLabel, this.edgeMeta('left', 'negative'));
    return {
      entry: loopId,
      exits: [exitId],
      endExits: [...new Set(body.endExits)],
    };
  }

  private visitIteratorLoop(stmt: ForOfStatement | ForInStatement): BuildResult {
    return this.visitStandardLoop(
      this.createLoopNode(
        compactLabel(stmt.getExpression().getText()),
        stmt.getExpression().getText(),
      ),
      stmt.getStatement(),
      'each',
      'done',
    );
  }
}