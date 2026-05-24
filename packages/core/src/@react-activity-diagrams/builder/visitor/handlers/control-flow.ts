import {
	DoStatement,
	ForInStatement,
	ForOfStatement,
	ForStatement,
	IfStatement,
	type Node as MorphNode,
	TryStatement,
	WhileStatement,
} from 'ts-morph';
import type { BuildResult } from '../types';
import { compactLabel, getFallthroughEdgeLabel } from '../utils';
import type { ControlContext, LoopContext, StatementVisitorHost } from './host-context';






// Returns unique items while preserving order.
function unique<T>(items: T[]): T[] {
	return [...new Set(items)];
}




// Returns unique non-empty node ids.
function uniqueIds(ids: string[]): string[] {
	return unique(ids).filter(Boolean);
}




// Returns labels only when the map contains entries.
function nonEmptyLabels(
	labels?: Record<string, string>,
): Record<string, string> | undefined {
	return labels && Object.keys(labels).length > 0 ? labels : undefined;
}




// Merges exit labels into a target map.
function mergeExitLabels(
	target: Record<string, string>,
	labels?: Record<string, string>,
): void {
	if (!labels) return;
	Object.assign(target, labels);
}




// Marks a return node as pending before finally handling.
function markReturnAsPending(host: StatementVisitorHost, returnNodeId: string): string {
	const data = host.writer.getNodeData(returnNodeId) ?? {};
	const sourceText =
		typeof data.sourceText === 'string'
			? data.sourceText
			: typeof data.label === 'string'
				? data.label
				: 'return;';

	host.writer.updateNodeData(returnNodeId, {
		construct: 'pending-return',
		pendingReturnSourceText: sourceText,
		sourceText: '',
		label: 'pending return',
	});

	return sourceText;
}




// Creates deferred return node.
function createDeferredReturnNode(
	host: StatementVisitorHost,
	returnSourceText: string,
): string {
	const cleanSource = returnSourceText.trim() ? returnSourceText : 'return;';

	return host.writer.addFlowNode('action', compactLabel(cleanSource), {
		sourceText: cleanSource,
		construct: 'return',
	});
}




// Creates try exit boundary.
function createTryExitBoundary(
	host: StatementVisitorHost,
	tryOwnerId: string,
	exits: string[],
): string[] {
	const uniqueExits = uniqueIds(exits);
	if (uniqueExits.length === 0) return [];

	if (uniqueExits.length === 1) {
		host.writer.updateNodeData(uniqueExits[0], {
			tryOwner: tryOwnerId,
			role: 'try-exit-boundary',
		});
		return uniqueExits;
	}

	const boundaryId = host.writer.addFlowNode('merge', '');

	host.writer.updateNodeData(boundaryId, {
		tryOwner: tryOwnerId,
		role: 'try-exit-boundary',
	});

	for (const exit of uniqueExits) {
		host.writer.addEdge(exit, boundaryId, 'exit try');
	}

	return [boundaryId];
}





// Wires pending continue edges and returns pending breaks.
function wirePendingBreaksAndContinues(
	host: StatementVisitorHost,
	ctx: LoopContext,
): string[] {
	for (const continueId of uniqueIds(ctx.pendingContinues)) {
		host.writer.addEdge(continueId, ctx.continueTarget, '', true);
	}

	return ctx.pendingBreaks;
}





// Preserves exit labels when converting break exits.
function preserveExitLabelsForPendingBreaks(
	host: StatementVisitorHost,
	exits: string[],
	exitLabels?: Record<string, string>,
): string[] {
	return exits.map((exit) => {
		const label = exitLabels?.[exit] ?? getFallthroughEdgeLabel(host, exit);

		if (!label) {
			return exit;
		}

		const mergeId = host.writer.addFlowNode('merge', '');
		host.writer.addEdge(exit, mergeId, label);
		return mergeId;
	});
}




// Merges loop exits with collected break exits.
function mergeLoopExitsWithBreaks(
	host: StatementVisitorHost,
	loopExits: string[],
	breakExits: string[],
	loopExitLabels?: Record<string, string>,
): { exits: string[]; exitLabels?: Record<string, string> } {
	const uniqueLoopExits = uniqueIds(loopExits);

	if (breakExits.length === 0) {
		return {
			exits: uniqueLoopExits,
			exitLabels: nonEmptyLabels(loopExitLabels),
		};
	}

	if (uniqueLoopExits.length === 0) {
		return { exits: breakExits };
	}

	const mergeId = host.writer.addFlowNode('merge', '');

	for (const loopExit of uniqueLoopExits) {
		host.writer.addEdge(
			loopExit,
			mergeId,
			loopExitLabels?.[loopExit] ?? getFallthroughEdgeLabel(host, loopExit),
		);
	}

	for (const breakExit of breakExits) {
		host.writer.addEdge(breakExit, mergeId, getFallthroughEdgeLabel(host, breakExit));
	}

	return { exits: [mergeId] };
}




// Resolves exit sources while preserving surviving labels.
function resolveExitSourcesWithLabels(
	host: StatementVisitorHost,
	sources: string[],
	sourceLabels?: Record<string, string>,
): { exits: string[]; exitLabels?: Record<string, string> } {
	const uniqueSources = uniqueIds(sources);
	const resolvedExits = host.resolveExitSources(uniqueSources, sourceLabels);

	if (resolvedExits.length > 1 || uniqueSources.length > 1) {
		return { exits: resolvedExits };
	}

	const survivingLabels = sourceLabels
		? Object.fromEntries(
				Object.entries(sourceLabels).filter(([sourceId]) =>
					uniqueSources.includes(sourceId),
				),
			)
		: undefined;

	return {
		exits: resolvedExits,
		exitLabels: nonEmptyLabels(survivingLabels),
	};
}






// Visits an if statement and merges branch exits.
export function visitIf(host: StatementVisitorHost, stmt: IfStatement): BuildResult {
	const elseStmt = stmt.getElseStatement();
	const conditionText = stmt.getExpression().getText();

	const decisionId = host.createDecisionNode(compactLabel(conditionText), conditionText);
	host.writer.updateNodeData(decisionId, { construct: 'if' });

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
		returnExits: unique(returnExits),
		throwExits: unique(throwExits),
	};
}




// Visits a while loop statement.
export function visitWhile(host: StatementVisitorHost, stmt: WhileStatement): BuildResult {
	const condText = stmt.getExpression().getText();
	const loopId = host.createLoopNode(compactLabel(condText), condText);

	host.writer.updateNodeData(loopId, { construct: 'while' });

	return visitLoopWithContext(host, loopId, () =>
		visitStandardLoop(host, loopId, stmt.getStatement(), 'yes'),
	);
}




// Visits a do-while loop statement.
export function visitDoWhile(host: StatementVisitorHost, stmt: DoStatement): BuildResult {
	const condText = stmt.getExpression().getText();
	const loopId = host.createLoopNode(compactLabel(condText), condText);

	host.writer.updateNodeData(loopId, { construct: 'do-while' });

	const ctx = host.pushLoopContext(loopId);

	try {
		const body = host.visitBranch(stmt.getStatement());

		if (body.entry) {
			
			
			for (const exit of body.exits) {
				host.writer.addEdge(exit, loopId, getFallthroughEdgeLabel(host, exit), false);
			}

			host.writer.addEdge(loopId, body.entry, 'yes', true);
		} else {
			
			host.writer.addEdge(loopId, loopId, 'yes', true);
		}

		const breakExits = wirePendingBreaksAndContinues(host, ctx);
		const mergedExits = mergeLoopExitsWithBreaks(host, [loopId], breakExits, {
			[loopId]: 'no',
		});

		return {
			entry: body.entry ?? loopId,
			exits: mergedExits.exits,

			
			
			exitLabels: mergedExits.exitLabels,

			returnExits: unique(body.returnExits),
			throwExits: unique(body.throwExits),
		};
	} finally {
		host.popContext();
	}
}




// Visits a for loop statement.
export function visitFor(host: StatementVisitorHost, stmt: ForStatement): BuildResult {
	const initText = stmt.getInitializer()?.getText() ?? '';
	const condText = stmt.getCondition()?.getText() ?? '';
	const incText = stmt.getIncrementor()?.getText() ?? '';
	const headerText = `${initText}; ${condText}; ${incText}`;

	const loopId = host.createLoopNode(
		compactLabel(condText || 'for'),
		condText || 'for',
	);

	host.writer.updateNodeData(loopId, {
		construct: 'for',
		forHeader: headerText,
	});

	return visitLoopWithContext(host, loopId, () =>
		visitStandardLoop(host, loopId, stmt.getStatement(), 'yes'),
	);
}




// Visits a for-of loop statement.
export function visitForOf(host: StatementVisitorHost, stmt: ForOfStatement): BuildResult {
	return visitIteratorLoop(host, stmt, 'for-of');
}




// Visits a for-in loop statement.
export function visitForIn(host: StatementVisitorHost, stmt: ForInStatement): BuildResult {
	return visitIteratorLoop(host, stmt, 'for-in');
}



type ContextSnapshot = Map<
	ControlContext,
	{ breaks: Set<string>; continues: Set<string> }
>;




// Takes a snapshot of pending breaks and continues.
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




// Computes pending control-flow changes against a snapshot.
function diffPending(host: StatementVisitorHost, before: ContextSnapshot): RedirectEntry[] {
	const entries: RedirectEntry[] = [];

	for (const ctx of host.getContextStack()) {
		const beforeForCtx = before.get(ctx) ?? {
			breaks: new Set<string>(),
			continues: new Set<string>(),
		};

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




// Removes a redirected node from a context queue.
function removeFromContext(
	ctx: ControlContext,
	kind: 'break' | 'continue',
	nodeId: string,
): void {
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





// Splices a finally-block copy into outgoing sources.
function spliceFinallyCopy(
	host: StatementVisitorHost,
	finallyBlock: MorphNode,
	sources: string[],
): {
	exits: string[];
	exitLabels?: Record<string, string>;
	returnExits: string[];
	throwExits: string[];
} {
	if (sources.length === 0) {
		return { exits: [], returnExits: [], throwExits: [] };
	}

	const copy = host.visitBranch(finallyBlock);

	if (!copy.entry) {
		return { exits: sources, returnExits: [], throwExits: [] };
	}

	if (sources.length === 1) {
		const label = getFallthroughEdgeLabel(host, sources[0]) ?? 'finally';
		host.writer.addEdge(sources[0], copy.entry, label, false);
	} else {
		const mergeId = host.writer.addFlowNode('merge', '');

		for (const src of sources) {
			host.writer.addEdge(src, mergeId, getFallthroughEdgeLabel(host, src));
		}

		host.writer.addEdge(mergeId, copy.entry, 'finally', false);
	}

	const resolvedExits = host.resolveExitSources(copy.exits);
	const resolvedExitLabels = copy.exitLabels
		? Object.fromEntries(
				Object.entries(copy.exitLabels).filter(([exitId]) =>
					resolvedExits.includes(exitId),
				),
			)
		: undefined;

	return {
		exits: resolvedExits,
		exitLabels: nonEmptyLabels(resolvedExitLabels),
		returnExits: [...copy.returnExits],
		throwExits: [...copy.throwExits],
	};
}





// Visits a try statement including catch and finally flow.
export function visitTry(host: StatementVisitorHost, stmt: TryStatement): BuildResult {
	const finallyBlock = stmt.getFinallyBlock();
	const beforeTrySnapshot = snapshotPending(host);

	const tryResult = host.visitBranch(stmt.getTryBlock());
	const tryEntryId = tryResult.entry;

	const trySuccessExits = tryResult.entry
		? host.resolveExitSources(tryResult.exits)
		: [];

	const catchClause = stmt.getCatchClause();
	const shouldMaterializeCatch = Boolean(catchClause && tryResult.throwExits.length > 0);
	const catchResult = shouldMaterializeCatch
		? host.visitBranch(catchClause!.getBlock())
		: undefined;

	const catchSuccessExits: string[] = [];

	if (shouldMaterializeCatch && catchResult?.entry) {
		for (const throwId of tryResult.throwExits) {
			host.writer.addEdge(throwId, catchResult.entry, 'exception', false);
		}

		catchSuccessExits.push(...host.resolveExitSources(catchResult.exits));
	}

	const redirects = finallyBlock ? diffPending(host, beforeTrySnapshot) : [];

	if (finallyBlock && redirects.length > 0) {
		for (const redirect of redirects) {
			removeFromContext(redirect.ctx, redirect.kind, redirect.nodeId);
		}
	}

	const normalSources = unique([...trySuccessExits, ...catchSuccessExits]);

	const returnSources = [
		...tryResult.returnExits,
		...(catchResult?.returnExits ?? []),
	];

	const throwSources = [
		...(shouldMaterializeCatch ? [] : tryResult.throwExits),
		...(catchResult?.throwExits ?? []),
	];

	if (!finallyBlock) {
		const normalExits = host.resolveExitSources(normalSources);
		const tryOwnerId = tryEntryId ?? catchResult?.entry;

		return {
			entry: tryEntryId,
			entryEdgeLabel: tryEntryId ? 'try' : undefined,
			exits: tryOwnerId
				? createTryExitBoundary(host, tryOwnerId, normalExits)
				: normalExits,
			returnExits: unique(returnSources),
			throwExits: unique(throwSources),
		};
	}

	const aggregateExits: string[] = [];
	const aggregateExitLabels: Record<string, string> = {};
	const aggregateReturnExits: string[] = [];
	const aggregateThrowExits: string[] = [];
	let fallbackEntryId: string | undefined;

	if (normalSources.length > 0) {
		const sliced = spliceFinallyCopy(host, finallyBlock, normalSources);

		aggregateExits.push(...sliced.exits);
		mergeExitLabels(aggregateExitLabels, sliced.exitLabels);
		aggregateReturnExits.push(...sliced.returnExits);
		aggregateThrowExits.push(...sliced.throwExits);
	} else if (!tryEntryId && returnSources.length === 0 && throwSources.length === 0) {
		
		const directFinally = host.visitBranch(finallyBlock);

		if (directFinally.entry) {
			fallbackEntryId = directFinally.entry;
			aggregateExits.push(...host.resolveExitSources(directFinally.exits));
			aggregateReturnExits.push(...directFinally.returnExits);
			aggregateThrowExits.push(...directFinally.throwExits);
		}
	}

	if (returnSources.length > 0) {
		for (const returnNodeId of unique(returnSources)) {
			const returnSourceText = markReturnAsPending(host, returnNodeId);
			const sliced = spliceFinallyCopy(host, finallyBlock, [returnNodeId]);

			if (sliced.exits.length > 0) {
				const deferredReturnNodeId = createDeferredReturnNode(host, returnSourceText);

				for (const exit of sliced.exits) {
					host.writer.addEdge(
						exit,
						deferredReturnNodeId,
						sliced.exitLabels?.[exit] ?? getFallthroughEdgeLabel(host, exit),
					);
				}

				aggregateReturnExits.push(deferredReturnNodeId);
			}

			aggregateReturnExits.push(...sliced.returnExits);
			aggregateThrowExits.push(...sliced.throwExits);
		}
	}

	if (throwSources.length > 0) {
		const sliced = spliceFinallyCopy(host, finallyBlock, throwSources);

		aggregateThrowExits.push(...sliced.exits);
		aggregateReturnExits.push(...sliced.returnExits);
		aggregateThrowExits.push(...sliced.throwExits);
	}

	const continueGroups = new Map<LoopContext, string[]>();
	const breakGroups = new Map<ControlContext, string[]>();

	for (const redirect of redirects) {
		if (redirect.kind === 'continue' && redirect.ctx.kind === 'loop') {
			const list = continueGroups.get(redirect.ctx) ?? [];
			list.push(redirect.nodeId);
			continueGroups.set(redirect.ctx, list);
		} else if (redirect.kind === 'break') {
			const list = breakGroups.get(redirect.ctx) ?? [];
			list.push(redirect.nodeId);
			breakGroups.set(redirect.ctx, list);
		}
	}

  for (const [loopCtx, sources] of continueGroups) {
    const sliced = spliceFinallyCopy(host, finallyBlock, sources);

    for (const exit of sliced.exits) {
      const label =
        sliced.exitLabels?.[exit] ??
        getFallthroughEdgeLabel(host, exit) ??
        '';

      host.writer.addEdge(exit, loopCtx.continueTarget, label, true);
    }

    aggregateReturnExits.push(...sliced.returnExits);
    aggregateThrowExits.push(...sliced.throwExits);
  }

  for (const [breakCtx, sources] of breakGroups) {
    const sliced = spliceFinallyCopy(host, finallyBlock, sources);

    const breakExits = preserveExitLabelsForPendingBreaks(
      host,
      sliced.exits,
      sliced.exitLabels,
    );

    for (const exit of breakExits) {
      breakCtx.pendingBreaks.push(exit);
    }

    aggregateReturnExits.push(...sliced.returnExits);
    aggregateThrowExits.push(...sliced.throwExits);
  }

	const resolvedAggregateExits = host.resolveExitSources(aggregateExits);
	const resolvedAggregateExitLabels = Object.fromEntries(
		Object.entries(aggregateExitLabels).filter(([exitId]) =>
			resolvedAggregateExits.includes(exitId),
		),
	);

	const statementEntry = tryEntryId ?? fallbackEntryId;
	const tryOwnerId = statementEntry ?? catchResult?.entry;

	return {
		entry: statementEntry,
		entryEdgeLabel: statementEntry ? 'try' : undefined,
		exits: tryOwnerId
			? createTryExitBoundary(host, tryOwnerId, resolvedAggregateExits)
			: resolvedAggregateExits,
		exitLabels: nonEmptyLabels(resolvedAggregateExitLabels),
		returnExits: unique(aggregateReturnExits),
		throwExits: unique(aggregateThrowExits),
	};
}






// Visits a loop with temporary loop context management.
function visitLoopWithContext(
	host: StatementVisitorHost,
	loopId: string,
	visitBody: () => BuildResult,
): BuildResult {
	const ctx = host.pushLoopContext(loopId);

	try {
		const result = visitBody();
		const breakExits = wirePendingBreaksAndContinues(host, ctx);
		const mergedExits = mergeLoopExitsWithBreaks(
			host,
			result.exits,
			breakExits,
			result.exitLabels,
		);

		return {
			entry: result.entry,
			exits: mergedExits.exits,
			exitLabels: mergedExits.exitLabels,
			returnExits: result.returnExits,
			throwExits: result.throwExits,
		};
	} finally {
		host.popContext();
	}
}




// Visits a standard loop body and wires loop-back edges.
function visitStandardLoop(
	host: StatementVisitorHost,
	loopId: string,
	loopBranch: MorphNode,
	bodyLabel = 'yes',
	exitLabel?: string,
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
		exitLabels: exitLabel ? { [loopId]: exitLabel } : undefined,
		returnExits: unique(body.returnExits),
		throwExits: unique(body.throwExits),
	};
}




// Visits a for-of or for-in iterator loop.
function visitIteratorLoop(
	host: StatementVisitorHost,
	stmt: ForOfStatement | ForInStatement,
	construct: 'for-of' | 'for-in',
): BuildResult {
	const iterableText = stmt.getExpression().getText();
	const bindingText = stmt.getInitializer()?.getText() ?? '';

	const loopId = host.createLoopNode(compactLabel(iterableText), iterableText);

	host.writer.updateNodeData(loopId, {
		construct,
		forOfBinding: bindingText,
	});

	return visitLoopWithContext(host, loopId, () =>
		visitStandardLoop(host, loopId, stmt.getStatement(), 'next', 'done'),
	);
}