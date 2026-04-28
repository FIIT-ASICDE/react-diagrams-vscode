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
import { compactLabel } from '../utils';
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

  return { entry: bodyId, exits: [bodyId], returnExits: [], throwExits: [] };
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

  const ctx = host.pushLoopContext(loopId);
  try {
    const callbackBranch = getCallbackBranch(callExpression);
    const body = callbackBranch ? host.visitBranch(callbackBranch) : undefined;

    if (body?.entry) {
      host.writer.addEdge(loopId, body.entry, 'each', false);
      host.connectLoopBackEdges(body.exits, loopId);
      for (const continueId of [...new Set(ctx.pendingContinues)].filter(Boolean)) {
        host.writer.addEdge(continueId, loopId, '', true);
      }

      return {
        entry: loopId,
        exits: [loopId, ...ctx.pendingBreaks],
        returnExits: body.returnExits,
        throwExits: body.throwExits,
      };
    }

    host.writer.addEdge(loopId, loopId, 'each', true);
    for (const continueId of [...new Set(ctx.pendingContinues)].filter(Boolean)) {
      host.writer.addEdge(continueId, loopId, '', true);
    }
    return {
      entry: loopId,
      exits: [loopId, ...ctx.pendingBreaks],
      returnExits: [],
      throwExits: [],
    };
  } finally {
    host.popContext();
  }
}

// ── Plain action / return / throw ─────────────────────────────────────────

export function visitAction(host: StatementVisitorHost, label: string, sourceText?: string): BuildResult {
  // Plain actions don't carry a construct. CodeGen falls back to its
  // text-based "is this a return / throw / etc." check for them, so
  // legacy diagrams stay correct.
  const id = host.writer.addFlowNode('action', compactLabel(label), {
    sourceText,
  });
  return { entry: id, exits: [id], returnExits: [], throwExits: [] };
}

/**
 * `return` exits via returnExits — eventually routed to the function's
 * End node. NOT throwExits.
 */
export function visitReturn(host: StatementVisitorHost, stmt: ReturnStatement): BuildResult {
  const expressionText = stmt.getExpression()?.getText();
  const label = expressionText ? `return ${expressionText}` : 'return';
  const id = host.writer.addFlowNode('action', compactLabel(label), {
    sourceText: stmt.getText(),
    construct: 'return',
  });

  return { entry: id, exits: [], returnExits: [id], throwExits: [] };
}

/**
 * `throw` exits via throwExits — eventually routed to the function's
 * ErrorEnd node (UNLESS caught by an enclosing try / catch on the way
 * out, in which case visitTry redirects this entry to the catch entry).
 *
 * Crucially throwExits MUST NOT be merged with returnExits or normal
 * exits — exception flow has different downstream semantics from
 * success flow.
 */
export function visitThrow(host: StatementVisitorHost, stmt: ThrowStatement): BuildResult {
  const expressionText = stmt.getExpression()?.getText();
  const label = expressionText ? `throw ${expressionText}` : 'throw';
  const id = host.writer.addFlowNode('action', compactLabel(label), {
    sourceText: stmt.getText(),
    construct: 'throw',
  });

  return { entry: id, exits: [], returnExits: [], throwExits: [id] };
}