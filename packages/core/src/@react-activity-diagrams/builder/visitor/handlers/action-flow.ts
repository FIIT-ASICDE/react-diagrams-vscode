import {
  CallExpression,
  ExpressionStatement,
  Node as MorphNode,
  ReturnStatement,
  ThrowStatement,
} from 'ts-morph';
import { getCallbackBranch, isForEachLikeCall } from '../metadata';
import type { BuildResult, HookMeta } from '../types';
import { compactLabel, countDecisionsInBranch } from '../utils';
import type { StatementVisitorHost } from './host-context';

export function visitHook(host: StatementVisitorHost, hookMeta: HookMeta): BuildResult {
  const bodyId = host.writer.addFlowNode('expandable', compactLabel(hookMeta.label), {
    sourceText: hookMeta.sourceText,
    nodeKind: 'function',
    deps: hookMeta.dependencyText,
  });

  return { entry: bodyId, exits: [bodyId], endExits: [] };
}

export function visitExpressionStatement(host: StatementVisitorHost, stmt: ExpressionStatement): BuildResult {
  const expression = stmt.getExpression();

  if (MorphNode.isCallExpression(expression) && isForEachLikeCall(expression)) {
    return visitForEachLike(host, expression);
  }

  return visitAction(host, expression.getText(), stmt.getText());
}

export function visitForEachLike(host: StatementVisitorHost, callExpression: CallExpression): BuildResult {
  const loopId = host.createLoopNode(
    compactLabel(callExpression.getExpression().getText()),
    callExpression.getText(),
  );

  const callbackBranch = getCallbackBranch(callExpression);
  const innerDecisionCount = callbackBranch ? countDecisionsInBranch(callbackBranch) : 0;
  const body = callbackBranch ? host.visitBranch(callbackBranch) : undefined;

  if (body?.entry) {
    host.writer.addEdge(loopId, body.entry, 'each', false, host.edgeMeta('right', 'positive'));
    host.connectLoopBackEdges(body.exits, loopId, innerDecisionCount);
    const exitId = host.createContinuationFrom(loopId, 'done', host.edgeMeta('left', 'negative'));
    return { entry: loopId, exits: [exitId], endExits: body.endExits };
  }

  host.writer.addEdge(
    loopId,
    loopId,
    'each',
    true,
    host.edgeMeta('left', 'loop-back', { innerDecisionCount }),
  );
  const exitId = host.createContinuationFrom(loopId, 'done', host.edgeMeta('left', 'negative'));
  return { entry: loopId, exits: [exitId], endExits: [] };
}

export function visitAction(host: StatementVisitorHost, label: string, sourceText?: string): BuildResult {
  const id = host.writer.addFlowNode('action', compactLabel(label), {
    sourceText,
    nodeKind: 'action',
  });
  return { entry: id, exits: [id], endExits: [] };
}

export function visitReturn(host: StatementVisitorHost, stmt: ReturnStatement): BuildResult {
  const expressionText = stmt.getExpression()?.getText();
  const label = expressionText ? `return ${expressionText}` : 'return';
  const id = host.writer.addFlowNode('action', compactLabel(label), {
    sourceText: stmt.getText(),
    nodeKind: 'action',
  });

  return { entry: id, exits: [id], endExits: [] };
}

export function visitThrow(host: StatementVisitorHost, stmt: ThrowStatement): BuildResult {
  const expressionText = stmt.getExpression()?.getText();
  const label = expressionText ? `throw ${expressionText}` : 'throw';
  const id = host.writer.addFlowNode('action', compactLabel(label), {
    sourceText: stmt.getText(),
    nodeKind: 'action',
  });

  return { entry: id, exits: [id], endExits: [] };
}