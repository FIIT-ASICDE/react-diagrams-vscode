import assert from 'node:assert/strict';
import test from 'node:test';

import {
	buildGraphFromBody,
	edgeLabelsFrom,
	hasPath,
	nodeByConstruct,
	nodeByText,
	nodesByText,
	outgoingFrom,
	targetNode,
} from './helpers';

test('diagramGen creates switch decision with case/default edges and exit switch boundary', async () => {
	const graph = await buildGraphFromBody(`
		switch (kind) {
			case 'a':
				handleA();
				break;
			case 'b':
				handleB();
				break;
			default:
				handleDefault();
		}
		afterSwitch();
	`);

	const decision = graph.nodes.find((n: any) => n.type === 'decision' && n.data?.construct === 'switch');
	const afterSwitch = nodeByText(graph, 'afterSwitch()');

	assert.ok(decision);
	assert.ok(afterSwitch);
	assert.equal(decision.data?.sourceText, 'kind');

	const labels = edgeLabelsFrom(graph, decision.id);
	assert.ok(labels.some((l: string) => l.includes("case 'a'")));
	assert.ok(labels.some((l: string) => l.includes("case 'b'")));
	assert.ok(labels.some((l: string) => l.includes('default')));
	assert.ok(graph.edges.some((edge: any) => String(edge.label ?? '') === 'exit switch'));
	assert.ok(hasPath(graph, decision.id, afterSwitch.id));
});

test('diagramGen switch break exits switch without going to End', async () => {
	const graph = await buildGraphFromBody(`
		switch (kind) {
			case 'a':
				break;
		}
		after();
	`);

	const breakNode = nodeByConstruct(graph, 'break');
	const after = nodeByText(graph, 'after()');

	assert.ok(breakNode);
	assert.ok(after);

	const out = outgoingFrom(graph, breakNode.id);
	assert.ok(out.length > 0);
	assert.equal(out.some((edge: any) => targetNode(graph, edge)?.type === 'end'), false);
	assert.ok(
		out.some((edge: any) => String(edge.label ?? '') === 'exit switch')
			|| out.some((edge: any) => targetNode(graph, edge)?.type === 'merge')
			|| hasPath(graph, breakNode.id, after.id),
	);
	assert.ok(hasPath(graph, breakNode.id, after.id));
});

test('diagramGen switch return case does not reach after', async () => {
	const graph = await buildGraphFromBody(`
		switch (kind) {
			case 'a':
				return 'a';
			default:
				d();
		}
		after();
	`);

	const returnA = graph.nodes.find((n: any) => String(n?.data?.sourceText ?? '').includes("return 'a'"));
	const after = nodeByText(graph, 'after()');

	assert.ok(returnA);
	assert.ok(after);
	assert.equal(hasPath(graph, returnA.id, after.id), false);
});

test('diagramGen switch grouped empty labels share body', async () => {
	const graph = await buildGraphFromBody(`
		switch (value) {
			case 'a':
			case 'b':
				handleAB();
				break;
			default:
				handleDefault();
		}
	`);

	const sw = graph.nodes.find((n: any) => n.data?.construct === 'switch');
	const handleAB = nodesByText(graph, 'handleAB()');

	assert.ok(sw);
	assert.equal(handleAB.length, 1);
	assert.ok(edgeLabelsFrom(graph, sw.id).some((label) => label.includes("case 'a'") && label.includes("'b'")));
});

test('diagramGen switch explicit fallthrough reaches next case body', async () => {
	const graph = await buildGraphFromBody(`
		switch (value) {
			case 'a':
				a();
			case 'b':
				b();
				break;
		}
		after();
	`);

	const a = nodeByText(graph, 'a()');
	const b = nodeByText(graph, 'b()');
	const after = nodeByText(graph, 'after()');

	assert.ok(a);
	assert.ok(b);
	assert.ok(after);
	assert.ok(hasPath(graph, a.id, b.id));
	assert.ok(hasPath(graph, b.id, after.id));
});

test('diagramGen switch with all returning cases has no unreachable post-switch flow', async () => {
	const graph = await buildGraphFromBody(`
		switch (input.kind) {
			case 'a':
				return 'a';
			case 'b':
				return 'b';
			default:
				return 'default';
		}

		unreachable();
	`);

	const unreachable = nodeByText(graph, 'unreachable()');
	assert.equal(unreachable, undefined);
	assert.equal(graph.edges.some((edge: any) => String(edge.label ?? '') === 'exit switch'), false);
});

test('diagramGen switch break creates exit switch edge to post-flow', async () => {
	const graph = await buildGraphFromBody(`
		switch (kind) {
			case 'a':
				break;
			default:
				return 'x';
		}

		after();
	`);

	const breakNode = nodeByConstruct(graph, 'break');
	const after = nodeByText(graph, 'after()');

	assert.ok(breakNode);
	assert.ok(after);
	assert.ok(graph.edges.some((edge: any) => String(edge.label ?? '') === 'exit switch'));
	assert.ok(hasPath(graph, breakNode.id, after.id));
});
