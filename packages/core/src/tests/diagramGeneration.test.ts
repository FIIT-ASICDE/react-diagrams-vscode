import assert from 'node:assert/strict';
import test from 'node:test';
import { Project, SyntaxKind } from 'ts-morph';

import { DiagramBuilder } from '../@react-activity-diagrams';

async function buildGraphFromBody(bodySource: string) {
	const project = new Project({ compilerOptions: { allowJs: true } });
	const sourceFile = project.createSourceFile(
		'diagram-source.ts',
		`function source() {\n${bodySource}\n}`,
		{ overwrite: true },
	);

	const fn = sourceFile.getFunctionOrThrow('source');
	const body = fn.getBodyOrThrow().asKindOrThrow(SyntaxKind.Block);
	return new DiagramBuilder().buildStatements(body.getStatements());
}

test('diagramGen creates if decision with yes/no edges', async () => {
	const graph = await buildGraphFromBody(`
		if (flag) {
			doYes();
		} else {
			doNo();
		}
		done();
	`);

	const decision = graph.nodes.find((n) => n.type === 'decision' && n.data?.sourceText === 'flag');
	assert.ok(decision);

	const labels = graph.edges
		.filter((e) => e.source === decision.id)
		.map((e) => String(e.label ?? ''));

	assert.ok(labels.includes('yes'));
	assert.ok(labels.includes('no'));
});

test('diagramGen creates while loop with body and exit edges', async () => {
	const graph = await buildGraphFromBody(`
		while (i < 10) {
			i++;
		}
		done();
	`);

	const loop = graph.nodes.find((n) => n.type === 'loop' && n.data?.construct === 'while');
	assert.ok(loop);
	assert.equal(loop.data?.sourceText, 'i < 10');

	const outgoing = graph.edges.filter((e) => e.source === loop.id);
	assert.ok(outgoing.some((e) => e.label === 'yes'));
	assert.ok(outgoing.some((e) => e.label === 'no'));
});

test('diagramGen creates do-while loop structure', async () => {
	const graph = await buildGraphFromBody(`
		do {
			i++;
			if (i > 10) {
				break;
			}
		} while (i < n);
		return i;
	`);

	const loop = graph.nodes.find((n) => n.type === 'loop' && n.data?.construct === 'do-while');
	assert.ok(loop);
	assert.equal(loop.data?.sourceText, 'i < n');

	const outgoing = graph.edges.filter((e) => e.source === loop.id);
	assert.ok(outgoing.some((e) => e.label === 'yes'));
	assert.ok(outgoing.some((e) => e.label === 'no'));
});

test('diagramGen creates for-of loop metadata', async () => {
	const graph = await buildGraphFromBody(`
		for (const item of items) {
			use(item);
		}
	`);

	const loop = graph.nodes.find((n) => n.type === 'loop' && n.data?.construct === 'for-of');
	assert.ok(loop);
	assert.equal(loop.data?.sourceText, 'items');
	assert.equal(loop.data?.forOfBinding, 'const item');
});

test('diagramGen creates switch decision with case and default edges', async () => {
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

	const decision = graph.nodes.find((n) => n.type === 'decision' && n.data?.construct === 'switch');
	assert.ok(decision);
	assert.equal(decision.data?.sourceText, 'kind');

	const labels = graph.edges
		.filter((e) => e.source === decision.id)
		.map((e) => String(e.label ?? ''));

	assert.ok(labels.some((l) => l.includes("case 'a'")));
	assert.ok(labels.some((l) => l.includes("case 'b'")));
	assert.ok(labels.some((l) => l.includes('default')));
	assert.ok(labels.some((l) => l === '')); // merge edge marker
});

test('diagramGen creates try node with exception edge', async () => {
	const graph = await buildGraphFromBody(`
		try {
			risky();
		} catch (error) {
			handle(error);
		} finally {
			cleanup();
		}
	`);

	const tryNode = graph.nodes.find((n) => n.type === 'decision' && n.data?.construct === 'try');
	assert.ok(tryNode);

	const outgoing = graph.edges.filter((e) => e.source === tryNode.id);
	assert.ok(outgoing.some((e) => String(e.label ?? '') === 'exception'));
});

test('diagramGen preserves break and continue metadata', async () => {
	const graph = await buildGraphFromBody(`
		outer: for (const item of items) {
			if (!item) continue;
			if (item.stop) break outer;
		}
	`);

	assert.ok(graph.nodes.some((n) => n.data?.construct === 'continue'));
	assert.ok(graph.nodes.some((n) => n.data?.construct === 'break'));

	const outerLoop = graph.nodes.find((n) => n.type === 'loop' && n.data?.loopLabel === 'outer');
	assert.ok(outerLoop);
});

test('diagramGen creates return nodes and end node', async () => {
	const graph = await buildGraphFromBody(`
		if (ok) return 1;
		return 2;
	`);

	const end = graph.nodes.find((n) => n.type === 'end');
	assert.ok(end);

	const returns = graph.nodes.filter((n) => n.data?.construct === 'return');
	assert.ok(returns.length >= 2);

	for (const r of returns) {
		assert.ok(graph.edges.some((e) => e.source === r.id));
	}
});

test('diagramGen handles nested loops and break/continue flow', async () => {
	const graph = await buildGraphFromBody(`
		for (const item of items) {
			let i = 0;
			while (i < item.count) {
				if (item.skip) continue;
				if (item.stop) break;
				i++;
			}
		}
	`);

	const loops = graph.nodes.filter((n) => n.type === 'loop');
	assert.ok(loops.length >= 2);

	assert.ok(graph.nodes.some((n) => n.data?.construct === 'continue'));
	assert.ok(graph.nodes.some((n) => n.data?.construct === 'break'));
});

test('diagramGen handles switch with fallthrough groups', async () => {
	const graph = await buildGraphFromBody(`
		switch (value) {
			case 'a':
				console.log('a');
			case 'b':
				console.log('b');
				break;
			default:
				console.log('x');
		}
	`);

	const decision = graph.nodes.find((n) => n.data?.construct === 'switch');
	assert.ok(decision);

	const edges = graph.edges.filter((e) => e.source === decision.id);
	assert.ok(edges.length >= 2);
});

test('diagramGen keeps post-switch flow separate via merge node', async () => {
	const graph = await buildGraphFromBody(`
		switch (kind) {
			case 'a':
				doA();
				break;
			default:
				doB();
		}
		after();
	`);

	const merge = graph.nodes.find((n) => n.type === 'merge');
	assert.ok(merge);

	assert.ok(
		graph.edges.some((e) => e.source === merge.id),
		'merge should connect to post-switch code',
	);
});