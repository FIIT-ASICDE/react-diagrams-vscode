import {
  DoStatement,
  ForInStatement,
  ForOfStatement,
  ForStatement,
  IfStatement,
  Node as MorphNode,
  TryStatement,
  WhileStatement,
} from 'ts-morph';
import type { BuildResult } from '../types';
import { compactLabel, getFallthroughEdgeLabel } from '../utils';
import type { ControlContext, LoopContext, StatementVisitorHost } from './host-context';

// ── Helpers ────────────────────────────────────────────────────────────────

function setNodeData(host: StatementVisitorHost, nodeId: string, extra: Record<string, unknown>): void {
  const node = (host.writer as unknown as { nodes?: import('@xyflow/react').Node[] }).nodes?.find?.(
    (candidate) => candidate.id === nodeId,
  );
  if (!node) return;
  node.data = { ...(node.data ?? {}), ...extra };
}

function getNodeData(host: StatementVisitorHost, nodeId: string): Record<string, unknown> | undefined {
  const node = (host.writer as unknown as { nodes?: import('@xyflow/react').Node[] }).nodes?.find?.(
    (candidate) => candidate.id === nodeId,
  );
  return node?.data as Record<string, unknown> | undefined;
}

function markReturnAsPending(host: StatementVisitorHost, returnNodeId: string): string {
  const data = getNodeData(host, returnNodeId) ?? {};
  const sourceText = typeof data.sourceText === 'string'
    ? data.sourceText
    : typeof data.label === 'string'
      ? data.label
      : 'return;';

  setNodeData(host, returnNodeId, {
    construct: 'pending-return',
    pendingReturnSourceText: sourceText,
    sourceText: '',
    label: 'pending return',
  });

  return sourceText;
}

function createDeferredReturnNode(host: StatementVisitorHost, returnSourceText: string): string {
  const cleanSource = returnSourceText && returnSourceText.trim() ? returnSourceText : 'return;';
  return host.writer.addFlowNode('action', compactLabel(cleanSource), {
    sourceText: cleanSource,
    construct: 'return',
  });
}

function createTryExitBoundary(host: StatementVisitorHost, tryOwnerId: string, exits: string[]): string[] {
  const uniqueExits = [...new Set(exits)].filter(Boolean);
  if (uniqueExits.length === 0) return [];

  // Single exit — no merge needed, just tag the exit node directly
  if (uniqueExits.length === 1) {
    setNodeData(host, uniqueExits[0], { tryOwner: tryOwnerId, role: 'try-exit-boundary' });
    return uniqueExits;
  }

  const boundaryId = host.writer.addFlowNode('merge', '');
  setNodeData(host, boundaryId, { tryOwner: tryOwnerId, role: 'try-exit-boundary' });

  for (const exit of uniqueExits) {
    host.writer.addEdge(exit, boundaryId, 'exit try');
  }

  return [boundaryId];
}

/**
 * After a loop body has been visited, wire up the break / continue
 * actions registered on its context. Returns break exits to be combined
 * with the natural loop exit by the caller.
 */
function wirePendingBreaksAndContinues(host: StatementVisitorHost, ctx: LoopContext): string[] {
  const uniqueContinues = [...new Set(ctx.pendingContinues)].filter(Boolean);
  for (const continueId of uniqueContinues) {
    host.writer.addEdge(continueId, ctx.continueTarget, '', true);
  }
  return ctx.pendingBreaks;
}

/**
 * Merge loop exits and break exits with an explicit merge node if needed.
 * 
 * When a loop has both normal exit(s) and break exit(s), they must converge
 * into an explicit merge node before reaching the post-loop continuation.
 * This ensures proper activity diagram structure instead of implicit merges.
 * 
 * @param loopExits - Normal loop exits (typically [loopId])
 * @param breakExits - Break statement exits
 * @returns Final exits (either [mergeId] or just loopExits if no breaks)
 */
function mergeLoopExitsWithBreaks(
  host: StatementVisitorHost,
  loopExits: string[],
  breakExits: string[],
): string[] {
  // No breaks — just return normal loop exits as-is
  if (breakExits.length === 0) {
    return loopExits;
  }

  // Has breaks but no normal loop exit — just return break exits
  if (loopExits.length === 0) {
    return breakExits;
  }

  // Both normal loop exits and break exits exist — create explicit merge
  const mergeId = host.writer.addFlowNode('merge', '');

  // Wire loop exit to merge
  for (const loopExit of loopExits) {
     host.writer.addEdge(loopExit, mergeId, getFallthroughEdgeLabel(loopExit));
  }

  // Wire all break exits to merge
  for (const breakExit of breakExits) {
    host.writer.addEdge(breakExit, mergeId);
  }

  return [mergeId];
}

function resolveExitSourcesWithLabels(
  host: StatementVisitorHost,
  sources: string[],
  sourceLabels?: Record<string, string>,
): { exits: string[]; exitLabels?: Record<string, string> } {
  const uniqueSources = [...new Set(sources)].filter(Boolean);
  const resolvedExits = host.resolveExitSources(uniqueSources, sourceLabels);

  if (resolvedExits.length <= 1 && uniqueSources.length <= 1) {
    const survivingLabels = sourceLabels
      ? Object.fromEntries(
        Object.entries(sourceLabels).filter(([sourceId]) => uniqueSources.includes(sourceId)),
      )
      : undefined;

    return {
      exits: resolvedExits,
      exitLabels: survivingLabels && Object.keys(survivingLabels).length > 0 ? survivingLabels : undefined,
    };
  }

  return { exits: resolvedExits };
}

// ── Visitors ───────────────────────────────────────────────────────────────

export function visitIf(host: StatementVisitorHost, stmt: IfStatement): BuildResult {
  const elseStmt = stmt.getElseStatement();
  const conditionText = stmt.getExpression().getText();

  const decisionId = host.createDecisionNode(compactLabel(conditionText), conditionText);
  setNodeData(host, decisionId, { construct: 'if' });

  const thenResult = host.visitBranch(stmt.getThenStatement());
  const elseResult = elseStmt ? host.visitBranch(elseStmt) : undefined;
  const mergeSources: string[] = [];
  const exitLabels: Record<string, string> = {};
  const returnExits: string[] = [];
  const throwExits: string[] = [];

  if (thenResult.entry) {
    host.writer.addEdge(decisionId, thenResult.entry, 'yes', false);
    mergeSources.push(...thenResult.exits);
    returnExits.push(...thenResult.returnExits);
    throwExits.push(...thenResult.throwExits);
  } else {
    mergeSources.push(decisionId);
  }

  if (elseResult) {
    if (elseResult.entry) {
      host.writer.addEdge(decisionId, elseResult.entry, 'no', false);
      mergeSources.push(...elseResult.exits);
      returnExits.push(...elseResult.returnExits);
      throwExits.push(...elseResult.throwExits);
    } else {
      mergeSources.push(decisionId);
      exitLabels[decisionId] = 'no';
    }
  } else {
    mergeSources.push(decisionId);
    exitLabels[decisionId] = 'no';
  }

  const resolved = resolveExitSourcesWithLabels(host, mergeSources, exitLabels);

  return {
    entry: decisionId,
    exits: resolved.exits,
    exitLabels: resolved.exitLabels,
    returnExits: [...new Set(returnExits)],
    throwExits: [...new Set(throwExits)],
  };
}

export function visitWhile(host: StatementVisitorHost, stmt: WhileStatement): BuildResult {
  const condText = stmt.getExpression().getText();
  const loopId = host.createLoopNode(compactLabel(condText), condText);
  setNodeData(host, loopId, { construct: 'while' });

  const ctx = host.pushLoopContext(loopId);
  try {
    const result = visitStandardLoop(host, loopId, stmt.getStatement(), 'yes');
    const breakExits = wirePendingBreaksAndContinues(host, ctx);
    const mergedExits = mergeLoopExitsWithBreaks(host, result.exits, breakExits);
    return {
      entry: result.entry,
      exits: mergedExits,
      returnExits: result.returnExits,
      throwExits: result.throwExits,
    };
  } finally {
    host.popContext();
  }
}

export function visitDoWhile(host: StatementVisitorHost, stmt: DoStatement): BuildResult {
  const condText = stmt.getExpression().getText();
  const loopId = host.createLoopNode(compactLabel(condText), condText);
  setNodeData(host, loopId, { construct: 'do-while' });

  const ctx = host.pushLoopContext(loopId);

  try {
    const loopBranch = stmt.getStatement();
    const body = host.visitBranch(loopBranch);

    if (!body.entry) {
      // Empty body. Keep loop node as construct entry.
      host.writer.addEdge(loopId, loopId, 'yes', false);

      const breakExits = wirePendingBreaksAndContinues(host, ctx);
    const mergedExits = mergeLoopExitsWithBreaks(host, [loopId], breakExits);

      return {
        entry: loopId,
        exits: mergedExits,
        returnExits: [],
        throwExits: [],
      };
    }

    // IMPORTANT:
    // For do-while, the construct entry must be loopId, not body.entry.
    // CodeGen must see the loop node first so it can emit:
    // do { body } while (condition)
    host.writer.addEdge(loopId, body.entry, 'yes', false);

    // Body natural fall-through goes back to the do-while test.
    // This is a loop-back edge, so mark it as back=true.
    for (const exit of body.exits) {
      host.writer.addEdge(exit, loopId, getFallthroughEdgeLabel(exit), true);
    }

    const breakExits = wirePendingBreaksAndContinues(host, ctx);
    const mergedExits = mergeLoopExitsWithBreaks(host, [loopId], breakExits);

    return {
      entry: loopId,
      exits: mergedExits,
      returnExits: [...new Set(body.returnExits)],
      throwExits: [...new Set(body.throwExits)],
    };
  } finally {
    host.popContext();
  }
}

export function visitFor(host: StatementVisitorHost, stmt: ForStatement): BuildResult {
  const initText = stmt.getInitializer()?.getText() ?? '';
  const condText = stmt.getCondition()?.getText() ?? '';
  const incText = stmt.getIncrementor()?.getText() ?? '';
  const headerText = `${initText}; ${condText}; ${incText}`;

  const loopId = host.createLoopNode(
    compactLabel(condText || 'for'),
    condText || 'for',
  );
  setNodeData(host, loopId, {
    construct: 'for',
    forHeader: headerText,
  });

  const ctx = host.pushLoopContext(loopId);
  try {
    const result = visitStandardLoop(host, loopId, stmt.getStatement(), 'yes');
    const breakExits = wirePendingBreaksAndContinues(host, ctx);
    const mergedExits = mergeLoopExitsWithBreaks(host, result.exits, breakExits);
    return {
      entry: result.entry,
      exits: mergedExits,
      returnExits: result.returnExits,
      throwExits: result.throwExits,
    };
  } finally {
    host.popContext();
  }
}

export function visitForOf(host: StatementVisitorHost, stmt: ForOfStatement): BuildResult {
  return visitIteratorLoop(host, stmt, 'for-of');
}

export function visitForIn(host: StatementVisitorHost, stmt: ForInStatement): BuildResult {
  return visitIteratorLoop(host, stmt, 'for-in');
}

// ── Try / catch / finally ─────────────────────────────────────────────────

type ContextSnapshot = Map<ControlContext, { breaks: Set<string>; continues: Set<string> }>;

function snapshotPending(host: StatementVisitorHost): ContextSnapshot {
  const snap: ContextSnapshot = new Map();
  for (const ctx of host.getContextStack()) {
    snap.set(ctx, {
      breaks: new Set(ctx.pendingBreaks),
      continues: new Set(ctx.kind === 'loop' ? ctx.pendingContinues : []),
    });
  }
  return snap;
}

type RedirectEntry = {
  nodeId: string;
  ctx: ControlContext;
  kind: 'break' | 'continue';
};

function diffPending(host: StatementVisitorHost, before: ContextSnapshot): RedirectEntry[] {
  const entries: RedirectEntry[] = [];

  for (const ctx of host.getContextStack()) {
    const beforeForCtx = before.get(ctx) ?? { breaks: new Set<string>(), continues: new Set<string>() };

    for (const id of ctx.pendingBreaks) {
      if (!beforeForCtx.breaks.has(id)) {
        entries.push({ nodeId: id, ctx, kind: 'break' });
      }
    }

    if (ctx.kind === 'loop') {
      for (const id of ctx.pendingContinues) {
        if (!beforeForCtx.continues.has(id)) {
          entries.push({ nodeId: id, ctx, kind: 'continue' });
        }
      }
    }
  }

  return entries;
}

function removeFromContext(ctx: ControlContext, kind: 'break' | 'continue', nodeId: string): void {
  if (kind === 'break') {
    const i = ctx.pendingBreaks.indexOf(nodeId);
    if (i !== -1) ctx.pendingBreaks.splice(i, 1);
    return;
  }

  if (ctx.kind === 'loop') {
    const i = ctx.pendingContinues.indexOf(nodeId);
    if (i !== -1) ctx.pendingContinues.splice(i, 1);
  }
}

/**
 * Splice a fresh copy of `finallyBlock` between source nodes and a
 * downstream target. Each kind of upstream flow gets its own copy via
 * this helper, so the post-finally destination correctly matches the
 * "intent" of the path.
 *
 * Returns the finally copy's normal exits (caller wires these to the
 * kind-specific target), plus any returnExits / throwExits the finally
 * BODY itself produced. Per JS spec, return / throw inside finally
 * dominates and overrides the upstream intent — so the caller should
 * propagate these as their respective end exits of the whole try
 * construct, replacing whatever the upstream kind would have been.
 *
 * If the finally body is empty, sources are returned as-is — the caller
 * should wire them straight to the target as if there were no finally.
 */
function spliceFinallyCopy(
  host: StatementVisitorHost,
  finallyBlock: MorphNode,
  sources: string[],
): { exits: string[]; exitLabels?: Record<string, string>; returnExits: string[]; throwExits: string[] } {
  if (sources.length === 0) {
    return { exits: [], returnExits: [], throwExits: [] };
  }

  const copy = host.visitBranch(finallyBlock);

  if (!copy.entry) {
    return { exits: sources, returnExits: [], throwExits: [] };
  }

  if (sources.length === 1) {
    const label = getFallthroughEdgeLabel(sources[0]) ?? 'finally';
    host.writer.addEdge(sources[0], copy.entry, label, false);
  } else {
    const mergeId = host.writer.addFlowNode('merge', '');
    for (const src of sources) {
      host.writer.addEdge(src, mergeId, getFallthroughEdgeLabel(src));
    }
    host.writer.addEdge(mergeId, copy.entry, 'finally', false);
  }

  const resolvedExits = host.resolveExitSources(copy.exits);
  const resolvedExitLabels = copy.exitLabels
    ? Object.fromEntries(
      Object.entries(copy.exitLabels).filter(([exitId]) => resolvedExits.includes(exitId)),
    )
    : undefined;

  return {
    exits: resolvedExits,
    exitLabels: resolvedExitLabels && Object.keys(resolvedExitLabels).length > 0 ? resolvedExitLabels : undefined,
    returnExits: [...copy.returnExits],
    throwExits: [...copy.throwExits],
  };
}

/**
 * `try` / `catch` / `finally` — strict JS semantics.
 *
 * Edges off the try-decision node:
 *   - unlabeled                    → entry of try-body
 *   - labeled `exception`          → entry of catch-body (if any)
 *
 * Finally is duplicated once per kind of upstream flow, because each
 * kind has a different post-finally destination:
 *
 *   NORMAL    → finally → surrounding flow (this construct's exits)
 *   RETURN    → finally → function End (this construct's returnExits)
 *   THROW     → finally → ErrorEnd / outer catch (this construct's
 *                          throwExits)
 *   CONTINUE  → finally → back-edge to enclosing loop
 *   BREAK     → finally → enclosing loop / switch's break target
 *
 * Throw routing inside try/catch:
 *   - throw inside try-body  →  catch entry (if catch exists)
 *                             →  finally THROW kind (if no catch)
 *   - throw inside catch-body→  finally THROW kind
 *
 * No catch: try's throws bypass into finally THROW kind (uncaught,
 * propagating outward).
 *
 * Each kind that actually has source paths gets its own finally copy.
 * Kinds with no sources are skipped — no empty finally branches.
 *
 * If finally BODY itself has return / throw, those endExits dominate
 * (per JS spec) and replace whatever the upstream intent was.
 */
export function visitTry(host: StatementVisitorHost, stmt: TryStatement): BuildResult {
  const finallyBlock = stmt.getFinallyBlock();

  // Snapshot pending break/continue BEFORE visiting try / catch so we
  // know which ones came from inside.
  const beforeTrySnapshot = snapshotPending(host);

  // ── Visit try body ────────────────────────────────────────────────────

  const tryResult = host.visitBranch(stmt.getTryBlock());
  const tryEntryId = tryResult.entry;

  const trySuccessExits = tryResult.entry
    ? host.resolveExitSources(tryResult.exits)
    : [];

  // ── Visit catch body ──────────────────────────────────────────────────

  const catchClause = stmt.getCatchClause();
  const shouldMaterializeCatch = Boolean(catchClause && tryResult.throwExits.length > 0);
  const catchResult = shouldMaterializeCatch
    ? host.visitBranch(catchClause!.getBlock())
    : undefined;

  const catchSuccessExits: string[] = [];

  if (shouldMaterializeCatch && catchResult?.entry) {
    // Route exception flow into catch only from node-originated throw sources.
    for (const throwId of tryResult.throwExits) {
      host.writer.addEdge(throwId, catchResult.entry, 'exception', false);
    }
    catchSuccessExits.push(...host.resolveExitSources(catchResult.exits));
  }

  // ── Capture redirect entries (continue/break inside try-or-catch) ─────

  const redirects = finallyBlock ? diffPending(host, beforeTrySnapshot) : [];

  if (finallyBlock && redirects.length > 0) {
    for (const r of redirects) {
      removeFromContext(r.ctx, r.kind, r.nodeId);
    }
  }

  // ── Bucket sources by KIND ────────────────────────────────────────────

  const normalSources = [...new Set([...trySuccessExits, ...catchSuccessExits])];

  // Returns from try / returns from catch — both want to go to End,
  // so they merge into a single RETURN bucket here.
  const returnSources = [
    ...tryResult.returnExits,
    ...(catchResult?.returnExits ?? []),
  ];

  // Throw sources for finally:
  //   - try-body throws are caught by an existing catch, so they DON'T
  //     reach finally as throws (they flow through catch as normal /
  //     return / re-throw)
  //   - try-body throws WITHOUT a catch escape directly to finally
  //   - catch-body throws (re-throw, or new throw) escape to finally
  const throwSources = [
    ...(shouldMaterializeCatch ? [] : tryResult.throwExits),
    ...(catchResult?.throwExits ?? []),
  ];

  // ── No finally → wire each kind direct to its target ──────────────────

  if (!finallyBlock) {
    const normalExits = host.resolveExitSources(normalSources);
    const tryOwnerId = tryEntryId ?? catchResult?.entry;
    return {
      entry: tryEntryId,
      entryEdgeLabel: tryEntryId ? 'try' : undefined,
      exits: tryOwnerId ? createTryExitBoundary(host, tryOwnerId, normalExits) : normalExits,
      returnExits: [...new Set(returnSources)],
      throwExits: [...new Set(throwSources)],
    };
  }

  // ── Finally present: visit a fresh copy per kind that has sources ─────

  const aggregateExits: string[] = [];
  const aggregateExitLabels: Record<string, string> = {};
  const aggregateReturnExits: string[] = [];
  const aggregateThrowExits: string[] = [];
  let fallbackEntryId: string | undefined;

  // NORMAL kind: try/catch success paths. After finally they continue
  // into the surrounding flow.
  if (normalSources.length > 0) {
    const sliced = spliceFinallyCopy(host, finallyBlock, normalSources);
    aggregateExits.push(...sliced.exits);
    if (sliced.exitLabels) {
      Object.assign(aggregateExitLabels, sliced.exitLabels);
    }
    aggregateReturnExits.push(...sliced.returnExits);
    aggregateThrowExits.push(...sliced.throwExits);
  } else if (!tryEntryId && returnSources.length === 0 && throwSources.length === 0) {
    // Empty try with finally still executes finally on normal entry.
    const directFinally = host.visitBranch(finallyBlock);
    if (directFinally.entry) {
      fallbackEntryId = directFinally.entry;
      aggregateExits.push(...host.resolveExitSources(directFinally.exits));
      aggregateReturnExits.push(...directFinally.returnExits);
      aggregateThrowExits.push(...directFinally.throwExits);
    }
  }

  // RETURN kind: function-end paths. After finally they go to End.
  // (If finally body itself returns / throws, those override — sliced
  // returnExits / throwExits cover that.)
  if (returnSources.length > 0) {
    for (const returnNodeId of [...new Set(returnSources)]) {
      const returnSourceText = markReturnAsPending(host, returnNodeId);
      const sliced = spliceFinallyCopy(host, finallyBlock, [returnNodeId]);

      // Materialize the original return only AFTER finally normal exits.
      if (sliced.exits.length > 0) {
        const deferredReturnNodeId = createDeferredReturnNode(host, returnSourceText);
        for (const exit of sliced.exits) {
          host.writer.addEdge(exit, deferredReturnNodeId, sliced.exitLabels?.[exit] ?? getFallthroughEdgeLabel(exit));
        }
        aggregateReturnExits.push(deferredReturnNodeId);
      }

      // Abrupt completions from finally override the pending return.
      aggregateReturnExits.push(...sliced.returnExits);
      aggregateThrowExits.push(...sliced.throwExits);
    }
  }

  // THROW kind: uncaught exceptions on the way out. After finally they
  // remain throws (propagate to outer catch / ErrorEnd).
  if (throwSources.length > 0) {
    const sliced = spliceFinallyCopy(host, finallyBlock, throwSources);
    aggregateThrowExits.push(...sliced.exits);
    aggregateReturnExits.push(...sliced.returnExits);
    aggregateThrowExits.push(...sliced.throwExits);
  }

  // CONTINUE / BREAK kinds: redirected through finally to enclosing
  // loop / switch. Group by target so multiple continues / breaks with
  // the same destination share one finally copy.
  const continueGroups = new Map<LoopContext, string[]>();
  const breakGroups = new Map<ControlContext, string[]>();

  for (const r of redirects) {
    if (r.kind === 'continue' && r.ctx.kind === 'loop') {
      const list = continueGroups.get(r.ctx) ?? [];
      list.push(r.nodeId);
      continueGroups.set(r.ctx, list);
    } else if (r.kind === 'break') {
      const list = breakGroups.get(r.ctx) ?? [];
      list.push(r.nodeId);
      breakGroups.set(r.ctx, list);
    }
  }

  for (const [loopCtx, sources] of continueGroups) {
    const sliced = spliceFinallyCopy(host, finallyBlock, sources);
    for (const exit of sliced.exits) {
      host.writer.addEdge(exit, loopCtx.continueTarget, '', true);
    }
    aggregateReturnExits.push(...sliced.returnExits);
    aggregateThrowExits.push(...sliced.throwExits);
  }

  for (const [breakCtx, sources] of breakGroups) {
    const sliced = spliceFinallyCopy(host, finallyBlock, sources);
    for (const exit of sliced.exits) {
      breakCtx.pendingBreaks.push(exit);
    }
    aggregateReturnExits.push(...sliced.returnExits);
    aggregateThrowExits.push(...sliced.throwExits);
  }

  const resolvedAggregateExits = host.resolveExitSources(aggregateExits);
  const resolvedAggregateExitLabels = Object.fromEntries(
    Object.entries(aggregateExitLabels).filter(([exitId]) => resolvedAggregateExits.includes(exitId)),
  );
  const statementEntry = tryEntryId ?? fallbackEntryId;
  const tryOwnerId = statementEntry ?? catchResult?.entry;

  return {
    entry: statementEntry,
    entryEdgeLabel: statementEntry ? 'try' : undefined,
    exits: tryOwnerId ? createTryExitBoundary(host, tryOwnerId, resolvedAggregateExits) : resolvedAggregateExits,
    exitLabels: Object.keys(resolvedAggregateExitLabels).length > 0 ? resolvedAggregateExitLabels : undefined,
    returnExits: [...new Set(aggregateReturnExits)],
    throwExits: [...new Set(aggregateThrowExits)],
  };
}

// ── Loop helpers ───────────────────────────────────────────────────────────

function visitStandardLoop(
  host: StatementVisitorHost,
  loopId: string,
  loopBranch: import('ts-morph').Node,
  bodyLabel = 'yes',
): BuildResult {
  const body = host.visitBranch(loopBranch);

  if (body.entry) {
    host.writer.addEdge(loopId, body.entry, bodyLabel, false);
    host.connectLoopBackEdges(body.exits, loopId);
  } else {
    host.writer.addEdge(loopId, loopId, bodyLabel, true);
  }

  return {
    entry: loopId,
    exits: [loopId],
    returnExits: [...new Set(body.returnExits)],
    throwExits: [...new Set(body.throwExits)],
  };
}

function visitIteratorLoop(
  host: StatementVisitorHost,
  stmt: ForOfStatement | ForInStatement,
  construct: 'for-of' | 'for-in',
): BuildResult {
  const iterableText = stmt.getExpression().getText();
  const bindingText = stmt.getInitializer()?.getText() ?? '';

  const loopId = host.createLoopNode(compactLabel(iterableText), iterableText);
  setNodeData(host, loopId, {
    construct,
    forOfBinding: bindingText,
  });

  const ctx = host.pushLoopContext(loopId);
  try {
    const result = visitStandardLoop(host, loopId, stmt.getStatement(), 'each');
    const breakExits = wirePendingBreaksAndContinues(host, ctx);
    const mergedExits = mergeLoopExitsWithBreaks(host, result.exits, breakExits);
    return {
      entry: result.entry,
      exits: mergedExits,
      returnExits: result.returnExits,
      throwExits: result.throwExits,
    };
  } finally {
    host.popContext();
  }
}