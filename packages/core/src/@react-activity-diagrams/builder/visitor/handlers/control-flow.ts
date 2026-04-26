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
import { compactLabel, countDecisionsInBranch, getFallthroughEdgeLabel } from '../utils';
import type { StatementVisitorHost } from './host-context';

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Mutate a node's data after creation. The graph writer doesn't expose a
 * dedicated update API, so we reach into the nodes array it shares with us.
 */
function setNodeData(host: StatementVisitorHost, nodeId: string, extra: Record<string, unknown>): void {
  const node = (host.writer as unknown as { nodes?: import('@xyflow/react').Node[] }).nodes?.find?.(
    (candidate) => candidate.id === nodeId,
  );
  if (!node) return;
  node.data = { ...(node.data ?? {}), ...extra };
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
  const endExits: string[] = [];

  if (thenResult.entry) {
    host.writer.addEdge(decisionId, thenResult.entry, 'yes', false);
    mergeSources.push(...thenResult.exits);
    endExits.push(...thenResult.endExits);
  } else {
    mergeSources.push(decisionId);
  }

  if (elseResult) {
    if (elseResult.entry) {
      host.writer.addEdge(decisionId, elseResult.entry, 'no', false);
      mergeSources.push(...elseResult.exits);
      endExits.push(...elseResult.endExits);
    } else {
      mergeSources.push(decisionId);
    }
  } else {
    mergeSources.push(decisionId);
  }

  return {
    entry: decisionId,
    exits: host.resolveExitSources(mergeSources),
    endExits: [...new Set(endExits)],
  };
}

export function visitWhile(host: StatementVisitorHost, stmt: WhileStatement): BuildResult {
  const condText = stmt.getExpression().getText();
  const loopId = host.createLoopNode(compactLabel(condText), condText);
  setNodeData(host, loopId, { construct: 'while' });

  return visitStandardLoop(host, loopId, stmt.getStatement(), 'yes');
}

export function visitDoWhile(host: StatementVisitorHost, stmt: DoStatement): BuildResult {
  const condText = stmt.getExpression().getText();
  const loopId = host.createLoopNode(compactLabel(condText), condText);
  setNodeData(host, loopId, { construct: 'do-while' });

  const loopBranch = stmt.getStatement();
  const innerDecisionCount = countDecisionsInBranch(loopBranch);
  const body = host.visitBranch(loopBranch);

  if (!body.entry) {
    host.writer.addEdge(loopId, loopId, 'yes', true);
    return { entry: loopId, exits: [loopId], endExits: [] };
  }

  for (const exit of body.exits) {
    host.writer.addEdge(exit, loopId, getFallthroughEdgeLabel(exit));
  }

  host.writer.addEdge(loopId, body.entry, 'yes', true);

  return {
    entry: body.entry,
    exits: [loopId],
    endExits: [...new Set(body.endExits)],
  };
}

/**
 * Classical `for (init; cond; inc)` loop.
 *
 * The full header (`init; cond; inc`) is stored on the loop node as
 * `data.forHeader`. CodeGen emits it verbatim as `for (<forHeader>) { body }`.
 *
 * Why on the loop node and not as separate action nodes: storing init/inc
 * as adjacent action nodes was unstable across round-trips — CodeGen had
 * no way to tell which neighbouring actions "belonged" to the loop, and
 * the parser duplicated init nodes on every parse → generate cycle.
 */
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

  return visitStandardLoop(host, loopId, stmt.getStatement(), 'yes');
}

export function visitForOf(host: StatementVisitorHost, stmt: ForOfStatement): BuildResult {
  return visitIteratorLoop(host, stmt, 'for-of');
}

export function visitForIn(host: StatementVisitorHost, stmt: ForInStatement): BuildResult {
  return visitIteratorLoop(host, stmt, 'for-in');
}

/**
 * `try` / `catch` / `finally`.
 *
 * Represented in the graph as a DECISION node with `construct: 'try'`.
 * Two outgoing edges:
 *   - unlabeled (or labeled 'try') → entry of try-body
 *   - labeled 'exception'          → entry of catch-body
 *
 * `finally` is a separate downstream subgraph that all paths funnel
 * through via a 'finally' edge. CodeGen reconstructs the construct by
 * reading `construct: 'try'` and the outgoing edge labels — no
 * sourceText round-trip dependency.
 */
export function visitTry(host: StatementVisitorHost, stmt: TryStatement): BuildResult {
  const tryStartId = host.createDecisionNode('try', 'try');
  setNodeData(host, tryStartId, { construct: 'try' });

  const tryResult = host.visitBranch(stmt.getTryBlock());

  if (tryResult.entry) {
    host.writer.addEdge(tryStartId, tryResult.entry, '', false);
  }

  const trySuccessExits = tryResult.entry
    ? host.resolveExitSources(tryResult.exits)
    : [tryStartId];

  const catchClause = stmt.getCatchClause();
  const catchResult = catchClause
    ? host.visitBranch(catchClause.getBlock())
    : undefined;

  const catchSuccessExits: string[] = [];

  if (catchClause && catchResult?.entry) {
    host.writer.addEdge(tryStartId, catchResult.entry, 'exception', false);
    catchSuccessExits.push(...host.resolveExitSources(catchResult.exits));
  }

  const innerEndExits = [
    ...tryResult.endExits,
    ...(catchResult?.endExits ?? []),
  ];

  const normalExits = [...trySuccessExits, ...catchSuccessExits];
  const uniqueNormalExits = [...new Set(normalExits)];

  const finallyBlock = stmt.getFinallyBlock();

  if (!finallyBlock) {
    return {
      entry: tryStartId,
      exits: host.resolveExitSources(uniqueNormalExits),
      endExits: [...new Set(innerEndExits)],
    };
  }

  const finallyResult = host.visitBranch(finallyBlock);

  if (!finallyResult.entry) {
    return {
      entry: tryStartId,
      exits: host.resolveExitSources(uniqueNormalExits),
      endExits: [...new Set(innerEndExits)],
    };
  }

  const allPathsIntoFinally = [...new Set([...uniqueNormalExits, ...innerEndExits])];

  let finallyInputId: string | undefined;
  if (allPathsIntoFinally.length === 0) {
    finallyInputId = undefined;
  } else if (allPathsIntoFinally.length === 1) {
    finallyInputId = allPathsIntoFinally[0];
  } else {
    finallyInputId = host.writer.addFlowNode('merge', '');
    for (const source of allPathsIntoFinally) {
      host.writer.addEdge(source, finallyInputId);
    }
  }

  if (finallyInputId) {
    host.writer.addEdge(finallyInputId, finallyResult.entry, 'finally', false);
  }

  const finallyNormalExits = host.resolveExitSources(finallyResult.exits);

  if (finallyResult.endExits.length > 0) {
    return {
      entry: tryStartId,
      exits: [],
      endExits: [...new Set(finallyResult.endExits)],
    };
  }

  const hadEndExits = innerEndExits.length > 0;
  const hadNormalExits = uniqueNormalExits.length > 0;

  if (hadEndExits && !hadNormalExits) {
    return {
      entry: tryStartId,
      exits: [],
      endExits: [...new Set(finallyNormalExits)],
    };
  }

  return {
    entry: tryStartId,
    exits: finallyNormalExits,
    endExits: [],
  };
}

// ── Loop helpers ───────────────────────────────────────────────────────────

function visitStandardLoop(
  host: StatementVisitorHost,
  loopId: string,
  loopBranch: import('ts-morph').Node,
  bodyLabel = 'yes',
): BuildResult {
  const innerDecisionCount = countDecisionsInBranch(loopBranch);
  const body = host.visitBranch(loopBranch);

  if (body.entry) {
    host.writer.addEdge(loopId, body.entry, bodyLabel, false);
    host.connectLoopBackEdges(body.exits, loopId, innerDecisionCount);
  } else {
    host.writer.addEdge(loopId, loopId, bodyLabel, true);
  }

  return {
    entry: loopId,
    exits: [loopId],
    endExits: [...new Set(body.endExits)],
  };
}

/**
 * Iterator loop (`for-in` / `for-of`).
 *
 * Body is rendered as plain flow via visitStandardLoop. The loop node
 * carries:
 *   - construct:    'for-in' | 'for-of'
 *   - forOfBinding: initializer text (e.g. `const item`, `let key`)
 *   - sourceText:   iterable text (display + CodeGen header fallback)
 *
 * CodeGen reconstructs the header as `for (<binding> <keyword> <iter>)`.
 */
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

  return visitStandardLoop(host, loopId, stmt.getStatement(), 'each');
}