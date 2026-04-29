import assert from 'node:assert/strict';
import test from 'node:test';

import {
	buildGraphFromBody,
	edgeLabelsFrom,
	findBranchEdge,
	hasPath,
	nodeByConstruct,
	nodeByText,
	nodeText,
	nodesByConstruct,
	outgoingFrom,
	targetNode,
} from './helpers';

test('diagramGen creates if decision with yes/no edges', async () => {
	const graph = await buildGraphFromBody(`
		if (flag) {
			doYes();
		} else {
			doNo();
		}
		done();
	`);

	const decision = graph.nodes.find((n: any) => n.type === 'decision' && n.data?.sourceText === 'flag');
	assert.ok(decision);

	const labels = edgeLabelsFrom(graph, decision.id);
	assert.ok(labels.includes('yes'));
	assert.ok(labels.includes('no'));
});

test('diagramGen if/else creates branches and continuation is reachable', async () => {
	const graph = await buildGraphFromBody(`
		if (flag) {
			a();
		} else {
			b();
		}
		after();
	`);

	const decision = graph.nodes.find((n: any) => n.data?.sourceText === 'flag');
	const a = nodeByText(graph, 'a()');
	const b = nodeByText(graph, 'b()');
	const after = nodeByText(graph, 'after()');

	assert.ok(decision);
	assert.ok(a);
	assert.ok(b);
	assert.ok(after);

	const labels = edgeLabelsFrom(graph, decision.id);
	assert.ok(labels.includes('yes'));
	assert.ok(labels.includes('no'));
	assert.ok(hasPath(graph, a.id, after.id));
	assert.ok(hasPath(graph, b.id, after.id));
});

test('diagramGen if without else keeps false/post-flow path reachable', async () => {
	const graph = await buildGraphFromBody(`
		if (flag) {
			a();
		}
		after();
	`);

	const decision = graph.nodes.find((n: any) => n.data?.sourceText === 'flag');
	const a = nodeByText(graph, 'a()');
	const after = nodeByText(graph, 'after()');

	assert.ok(decision);
	assert.ok(a);
	assert.ok(after);

	const labels = edgeLabelsFrom(graph, decision.id);
	assert.ok(labels.includes('yes'));
	assert.ok(labels.includes('no'));

	const noToMerge = outgoingFrom(graph, decision.id).find(
		(edge: any) => String(edge.label ?? '') === 'no' && targetNode(graph, edge)?.type === 'merge',
	);
	assert.ok(noToMerge);
	assert.ok(hasPath(graph, a.id, after.id));
	assert.ok(hasPath(graph, decision.id, after.id));
});

test('diagramGen guard return keeps explicit no edge to continuation', async () => {
	const graph = await buildGraphFromBody(`
		if (!input) return 'missing';
		work();
	`);

	const decision = graph.nodes.find((n: any) => n.data?.sourceText === '!input');
	const returnMissing = nodeByText(graph, "return 'missing'");
	const work = nodeByText(graph, 'work()');

	assert.ok(decision);
	assert.ok(returnMissing);
	assert.ok(work);

	const yes = findBranchEdge(graph, decision.id, ['yes']);
	const no = findBranchEdge(graph, decision.id, ['no']);

	assert.ok(yes);
	assert.ok(no);
	assert.ok(hasPath(graph, String(yes.target), returnMissing.id));
	assert.ok(hasPath(graph, String(no.target), work.id));
});

test('diagramGen nested if keeps inner decision under outer branch', async () => {
	const graph = await buildGraphFromBody(`
		if (a) {
			if (b) {
				x();
			} else {
				y();
			}
		}
		after();
	`);

	const outer = graph.nodes.find((n: any) => n.data?.sourceText === 'a');
	const inner = graph.nodes.find((n: any) => n.data?.sourceText === 'b');
	const x = nodeByText(graph, 'x()');
	const y = nodeByText(graph, 'y()');
	const after = nodeByText(graph, 'after()');

	assert.ok(outer);
	assert.ok(inner);
	assert.ok(x);
	assert.ok(y);
	assert.ok(after);

	assert.ok(hasPath(graph, outer.id, inner.id));
	assert.ok(hasPath(graph, inner.id, x.id));
	assert.ok(hasPath(graph, inner.id, y.id));
	assert.ok(hasPath(graph, x.id, after.id));
	assert.ok(hasPath(graph, y.id, after.id));
});

test('diagramGen nested early returns do not flow into later action', async () => {
	const graph = await buildGraphFromBody(`
		if (a) {
			if (b) return 'ab';
			return 'a';
		}
		after();
	`);

	const after = nodeByText(graph, 'after()');
	const returns = nodesByConstruct(graph, 'return');

	assert.ok(after);
	assert.ok(returns.length >= 2);

	for (const returnNode of returns) {
		assert.equal(hasPath(graph, returnNode.id, after.id), false, `Return ${nodeText(returnNode)} must not reach after()`);
	}
});

test('diagramGen sequential ifs remain sequential', async () => {
	const graph = await buildGraphFromBody(`
		if (a) x();
		if (b) y();
		done();
	`);

	const a = graph.nodes.find((n: any) => n.data?.sourceText === 'a');
	const b = graph.nodes.find((n: any) => n.data?.sourceText === 'b');
	const done = nodeByText(graph, 'done()');

	assert.ok(a);
	assert.ok(b);
	assert.ok(done);
	assert.ok(hasPath(graph, a.id, b.id));
	assert.ok(hasPath(graph, b.id, done.id));
});
