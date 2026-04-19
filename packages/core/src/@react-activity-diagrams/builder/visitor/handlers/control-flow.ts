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
    host.writer.addEdge(decisionId, thenResult.entry, 'yes', false, host.edgeMeta('right', 'positive'));
    mergeSources.push(...thenResult.exits);
    endExits.push(...thenResult.endExits);
  } else {
    mergeSources.push(host.createContinuationFrom(decisionId, 'yes', host.edgeMeta('right', 'positive')));
  }

  if (elseResult) {
    if (elseResult.entry) {
      host.writer.addEdge(decisionId, elseResult.entry, 'no', false, host.edgeMeta('left', 'negative'));
      mergeSources.push(...elseResult.exits);
      endExits.push(...elseResult.endExits);
    } else {
      mergeSources.push(host.createContinuationFrom(decisionId, 'no', host.edgeMeta('left', 'negative')));
    }
  } else {
    mergeSources.push(host.createContinuationFrom(decisionId, 'no', host.edgeMeta('left', 'negative')));
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
    'no',
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
    host.writer.addEdge(
      loopId,
      loopId,
      'yes',
      true,
      host.edgeMeta('left', 'loop-back', { innerDecisionCount }),
    );
    const exitId = host.createContinuationFrom(loopId, 'no', host.edgeMeta('left', 'negative'));
    return { entry: loopId, exits: [exitId], endExits: [] };
  }

  for (const exit of body.exits) {
    host.writer.addEdge(exit, loopId, getFallthroughEdgeLabel(exit));
  }

  host.writer.addEdge(
    loopId,
    body.entry,
    'yes',
    true,
    host.edgeMeta('left', 'loop-back', { innerDecisionCount }),
  );

  const exitId = host.createContinuationFrom(loopId, 'no', host.edgeMeta('left', 'negative'));

  return {
    entry: body.entry,
    exits: [exitId],
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
    host.writer.addEdge(loopId, body.entry, 'yes', false, host.edgeMeta('right', 'positive'));
  } else if (incrementId) {
    host.writer.addEdge(loopId, incrementId, 'yes', false, host.edgeMeta('right', 'positive'));
  } else {
    host.writer.addEdge(
      loopId,
      loopId,
      'yes',
      true,
      host.edgeMeta('left', 'loop-back', { innerDecisionCount }),
    );
  }

  if (incrementId) {
    if (body.entry) {
      const uniqueBodyExits = [...new Set(body.exits)].filter(Boolean);
      for (const exit of uniqueBodyExits) {
        host.writer.addEdge(exit, incrementId, getFallthroughEdgeLabel(exit));
      }
    }

    host.writer.addEdge(
      incrementId,
      loopId,
      '',
      true,
      host.edgeMeta('left', 'loop-back', { innerDecisionCount }),
    );
  } else if (body.entry) {
    host.connectLoopBackEdges(body.exits, loopId, innerDecisionCount);
  }

  const exitId = host.createContinuationFrom(loopId, 'no', host.edgeMeta('left', 'negative'));

  return {
    entry: firstEntry,
    exits: [exitId],
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
  const decisionId = host.createDecisionNode('try', stmt.getText());

  const normalSources: string[] = [];
  const abruptSources: string[] = [];

  const tryResult = host.visitBranch(stmt.getTryBlock());
  if (tryResult.entry) {
    host.writer.addEdge(
      decisionId,
      tryResult.entry,
      'try',
      false,
      host.edgeMeta('right', 'positive'),
    );
    normalSources.push(...tryResult.exits);
    abruptSources.push(...tryResult.endExits);
  } else {
    normalSources.push(
      host.createContinuationFrom(
        decisionId,
        'try',
        host.edgeMeta('right', 'positive'),
      ),
    );
  }

  const catchClause = stmt.getCatchClause();
  if (catchClause) {
    const catchResult = host.visitBranch(catchClause.getBlock());
    if (catchResult.entry) {
      host.writer.addEdge(
        decisionId,
        catchResult.entry,
        'catch',
        false,
        host.edgeMeta('left', 'negative'),
      );
      normalSources.push(...catchResult.exits);
      abruptSources.push(...catchResult.endExits);
    } else {
      normalSources.push(
        host.createContinuationFrom(
          decisionId,
          'catch',
          host.edgeMeta('left', 'negative'),
        ),
      );
    }
  }

  const finallyBlock = stmt.getFinallyBlock();

  if (!finallyBlock) {
    return {
      entry: decisionId,
      exits: host.resolveExitSources(normalSources),
      endExits: [...new Set(abruptSources)],
    };
  }

  const allIncoming = [...new Set([...normalSources, ...abruptSources])];
  if (allIncoming.length === 0) {
    return {
      entry: decisionId,
      exits: [],
      endExits: [],
    };
  }

  const finallyResult = host.visitBranch(finallyBlock);

  if (!finallyResult.entry) {
    return {
      entry: decisionId,
      exits: host.resolveExitSources(normalSources),
      endExits: [...new Set(abruptSources)],
    };
  }

  const finallyInput =
    allIncoming.length > 1
      ? (() => {
          const mergeId = host.writer.addFlowNode('merge', '');
          for (const source of allIncoming) {
            host.writer.addEdge(source, mergeId);
          }
          return mergeId;
        })()
      : allIncoming[0];

  host.writer.addEdge(finallyInput, finallyResult.entry);

  if (finallyResult.endExits.length > 0) {
    return {
      entry: decisionId,
      exits: [],
      endExits: [...new Set(finallyResult.endExits)],
    };
  }

  const exits = normalSources.length > 0 ? host.resolveExitSources(finallyResult.exits) : [];

  const endExits = abruptSources.length > 0 ? [...new Set(finallyResult.exits)] : [];

  return {
    entry: decisionId,
    exits,
    endExits,
  };
}

function visitStandardLoop(
  host: StatementVisitorHost,
  loopId: string,
  loopBranch: import('ts-morph').Node,
  bodyLabel = 'yes',
  exitLabel = 'no',
): BuildResult {
  const innerDecisionCount = countDecisionsInBranch(loopBranch);
  const body = host.visitBranch(loopBranch);

  if (body.entry) {
    host.writer.addEdge(loopId, body.entry, bodyLabel, false, host.edgeMeta('right', 'positive'));
    host.connectLoopBackEdges(body.exits, loopId, innerDecisionCount);
  } else {
    host.writer.addEdge(
      loopId,
      loopId,
      bodyLabel,
      true,
      host.edgeMeta('left', 'loop-back', { innerDecisionCount }),
    );
  }

  const exitId = host.createContinuationFrom(loopId, exitLabel, host.edgeMeta('left', 'negative'));
  return {
    entry: loopId,
    exits: [exitId],
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
    'done',
  );
}