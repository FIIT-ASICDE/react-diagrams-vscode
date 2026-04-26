import {
  ArrowFunction,
  CallExpression,
  ExpressionStatement,
  FunctionExpression,
  Node as MorphNode,
  PropertyAccessExpression,
  ReturnStatement,
  SyntaxKind,
  ThrowStatement,
} from 'ts-morph';
import { getCallbackBranch, isForEachLikeCall } from '../metadata';
import type { BuildResult, HookMeta } from '../types';
import { compactLabel, countDecisionsInBranch } from '../utils';
import type { StatementVisitorHost } from './host-context';

function setNodeData(host: StatementVisitorHost, nodeId: string, extra: Record<string, unknown>): void {
  const node = (host.writer as unknown as { nodes?: import('@xyflow/react').Node[] }).nodes?.find?.(
    (candidate) => candidate.id === nodeId,
  );
  if (!node) return;
  node.data = { ...(node.data ?? {}), ...extra };
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function visitHook(host: StatementVisitorHost, hookMeta: HookMeta): BuildResult {
  const bodyId = host.writer.addFlowNode('expandable', compactLabel(hookMeta.label), {
    sourceText: hookMeta.sourceText,
    construct: 'hook',
    deps: hookMeta.dependencyText,
  });

  return { entry: bodyId, exits: [bodyId], endExits: [] };
}

// ── Expression statements (incl. forEach detection) ───────────────────────

export function visitExpressionStatement(host: StatementVisitorHost, stmt: ExpressionStatement): BuildResult {
  const expression = stmt.getExpression();

  if (MorphNode.isCallExpression(expression) && isForEachLikeCall(expression)) {
    return visitForEachLike(host, expression);
  }

  return visitAction(host, expression.getText(), stmt.getText());
}

// ── ForEach-like calls ─────────────────────────────────────────────────────

/**
 * Extract the metadata bits we need to reconstruct a forEach-like call
 * later in CodeGen. Returns sensible fallbacks when the AST shape isn't
 * what we expected (chained calls, computed property access, callbacks
 * that aren't inline functions, etc.) — those still get a loop node, just
 * with less faithful re-emission.
 */
function extractForEachMeta(callExpression: CallExpression): {
  iterable: string;
  callee: string;
  params: string;
} {
  const calleeExpression = callExpression.getExpression();

  let iterable = '';
  let callee = 'forEach';

  if (calleeExpression.isKind(SyntaxKind.PropertyAccessExpression)) {
    const propAccess = calleeExpression as PropertyAccessExpression;
    iterable = propAccess.getExpression().getText();
    callee = propAccess.getName();
  } else {
    iterable = calleeExpression.getText();
  }

  const args = callExpression.getArguments();
  const callback = args[0];

  let params = '(item)';
  if (callback?.isKind(SyntaxKind.ArrowFunction)) {
    params = formatParams(callback as ArrowFunction);
  } else if (callback?.isKind(SyntaxKind.FunctionExpression)) {
    params = formatParams(callback as FunctionExpression);
  }

  return { iterable, callee, params };
}

function formatParams(fn: ArrowFunction | FunctionExpression): string {
  const parts = fn.getParameters().map((p) => p.getText());
  return `(${parts.join(', ')})`;
}

export function visitForEachLike(host: StatementVisitorHost, callExpression: CallExpression): BuildResult {
  const meta = extractForEachMeta(callExpression);

  // The loop node carries metadata only — no body in sourceText. CodeGen
  // reconstructs `${iterable}.${callee}(${params} => { body })` and walks
  // the body subgraph just like for a `while` loop.
  const loopId = host.createLoopNode(
    compactLabel(meta.iterable),
    meta.iterable,
  );

  setNodeData(host, loopId, {
    construct: 'foreach',
    forEachIterable: meta.iterable,
    forEachCallee: meta.callee,
    forEachParams: meta.params,
  });

  const callbackBranch = getCallbackBranch(callExpression);
  const innerDecisionCount = callbackBranch ? countDecisionsInBranch(callbackBranch) : 0;
  const body = callbackBranch ? host.visitBranch(callbackBranch) : undefined;

  if (body?.entry) {
    host.writer.addEdge(loopId, body.entry, 'each', false);
    host.connectLoopBackEdges(body.exits, loopId, innerDecisionCount);
    return { entry: loopId, exits: [loopId], endExits: body.endExits };
  }

  // Empty / non-walkable callback — render as a self-loop body so the
  // diagram is still readable.
  host.writer.addEdge(loopId, loopId, 'each', true);
  return { entry: loopId, exits: [loopId], endExits: [] };
}

// ── Plain action / return / throw / break / continue ──────────────────────

export function visitAction(host: StatementVisitorHost, label: string, sourceText?: string): BuildResult {
  // Plain actions don't carry a construct. CodeGen falls back to its
  // text-based "is this a return / throw / etc." check for them, so
  // legacy diagrams stay correct.
  const id = host.writer.addFlowNode('action', compactLabel(label), {
    sourceText,
  });
  return { entry: id, exits: [id], endExits: [] };
}

export function visitReturn(host: StatementVisitorHost, stmt: ReturnStatement): BuildResult {
  const expressionText = stmt.getExpression()?.getText();
  const label = expressionText ? `return ${expressionText}` : 'return';
  const id = host.writer.addFlowNode('action', compactLabel(label), {
    sourceText: stmt.getText(),
    construct: 'return',
  });

  return { entry: id, exits: [], endExits: [id] };
}

export function visitThrow(host: StatementVisitorHost, stmt: ThrowStatement): BuildResult {
  const expressionText = stmt.getExpression()?.getText();
  const label = expressionText ? `throw ${expressionText}` : 'throw';
  const id = host.writer.addFlowNode('action', compactLabel(label), {
    sourceText: stmt.getText(),
    construct: 'throw',
  });

  return { entry: id, exits: [], endExits: [id] };
}