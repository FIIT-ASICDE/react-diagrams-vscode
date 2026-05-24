import assert from 'node:assert/strict';
import test from 'node:test';

import {
	assertNoDirectEdge,
	buildGraphFromBody,
	edgeLabelsFrom,
	findBranchEdge,
	hasPath,
	nodeByConstruct,
	nodeByText,
	nodeText,
	outgoingFrom,
	reachesTargetBeforeStop,
} from './helpers';

test('diagramGen creates while loop with body and exit edges', async () => {
	const graph = await buildGraphFromBody(`
		while (i < 10) {
			i++;
		}
		done();
	`);

	const loop = graph.nodes.find((n: any) => n.type === 'loop' && n.data?.construct === 'while');
	assert.ok(loop);
	assert.equal(loop.data?.sourceText, 'i < 10');

	const outgoing = outgoingFrom(graph, loop.id);
	assert.ok(outgoing.some((e: any) => e.label === 'yes'));
	assert.ok(outgoing.some((e: any) => e.label === 'no'));
});

test('diagramGen while loop has body back edge', async () => {
	const graph = await buildGraphFromBody(`
		while (i < n) {
			i++;
		}
		after();
	`);

	const loop = graph.nodes.find((n: any) => n.type === 'loop' && n.data?.construct === 'while');
	const body = nodeByText(graph, 'i++');
	const after = nodeByText(graph, 'after()');

	assert.ok(loop);
	assert.ok(body);
	assert.ok(after);

	const labels = edgeLabelsFrom(graph, loop.id);
	assert.ok(labels.includes('yes'));
	assert.ok(labels.includes('no'));
	assert.ok(outgoingFrom(graph, body.id).some((edge: any) => String(edge.target) === String(loop.id) || edge.type === 'back'));
	assert.ok(hasPath(graph, loop.id, after.id));
});

test('diagramGen while break and normal exit join before post-loop decision', async () => {
	const graph = await buildGraphFromBody(`
		while (i < n) {
			if (stop) break;
			i++;
		}
		if (i === 0) return 'empty';
		return i;
	`);

	const loop = graph.nodes.find((n: any) => n.type === 'loop' && n.data?.construct === 'while');
	const breakNode = nodeByConstruct(graph, 'break');
	const postDecision = graph.nodes.find((n: any) => n.data?.sourceText === 'i === 0');

	assert.ok(loop);
	assert.ok(breakNode);
	assert.ok(postDecision);

	assertNoDirectEdge(graph, breakNode.id, postDecision.id, 'break must not go directly to post-loop decision');
	assertNoDirectEdge(graph, loop.id, postDecision.id, 'loop no must not go directly to post-loop decision');

	const merge = graph.nodes.find((n: any) => n.type === 'merge' && hasPath(graph, breakNode.id, n.id) && hasPath(graph, loop.id, n.id) && hasPath(graph, n.id, postDecision.id));
	assert.ok(merge);
	assert.ok(outgoingFrom(graph, loop.id).some((edge: any) => String(edge.target) === String(merge.id) && String(edge.label ?? '') === 'no'));
});

test('diagramGen while continue goes to loop target before post-loop flow', async () => {
	const graph = await buildGraphFromBody(`
		while (i < n) {
			if (skip) continue;
			work();
		}
		after();
	`);

	const loop = graph.nodes.find((n: any) => n.type === 'loop' && n.data?.construct === 'while');
	const cont = nodeByConstruct(graph, 'continue');
	const work = nodeByText(graph, 'work()');
	const after = nodeByText(graph, 'after()');

	assert.ok(loop);
	assert.ok(cont);
	assert.ok(work);
	assert.ok(after);

	assert.ok(hasPath(graph, cont.id, loop.id));
	assert.equal(reachesTargetBeforeStop(graph, cont.id, work.id, new Set([String(loop.id)])), false);
	assert.equal(reachesTargetBeforeStop(graph, cont.id, after.id, new Set([String(loop.id)])), false);
});

test('diagramGen do-while body comes before condition', async () => {
	const graph = await buildGraphFromBody(`
		do {
			i++;
		} while (i < n);
		after();
	`);

	const bodyNode = graph.nodes.find((n: any) => String(n.data?.sourceText ?? '').includes('i++'));
	const loopNode = graph.nodes.find((n: any) => n.type === 'loop' && n.data?.construct === 'do-while');
	const afterNode = graph.nodes.find((n: any) => String(n.data?.sourceText ?? '').includes('after()'));

	assert.ok(bodyNode);
	assert.ok(loopNode);
	assert.ok(afterNode);
	assert.ok(graph.edges.some((e: any) => String(e.source) === String(bodyNode.id) && String(e.target) === String(loopNode.id)));
	assert.ok(graph.edges.some((e: any) => String(e.source) === String(loopNode.id) && String(e.target) === String(bodyNode.id) && String(e.label ?? '') === 'yes' && e.type === 'back'));
	assert.ok(graph.edges.some((e: any) => String(e.source) === String(loopNode.id) && String(e.target) === String(afterNode.id) && String(e.label ?? '') === 'no'));
});

test('diagramGen do-while break joins normal exit before after', async () => {
	const graph = await buildGraphFromBody(`
		do {
			if (stop) break;
			work();
		} while (again);
		after();
	`);

	const loop = graph.nodes.find((n: any) => n.type === 'loop' && n.data?.construct === 'do-while');
	const breakNode = nodeByConstruct(graph, 'break');
	const after = nodeByText(graph, 'after()');

	assert.ok(loop);
	assert.ok(breakNode);
	assert.ok(after);

	const merge = graph.nodes.find((n: any) => n.type === 'merge' && hasPath(graph, loop.id, n.id) && hasPath(graph, breakNode.id, n.id) && hasPath(graph, n.id, after.id));
	assert.ok(merge);
});

test('diagramGen creates for-of loop metadata', async () => {
	const graph = await buildGraphFromBody(`
		for (const item of items) {
			use(item);
		}
	`);

	const loop = graph.nodes.find((n: any) => n.type === 'loop' && n.data?.construct === 'for-of');
	assert.ok(loop);
	assert.equal(loop.data?.sourceText, 'items');
	assert.equal(loop.data?.forOfBinding, 'const item');
});

test('diagramGen for loop stores header metadata', async () => {
	const graph = await buildGraphFromBody(`
		for (let i = 0; i < n; i++) {
			work(i);
		}
		after();
	`);

	const loop = graph.nodes.find((n: any) => n.type === 'loop' && n.data?.construct === 'for');
	assert.ok(loop);
	assert.match(String(loop.data?.forHeader ?? ''), /let i = 0/);
	assert.match(String(loop.data?.forHeader ?? ''), /i < n/);
	assert.match(String(loop.data?.forHeader ?? ''), /i\+\+/);
});

test('diagramGen nested loop inner break reaches afterInner', async () => {
	const graph = await buildGraphFromBody(`
		for (const group of groups) {
			for (const item of group.items) {
				if (item.stop) break;
			}
			afterInner();
		}
		afterOuter();
	`);

	const breakNode = nodeByConstruct(graph, 'break');
	const afterInner = nodeByText(graph, 'afterInner()');
	const afterOuter = nodeByText(graph, 'afterOuter()');

	assert.ok(breakNode);
	assert.ok(afterInner);
	assert.ok(afterOuter);
	assert.ok(hasPath(graph, breakNode.id, afterInner.id));
	assert.ok(hasPath(graph, afterInner.id, afterOuter.id));
});

test('diagramGen labeled break outer skips afterInner and reaches afterOuter', async () => {
	const graph = await buildGraphFromBody(`
		outer:
		for (const group of groups) {
			for (const item of group.items) {
				if (item.stop) break outer;
			}
			afterInner();
		}
		afterOuter();
	`);

	const breakOuter = graph.nodes.find((n: any) => nodeText(n).includes('break outer'));
	const afterInner = nodeByText(graph, 'afterInner()');
	const afterOuter = nodeByText(graph, 'afterOuter()');

	assert.ok(breakOuter);
	assert.ok(afterInner);
	assert.ok(afterOuter);
	assert.equal(hasPath(graph, breakOuter.id, afterInner.id), false);
	assert.ok(hasPath(graph, breakOuter.id, afterOuter.id));
});

test('diagramGen labeled continue outer targets outer loop before inner use', async () => {
	const graph = await buildGraphFromBody(`
		outer:
		for (const group of groups) {
			for (const item of group.items) {
				if (item.skip) continue outer;
				use(item);
			}
		}
		done();
	`);

	const contOuter = graph.nodes.find((n: any) => nodeText(n).includes('continue outer'));
	const use = nodeByText(graph, 'use(item)');
	const outerLoop = graph.nodes.find((n: any) => n.type === 'loop' && n.data?.loopLabel === 'outer');

	assert.ok(contOuter);
	assert.ok(use);
	assert.ok(outerLoop);
	assert.ok(hasPath(graph, contOuter.id, outerLoop.id));
	assert.equal(reachesTargetBeforeStop(graph, contOuter.id, use.id, new Set([String(outerLoop.id)])), false);
});
