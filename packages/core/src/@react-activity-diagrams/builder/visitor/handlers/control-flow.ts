import {
  DoStatement,
  ForInStatement,
  ForOfStatement,
  ForStatement,
  IfStatement,
  TryStatement,
  WhileStatement,
} from 'ts-morph';
import type { BuildResult } from '../types';
import { compactLabel, countDecisionsInBranch, getFallthroughEdgeLabel } from '../utils';
import type { StatementVisitorHost } from './host-context';

export function visitIf(host: StatementVisitorHost, stmt: IfStatement): BuildResult {
  const elseStmt = stmt.getElseStatement();
  const decisionId = host.createDecisionNode(
    compactLabel(stmt.getExpression().getText()),
    stmt.getExpression().getText(),
  );

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
  return visitStandardLoop(
    host,
    host.createLoopNode(
      compactLabel(stmt.getExpression().getText()),
      stmt.getExpression().getText(),
    ),
    stmt.getStatement(),
    'yes',
  );
}

export function visitDoWhile(host: StatementVisitorHost, stmt: DoStatement): BuildResult {
  const loopId = host.createLoopNode(
    compactLabel(stmt.getExpression().getText()),
    stmt.getExpression().getText(),
  );

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

export function visitFor(host: StatementVisitorHost, stmt: ForStatement): BuildResult {
  let firstEntry: string | undefined;

  const initializer = stmt.getInitializer();
  if (initializer) {
    firstEntry = host.writer.addFlowNode('action', compactLabel(initializer.getText()), {
      sourceText: stmt.getText(),
      nodeKind: 'action',
    });
  }

  const loopId = host.createLoopNode(
    compactLabel(stmt.getCondition()?.getText() ?? 'for'),
    stmt.getCondition()?.getText() ?? 'for',
  );

  if (firstEntry) {
    host.writer.addEdge(firstEntry, loopId);
  } else {
    firstEntry = loopId;
  }

  const loopBranch = stmt.getStatement();
  const innerDecisionCount = countDecisionsInBranch(loopBranch);
  const body = host.visitBranch(loopBranch);
  const incrementor = stmt.getIncrementor();

  let incrementId: string | undefined;
  if (incrementor) {
    incrementId = host.writer.addFlowNode('action', compactLabel(incrementor.getText()), {
      sourceText: incrementor.getText(),
      nodeKind: 'action',
    });
  }

  if (body.entry) {
    host.writer.addEdge(loopId, body.entry, 'yes', false);
  } else if (incrementId) {
    host.writer.addEdge(loopId, incrementId, 'yes', false);
  } else {
    host.writer.addEdge(loopId, loopId, 'yes', true);
  }

  if (incrementId) {
    if (body.entry) {
      const uniqueBodyExits = [...new Set(body.exits)].filter(Boolean);
      for (const exit of uniqueBodyExits) {
        host.writer.addEdge(exit, incrementId, getFallthroughEdgeLabel(exit));
      }
    }

    host.writer.addEdge(incrementId, loopId, '', true);
  } else if (body.entry) {
    host.connectLoopBackEdges(body.exits, loopId, innerDecisionCount);
  }

  return {
    entry: firstEntry,
    exits: [loopId],
    endExits: [...new Set(body.endExits)],
  };
}

export function visitForOf(host: StatementVisitorHost, stmt: ForOfStatement): BuildResult {
  return visitIteratorLoop(host, stmt);
}

export function visitForIn(host: StatementVisitorHost, stmt: ForInStatement): BuildResult {
  return visitIteratorLoop(host, stmt);
}

export function visitTry(host: StatementVisitorHost, stmt: TryStatement): BuildResult {

  const tryStartId = host.writer.addFlowNode('action', 'try', {
    sourceText: stmt.getTryBlock().getText(),
    nodeKind: 'action',
  });

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

  // Case A: No finally block.
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

function visitStandardLoop(
  host: StatementVisitorHost,
  loopId: string,
  loopBranch: import('ts-morph').Node,
  bodyLabel = 'yes',
): BuildResult {
  const innerDecisionCount = countDecisionsInBranch(loopBranch);
  const body = host.visitBranch(loopBranch);
  void innerDecisionCount;

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

function visitIteratorLoop(host: StatementVisitorHost, stmt: ForOfStatement | ForInStatement): BuildResult {
  return visitStandardLoop(
    host,
    host.createLoopNode(
      compactLabel(stmt.getExpression().getText()),
      stmt.getExpression().getText(),
    ),
    stmt.getStatement(),
    'each',
  );
}