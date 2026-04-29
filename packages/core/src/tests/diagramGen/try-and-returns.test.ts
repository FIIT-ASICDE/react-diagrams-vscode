import assert from 'node:assert/strict';
import test from 'node:test';

import {
	buildGraphFromBody,
	findBranchEdge,
	hasPath,
	incomingTo,
	nodeByConstruct,
	nodeByText,
	nodesByText,
	outgoingFrom,
	reachesTargetBeforeStop,
	targetNode,
} from './helpers';

test('diagramGen represents try as try-labeled edge and no try node', async () => {
	const graph = await buildGraphFromBody(`
		try {
			throw new Error('boom');
		} catch (err) {
			handle(err);
		}
		after();
	`);

	const throwNode = nodeByText(graph, "throw new Error('boom')");
	const handle = nodeByText(graph, 'handle(err)');

	assert.ok(throwNode);
	assert.ok(handle);
	assert.equal(graph.nodes.some((n: any) => n.data?.construct === 'try'), false);
	assert.ok(incomingTo(graph, throwNode.id).some((edge: any) => String(edge.label ?? '') === 'try'));
	assert.ok(incomingTo(graph, handle.id).some((edge: any) => String(edge.label ?? '') === 'exception'));
});

test('diagramGen try/finally without catch has no exception edge', async () => {
	const graph = await buildGraphFromBody(`
		try {
			work();
		} finally {
			cleanup();
		}
		after();
	`);

	const work = nodeByText(graph, 'work()');
	const cleanup = nodeByText(graph, 'cleanup()');
	const after = nodeByText(graph, 'after()');

	assert.ok(work);
	assert.ok(cleanup);
	assert.ok(after);
	assert.equal(graph.edges.some((edge: any) => String(edge.label ?? '') === 'exception'), false);
	assert.ok(hasPath(graph, work.id, cleanup.id));
	assert.ok(hasPath(graph, cleanup.id, after.id));
});

test('diagramGen explicit throw in try routes to catch', async () => {
	const graph = await buildGraphFromBody(`
		try {
			throw new Error('boom');
		} catch (err) {
			handle(err);
		}
		after();
	`);

	const throwNode = nodeByText(graph, "throw new Error('boom')");
	const handle = nodeByText(graph, 'handle(err)');
	const after = nodeByText(graph, 'after()');

	assert.ok(throwNode);
	assert.ok(handle);
	assert.ok(after);
	assert.ok(hasPath(graph, throwNode.id, handle.id));
	assert.ok(hasPath(graph, handle.id, after.id));
});

test('diagramGen catch is not materialized when there is no modeled exception path', async () => {
	const graph = await buildGraphFromBody(`
		try {
			const value = 1;
		} catch (err) {
			handle(err);
		}
		after();
	`);

	const value = nodeByText(graph, 'const value = 1');
	const handle = nodeByText(graph, 'handle(err)');
	const after = nodeByText(graph, 'after()');

	assert.ok(value);
	assert.ok(after);
	assert.equal(handle, undefined);
	assert.equal(graph.edges.some((edge: any) => String(edge.label ?? '') === 'exception'), false);
});

test('diagramGen pending return from try executes finally before materialized return', async () => {
	const graph = await buildGraphFromBody(`
		try {
			if (!input) return 'missing';
			work();
		} finally {
			cleanup();
		}
		after();
		return 'done';
	`);

	const pending = nodeByConstruct(graph, 'pending-return');
	const cleanupNodes = nodesByText(graph, 'cleanup()');
	const returnMissing = graph.nodes.find((n: any) => n.data?.construct === 'return' && String(n?.data?.sourceText ?? '').includes("return 'missing'"));
	const after = nodeByText(graph, 'after()');

	assert.ok(pending);
	assert.ok(cleanupNodes.length > 0);
	assert.ok(returnMissing);
	assert.ok(after);
	assert.ok(cleanupNodes.some((cleanup: any) => hasPath(graph, pending.id, cleanup.id) && hasPath(graph, cleanup.id, returnMissing.id)));
	assert.equal(hasPath(graph, returnMissing.id, after.id), false);
});

test('diagramGen finally unconditional return overrides pending try return', async () => {
	const graph = await buildGraphFromBody(`
		try {
			return 'try-return';
		} finally {
			return 'finally-return';
		}
	`);

	const finallyReturn = graph.nodes.find((n: any) => String(n?.data?.sourceText ?? '').includes("return 'finally-return'"));
	const tryReturn = graph.nodes.find((n: any) => String(n?.data?.sourceText ?? '').includes("return 'try-return'") && n.data?.construct === 'return');

	assert.ok(finallyReturn);
	assert.ok(outgoingFrom(graph, finallyReturn.id).some((edge: any) => targetNode(graph, edge)?.type === 'end'));
	if (tryReturn) {
		assert.equal(hasPath(graph, tryReturn.id, finallyReturn.id), false);
	}
});

test('diagramGen finally conditional return overrides only yes branch', async () => {
	const graph = await buildGraphFromBody(`
		try {
			return 'try-return';
		} finally {
			if (flag) return 'finally-return';
		}
	`);

	const flag = graph.nodes.find((n: any) => n.data?.sourceText === 'flag');
	const finallyReturn = nodeByText(graph, "return 'finally-return'");
	const tryReturn = nodeByText(graph, "return 'try-return'");

	assert.ok(flag);
	assert.ok(finallyReturn);
	assert.ok(tryReturn);

	const yes = findBranchEdge(graph, flag.id, ['yes']);
	const no = findBranchEdge(graph, flag.id, ['no']);

	assert.ok(yes);
	assert.ok(no);
	assert.ok(hasPath(graph, String(yes.target), finallyReturn.id));
	assert.ok(hasPath(graph, String(no.target), tryReturn.id));
});

test('diagramGen catch return is deferred until after finally cleanup', async () => {
	const graph = await buildGraphFromBody(`
		try {
			throw new Error('boom');
		} catch (err) {
			if (strict) return 'error';
		} finally {
			cleanup();
		}
		after();
		return 'ok';
	`);

	const strict = graph.nodes.find((n: any) => n.data?.sourceText === 'strict');
	const cleanupNodes = nodesByText(graph, 'cleanup()');
	const returnError = nodeByText(graph, "return 'error'");
	const after = nodeByText(graph, 'after()');

	assert.ok(strict);
	assert.ok(cleanupNodes.length > 0);
	assert.ok(returnError);
	assert.ok(after);

	const yes = findBranchEdge(graph, strict.id, ['yes']);
	const no = findBranchEdge(graph, strict.id, ['no']);

	assert.ok(yes);
	assert.ok(no);
	assert.ok(cleanupNodes.some((cleanup: any) => hasPath(graph, String(yes.target), cleanup.id) && hasPath(graph, cleanup.id, returnError.id)));
	assert.ok(cleanupNodes.some((cleanup: any) => hasPath(graph, String(no.target), cleanup.id) && hasPath(graph, cleanup.id, after.id)));
	assert.equal(hasPath(graph, returnError.id, after.id), false);
});

test('diagramGen catch guard keeps explicit no edge and preserves branch semantics', async () => {
	const graph = await buildGraphFromBody(`
		try {
			throw new Error('boom');
		} catch (err) {
			if (strict) return 'error';
		} finally {
			cleanup();
		}
		after();
	`);

	const strict = graph.nodes.find((n: any) => n.data?.sourceText === 'strict');
	const cleanup = nodeByText(graph, 'cleanup()');
	const after = nodeByText(graph, 'after()');

	assert.ok(strict);
	assert.ok(cleanup);
	assert.ok(after);

	const yes = findBranchEdge(graph, strict.id, ['yes']);
	const no = findBranchEdge(graph, strict.id, ['no']);

	assert.ok(yes);
	assert.ok(no);
	assert.equal(hasPath(graph, String(yes.target), after.id), false);
	assert.ok(hasPath(graph, String(no.target), cleanup.id));
	assert.ok(hasPath(graph, String(no.target), after.id));
});

test('diagramGen keeps no label when implicit false branch enters merge', async () => {
	const graph = await buildGraphFromBody(`
		try {
			if (shouldThrow) {
				throw new Error('boom');
			}
			work();
		} catch (err) {
			if (strict) return 'error';
		}
		after();
	`);

	const strict = graph.nodes.find((n: any) => n.data?.sourceText === 'strict');
	const after = nodeByText(graph, 'after()');

	assert.ok(strict);
	assert.ok(after);

	const noToMerge = outgoingFrom(graph, strict.id).find((edge: any) => String(edge.label ?? '') === 'no' && targetNode(graph, edge)?.type === 'merge');
	assert.ok(noToMerge);
	assert.ok(hasPath(graph, String(noToMerge.target), after.id));
});

test('diagramGen continue inside try/finally runs finally before continuing', async () => {
	const graph = await buildGraphFromBody(`
		for (const item of items) {
			try {
				if (!item) continue;
			} finally {
				cleanup(item);
			}
			use(item);
		}
	`);

	const cont = nodeByConstruct(graph, 'continue');
	const cleanupNodes = nodesByText(graph, 'cleanup(item)');
	const use = nodeByText(graph, 'use(item)');
	const loop = graph.nodes.find((n: any) => n.type === 'loop' && n.data?.construct === 'for-of');

	assert.ok(cont);
	assert.ok(cleanupNodes.length > 0);
	assert.ok(use);
	assert.ok(loop);
	assert.ok(cleanupNodes.some((cleanup: any) => hasPath(graph, cont.id, cleanup.id)));
	assert.equal(outgoingFrom(graph, cont.id).some((edge: any) => String(edge.target) === String(loop.id) || edge.type === 'back'), false);
	assert.equal(reachesTargetBeforeStop(graph, cont.id, use.id, new Set([String(loop.id)])), false);
});

test('diagramGen labeled continue outer inside try/finally runs finally before outer continue', async () => {
	const graph = await buildGraphFromBody(`
		outer:
		for (const group of groups) {
			for (const item of group.items) {
				try {
					if (item.blocked) continue outer;
				} finally {
					cleanup(item);
				}
				use(item);
			}
		}
	`);

	const contOuter = graph.nodes.find((n: any) => String(n?.data?.sourceText ?? '').includes('continue outer'));
	const cleanupNodes = nodesByText(graph, 'cleanup(item)');
	const outerLoop = graph.nodes.find((n: any) => n.type === 'loop' && n.data?.loopLabel === 'outer');
	const use = nodeByText(graph, 'use(item)');

	assert.ok(contOuter);
	assert.ok(cleanupNodes.length > 0);
	assert.ok(outerLoop);
	assert.ok(use);
	assert.ok(cleanupNodes.some((cleanup: any) => hasPath(graph, contOuter.id, cleanup.id) && hasPath(graph, cleanup.id, outerLoop.id)));
	assert.equal(reachesTargetBeforeStop(graph, contOuter.id, use.id, new Set([String(outerLoop.id)])), false);
});

test('diagramGen finally return overrides continue path', async () => {
	const graph = await buildGraphFromBody(`
		for (const item of items) {
			try {
				if (!item) continue;
			} finally {
				if (stop) return 'stopped';
			}
			use(item);
		}
	`);

	const cont = nodeByConstruct(graph, 'continue');
	const stop = graph.nodes.find((n: any) => n.data?.sourceText === 'stop');
	const stopped = nodeByText(graph, "return 'stopped'");
	const use = nodeByText(graph, 'use(item)');

	assert.ok(cont);
	assert.ok(stop);
	assert.ok(stopped);
	assert.ok(use);
	assert.ok(hasPath(graph, cont.id, stop.id));
	assert.ok(hasPath(graph, stop.id, stopped.id));
	assert.equal(hasPath(graph, stopped.id, use.id), false);
});

test('diagramGen continue in catch runs finally before continuing', async () => {
	const graph = await buildGraphFromBody(`
		for (const item of items) {
			try {
				if (item.fail) {
					throw new Error('boom');
				}
				work(item);
			} catch (err) {
				if (item.skip) {
					continue;
				}
				recover(err);
			} finally {
				cleanup(item);
			}
			use(item);
		}
	`);

	const cont = nodeByConstruct(graph, 'continue');
	const cleanupNodes = nodesByText(graph, 'cleanup(item)');
	const use = nodeByText(graph, 'use(item)');
	const loop = graph.nodes.find((n: any) => n.type === 'loop' && n.data?.construct === 'for-of');

	assert.ok(cont);
	assert.ok(cleanupNodes.length > 0);
	assert.ok(use);
	assert.ok(loop);
	assert.ok(cleanupNodes.some((cleanup: any) => hasPath(graph, cont.id, cleanup.id)));
	assert.equal(reachesTargetBeforeStop(graph, cont.id, use.id, new Set([String(loop.id)])), false);
	assert.ok(cleanupNodes.some((cleanup: any) => hasPath(graph, cleanup.id, use.id)));
});

test('diagramGen loop continue guard has explicit no edge to work', async () => {
	const graph = await buildGraphFromBody(`
		while (i < n) {
			if (skip) continue;
			work();
		}
	`);

	const skip = graph.nodes.find((n: any) => n.data?.sourceText === 'skip');
	const work = nodeByText(graph, 'work()');
	const loop = graph.nodes.find((n: any) => n.type === 'loop' && n.data?.construct === 'while');

	assert.ok(skip);
	assert.ok(work);
	assert.ok(loop);

	const yes = findBranchEdge(graph, skip.id, ['yes']);
	const no = findBranchEdge(graph, skip.id, ['no']);

	assert.ok(yes);
	assert.ok(no);
	assert.ok(hasPath(graph, String(no.target), work.id));
	assert.equal(reachesTargetBeforeStop(graph, String(yes.target), String(work.id), new Set([String(loop.id)])), false);
});
