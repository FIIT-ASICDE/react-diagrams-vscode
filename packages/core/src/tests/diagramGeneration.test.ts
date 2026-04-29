import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import { Project, SyntaxKind } from 'ts-morph';

import { DiagramBuilder } from '../@react-activity-diagrams';
import { convertDiagramToCode } from '../@react-activity-diagrams/code-snippet/main';

function assertSyntacticallyValidTypeScript(source: string): void {
	const result = ts.transpileModule(source, {
		reportDiagnostics: true,
		compilerOptions: { target: ts.ScriptTarget.ES2020 },
	});

	const syntaxDiagnostics = (result.diagnostics ?? []).filter(
		(diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
	);

	assert.equal(
		syntaxDiagnostics.length,
		0,
		`Expected syntactically valid TypeScript, got: ${syntaxDiagnostics
			.map((d) => d.messageText)
			.join(' | ')}\n\nGenerated:\n${source}`,
	);
}

async function buildGraphFromBody(bodySource: string) {
	const project = new Project({ compilerOptions: { allowJs: true, jsx: 2 } });
	const sourceFile = project.createSourceFile(
		'diagram-source.ts',
		`async function source(input: any) {\n${bodySource}\n}`,
		{ overwrite: true },
	);

	const fn = sourceFile.getFunctionOrThrow('source');
	const body = fn.getBodyOrThrow().asKindOrThrow(SyntaxKind.Block);
	return new DiagramBuilder().buildStatements(body.getStatements());
}

async function generateFromFunctionBody(bodySource: string): Promise<string> {
	const graph = await buildGraphFromBody(bodySource);
	return convertDiagramToCode(graph.nodes, graph.edges, 'generatedFromDiagram', []);
}

function nodeText(node: any): string {
	return String(node?.data?.sourceText ?? node?.data?.label ?? '');
}

function nodesByText(graph: any, text: string) {
	return graph.nodes.filter((node: any) => nodeText(node).includes(text));
}

function nodeByText(graph: any, text: string) {
	return nodesByText(graph, text)[0];
}

function nodeByConstruct(graph: any, construct: string) {
	return graph.nodes.find((node: any) => node.data?.construct === construct);
}

function nodesByConstruct(graph: any, construct: string) {
	return graph.nodes.filter((node: any) => node.data?.construct === construct);
}

function outgoingFrom(graph: any, nodeId: string) {
	return graph.edges.filter((edge: any) => String(edge.source) === String(nodeId));
}

function incomingTo(graph: any, nodeId: string) {
	return graph.edges.filter((edge: any) => String(edge.target) === String(nodeId));
}

function targetNode(graph: any, edge: any) {
	return graph.nodes.find((node: any) => String(node.id) === String(edge.target));
}

function edgeLabelsFrom(graph: any, nodeId: string): string[] {
	return outgoingFrom(graph, nodeId).map((edge: any) => String(edge.label ?? ''));
}

function hasPath(graph: any, startId: string, endId: string, maxDepth = 60): boolean {
	if (!startId || !endId) return false;

	const queue: Array<{ id: string; depth: number }> = [{ id: String(startId), depth: 0 }];
	const visited = new Set<string>();

	while (queue.length > 0) {
		const current = queue.shift();
		if (!current) break;

		if (current.id === String(endId)) return true;
		if (current.depth >= maxDepth) continue;
		if (visited.has(current.id)) continue;
		visited.add(current.id);

		for (const edge of outgoingFrom(graph, current.id)) {
			queue.push({ id: String(edge.target), depth: current.depth + 1 });
		}
	}

	return false;
}

function reachesTargetBeforeStop(
	graph: any,
	startId: string,
	targetId: string,
	stopIds: Set<string>,
	maxDepth = 60,
): boolean {
	if (!startId || !targetId) return false;

	const queue: Array<{ id: string; depth: number }> = [{ id: String(startId), depth: 0 }];
	const visited = new Set<string>();

	while (queue.length > 0) {
		const current = queue.shift();
		if (!current) break;

		if (current.id === String(targetId)) return true;
		if (current.depth >= maxDepth) continue;
		if (visited.has(current.id)) continue;
		visited.add(current.id);

		if (stopIds.has(current.id)) continue;

		for (const edge of outgoingFrom(graph, current.id)) {
			queue.push({ id: String(edge.target), depth: current.depth + 1 });
		}
	}

	return false;
}

function findBranchEdge(graph: any, nodeId: string, labels: string[]) {
	return outgoingFrom(graph, nodeId).find((edge: any) =>
		labels.includes(String(edge.label ?? '')),
	);
}

function assertNoDirectEdge(graph: any, sourceId: string, targetId: string, message: string): void {
	assert.equal(
		graph.edges.some(
			(edge: any) =>
				String(edge.source) === String(sourceId) &&
				String(edge.target) === String(targetId),
		),
		false,
		message,
	);
}

// ── Basic if / merge behavior ───────────────────────────────────────────────

test('diagramGen creates if decision with yes/no edges', async () => {
	const graph = await buildGraphFromBody(`
		if (flag) {
			doYes();
		} else {
			doNo();
		}
		done();
	`);

	const decision = graph.nodes.find(
		(n: any) => n.type === 'decision' && n.data?.sourceText === 'flag',
	);
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
	assert.ok(labels.includes('yes'), 'Expected explicit yes branch');
	assert.ok(labels.includes('no'), 'Expected explicit no branch for implicit false fallthrough');

	const noToMerge = outgoingFrom(graph, decision.id).find(
		(edge: any) => String(edge.label ?? '') === 'no' && targetNode(graph, edge)?.type === 'merge',
	);
	assert.ok(noToMerge, 'Expected no-labeled false branch from if decision to merge');

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

	assert.ok(yes, 'Expected yes edge from guard decision');
	assert.ok(no, 'Expected no edge from guard decision');
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
		assert.equal(
			hasPath(graph, returnNode.id, after.id),
			false,
			`Return ${nodeText(returnNode)} must not reach after()`,
		);
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

// ── Loops ───────────────────────────────────────────────────────────────────

test('diagramGen creates while loop with body and exit edges', async () => {
	const graph = await buildGraphFromBody(`
		while (i < 10) {
			i++;
		}
		done();
	`);

	const loop = graph.nodes.find(
		(n: any) => n.type === 'loop' && n.data?.construct === 'while',
	);
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

	assert.ok(
		outgoingFrom(graph, body.id).some(
			(edge: any) => String(edge.target) === String(loop.id) || edge.type === 'back',
		),
	);
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

	const merge = graph.nodes.find(
		(n: any) =>
			n.type === 'merge' &&
			hasPath(graph, breakNode.id, n.id) &&
			hasPath(graph, loop.id, n.id) &&
			hasPath(graph, n.id, postDecision.id),
	);

	assert.ok(merge, 'Expected explicit merge before post-loop decision');
	assert.ok(
		outgoingFrom(graph, loop.id).some(
			(edge: any) => String(edge.target) === String(merge.id) && String(edge.label ?? '') === 'no',
		),
		'Expected no-labeled loop fallthrough edge into merge',
	);
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

	assert.ok(hasPath(graph, cont.id, loop.id), 'continue should route back to loop');
	assert.equal(
		reachesTargetBeforeStop(graph, cont.id, work.id, new Set([String(loop.id)])),
		false,
		'continue should not reach work() before reaching the loop target',
	);
	assert.equal(
		reachesTargetBeforeStop(graph, cont.id, after.id, new Set([String(loop.id)])),
		false,
		'continue should not reach post-loop after() before reaching the loop target',
	);
});

test('diagramGen do-while body comes before condition', async () => {
	const graph = await buildGraphFromBody(`
		do {
			i++;
		} while (i < n);
		after();
	`);

	const bodyNode = graph.nodes.find((n: any) =>
		String(n.data?.sourceText ?? '').includes('i++'),
	);
	const loopNode = graph.nodes.find(
		(n: any) => n.type === 'loop' && n.data?.construct === 'do-while',
	);
	const afterNode = graph.nodes.find((n: any) =>
		String(n.data?.sourceText ?? '').includes('after()'),
	);

	assert.ok(bodyNode);
	assert.ok(loopNode);
	assert.ok(afterNode);

	assert.ok(
		graph.edges.some(
			(e: any) =>
				String(e.source) === String(bodyNode.id) &&
				String(e.target) === String(loopNode.id),
		),
		'do-while body should flow into condition',
	);

	assert.ok(
		graph.edges.some(
			(e: any) =>
				String(e.source) === String(loopNode.id) &&
				String(e.target) === String(bodyNode.id) &&
				String(e.label ?? '') === 'yes' &&
				e.type === 'back',
		),
		'do-while yes branch should loop back to body',
	);

	assert.ok(
		graph.edges.some(
			(e: any) =>
				String(e.source) === String(loopNode.id) &&
				String(e.target) === String(afterNode.id) &&
				String(e.label ?? '') === 'no',
		),
		'do-while no branch should continue after loop',
	);
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

	const merge = graph.nodes.find(
		(n: any) =>
			n.type === 'merge' &&
			hasPath(graph, loop.id, n.id) &&
			hasPath(graph, breakNode.id, n.id) &&
			hasPath(graph, n.id, after.id),
	);

	assert.ok(merge, 'Expected do-while normal exit and break to join before after()');
});

test('diagramGen creates for-of loop metadata', async () => {
	const graph = await buildGraphFromBody(`
		for (const item of items) {
			use(item);
		}
	`);

	const loop = graph.nodes.find(
		(n: any) => n.type === 'loop' && n.data?.construct === 'for-of',
	);
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
	assert.equal(
		reachesTargetBeforeStop(graph, contOuter.id, use.id, new Set([String(outerLoop.id)])),
		false,
		'continue outer should not reach use(item) before reaching outer loop target',
	);
});

// ── Switch ─────────────────────────────────────────────────────────────────

test('diagramGen creates switch decision with case/default edges and merge marker', async () => {
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

	const decision = graph.nodes.find(
		(n: any) => n.type === 'decision' && n.data?.construct === 'switch',
	);
	assert.ok(decision);
	assert.equal(decision.data?.sourceText, 'kind');

	const labels = edgeLabelsFrom(graph, decision.id);

	assert.ok(labels.some((l: string) => l.includes("case 'a'")));
	assert.ok(labels.some((l: string) => l.includes("case 'b'")));
	assert.ok(labels.some((l: string) => l.includes('default')));
	assert.ok(labels.some((l: string) => l === ''), 'Expected structural switch merge marker edge');
});

test('diagramGen switch break goes to merge, not End', async () => {
	const graph = await buildGraphFromBody(`
		switch (kind) {
			case 'a':
				break;
		}
		after();
	`);

	const breakNode = nodeByConstruct(graph, 'break');
	assert.ok(breakNode);

	const out = outgoingFrom(graph, breakNode.id);
	assert.ok(out.some((edge: any) => targetNode(graph, edge)?.type === 'merge'));
	assert.equal(out.some((edge: any) => targetNode(graph, edge)?.type === 'end'), false);
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

	const returnA = graph.nodes.find((n: any) => nodeText(n).includes("return 'a'"));
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

// ── Try / catch / finally ──────────────────────────────────────────────────

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
	const returnMissing = graph.nodes.find((n: any) => n.data?.construct === 'return' && nodeText(n).includes("return 'missing'"));
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

	const finallyReturn = graph.nodes.find((n: any) => nodeText(n).includes("return 'finally-return'"));
	const tryReturn = graph.nodes.find((n: any) => nodeText(n).includes("return 'try-return'") && n.data?.construct === 'return');

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
	assert.ok(no, 'Expected explicit no edge for implicit finally fallthrough');

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
	assert.ok(no, 'Expected explicit no edge from catch guard decision');

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

	assert.ok(yes, 'Expected yes edge on strict decision');
	assert.ok(no, 'Expected no edge on strict decision');
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

	const noToMerge = outgoingFrom(graph, strict.id).find(
		(edge: any) => String(edge.label ?? '') === 'no' && targetNode(graph, edge)?.type === 'merge',
	);

	assert.ok(noToMerge, 'Expected strict no-branch to keep no label when entering merge');
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
	assert.equal(
		outgoingFrom(graph, cont.id).some(
			(edge: any) => String(edge.target) === String(loop.id) || edge.type === 'back',
		),
		false,
		'continue must not directly jump to loop before finally',
	);
	assert.equal(
		reachesTargetBeforeStop(graph, cont.id, use.id, new Set([String(loop.id)])),
		false,
		'continue path must not reach use(item) before loop target',
	);
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

	const contOuter = graph.nodes.find((n: any) => nodeText(n).includes('continue outer'));
	const cleanupNodes = nodesByText(graph, 'cleanup(item)');
	const outerLoop = graph.nodes.find((n: any) => n.type === 'loop' && n.data?.loopLabel === 'outer');
	const use = nodeByText(graph, 'use(item)');

	assert.ok(contOuter);
	assert.ok(cleanupNodes.length > 0);
	assert.ok(outerLoop);
	assert.ok(use);

	assert.ok(cleanupNodes.some((cleanup: any) => hasPath(graph, contOuter.id, cleanup.id) && hasPath(graph, cleanup.id, outerLoop.id)));
	assert.equal(
		reachesTargetBeforeStop(graph, contOuter.id, use.id, new Set([String(outerLoop.id)])),
		false,
		'continue outer path must not reach use(item) before outer loop target',
	);
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
				throw new Error('boom');
			} catch (err) {
				continue;
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
	assert.equal(
		reachesTargetBeforeStop(graph, cont.id, use.id, new Set([String(loop.id)])),
		false,
		'catch continue path must not reach use(item) before loop target',
	);
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

	assert.ok(yes, 'Expected yes edge from skip guard');
	assert.ok(no, 'Expected no edge from skip guard');
	assert.ok(hasPath(graph, String(no.target), work.id));
	assert.equal(
		reachesTargetBeforeStop(
			graph,
			String(yes.target),
			String(work.id),
			new Set([String(loop.id)]),
		),
		false,
		'Expected continue path to not reach work() before loop boundary',
	);
});

// ── Existing targeted regressions ───────────────────────────────────────────

test('DiagramBuilder routes switch breaks to post-switch merge, not to end nodes', async () => {
	const graph = await buildGraphFromBody(`
		switch (input.kind) {
			case 'a':
				if (input.value > 10) {
					return 'big-a';
				}
				break;

			case 'b':
				return 'b';

			case 'c':
				input.count = (input.count ?? 0) + 1;
				break;

			default:
				if (!input) {
					return 'invalid';
				}
				break;
		}

		return 'done';
	`);

	const breakNodes = graph.nodes.filter((node: any) => {
		const data = node.data as any;
		return data?.construct === 'break' || data?.sourceText === 'break;';
	});

	assert.ok(breakNodes.length >= 2, 'Expected break nodes inside switch');

	const endNodeIds = new Set(
		graph.nodes.filter((node: any) => node.type === 'end').map((node: any) => String(node.id)),
	);

	for (const breakNode of breakNodes) {
		const outgoing = outgoingFrom(graph, breakNode.id);

		assert.ok(outgoing.length > 0, `Expected break node ${breakNode.id} to have outgoing edge`);

		assert.equal(
			outgoing.some((edge: any) => endNodeIds.has(String(edge.target))),
			false,
			`Break node ${breakNode.id} must not go directly to End`,
		);

		assert.ok(
			outgoing.some((edge: any) => targetNode(graph, edge)?.type === 'merge'),
			`Break node ${breakNode.id} should go to switch merge`,
		);
	}
});

test('DiagramBuilder creates separate end nodes for switch returns', async () => {
	const graph = await buildGraphFromBody(`
		switch (input.kind) {
			case 'a':
				if (input.value > 10) {
					return 'big-a';
				}
				break;

			case 'b':
				return 'b';

			default:
				if (!input) {
					return 'invalid';
				}
				break;
		}

		return 'done';
	`);

	const returnNodes = graph.nodes.filter((node: any) => node.data?.construct === 'return');
	const endNodes = graph.nodes.filter((node: any) => node.type === 'end');

	assert.ok(returnNodes.length >= 4, 'Expected multiple return nodes');
	assert.ok(endNodes.length >= 4, 'Expected multiple end nodes');

	for (const returnNode of returnNodes) {
		const outgoing = outgoingFrom(graph, returnNode.id);

		assert.ok(
			outgoing.some((edge: any) => targetNode(graph, edge)?.type === 'end'),
			`Return node ${returnNode.id} should go to an End node`,
		);
	}
});

test('diagram->code keeps switch break scoped and continues after switch', async () => {
	const generated = await generateFromFunctionBody(`
		switch (input.kind) {
			case 'a':
				if (input.value > 10) {
					return 'big-a';
				}
				break;

			case 'b':
				return 'b';

			case 'c':
				input.count = (input.count ?? 0) + 1;
				break;

			default:
				if (!input) {
					return 'invalid';
				}
				break;
		}

		return 'done';
	`);

	assertSyntacticallyValidTypeScript(generated);

	assert.match(generated, /switch\s*\(input\.kind\)/);
	assert.match(generated, /case\s+'a':/);
	assert.match(generated, /case\s+'b':/);
	assert.match(generated, /case\s+'c':/);
	assert.match(generated, /default:/);

	assert.match(generated, /return\s+'big-a';/);
	assert.match(generated, /return\s+'b';/);
	assert.match(generated, /return\s+'invalid';/);
	assert.match(generated, /return\s+'done';/);

	const switchStart = generated.indexOf('switch (input.kind)');
	const doneIndex = generated.indexOf("return 'done';");

	assert.ok(switchStart >= 0, 'Expected switch in generated code');
	assert.ok(doneIndex > switchStart, 'Expected post-switch return after switch');
});

test('diagram->code keeps default break as switch break, not function return', async () => {
	const generated = await generateFromFunctionBody(`
		switch (input.kind) {
			case 'a':
				return 'a';
			default:
				break;
		}

		after();
	`);

	assertSyntacticallyValidTypeScript(generated);

	assert.match(generated, /switch\s*\(input\.kind\)/);
	assert.match(generated, /break;/);
	assert.match(generated, /after\(\);/);

	const afterIndex = generated.indexOf('after();');
	const switchIndex = generated.indexOf('switch (input.kind)');
	assert.ok(afterIndex > switchIndex, 'Expected after() after switch');
});

test('diagramGen complex integration preserves switch, explicit catch path, try/finally and post-loop return', async () => {
	const graph = await buildGraphFromBody(`
		let total = 0;
		outer:
		for (const batch of batches) {
			try {
				switch (batch.kind) {
					case 'skip':
						continue outer;
					case 'value':
						total += batch.value;
						break;
					case 'boom':
						throw new Error('boom');
					case 'stop':
						break outer;
					default:
						if (total < 0) return 'invalid';
				}
			} catch (err) {
				if (strict) return 'error';
			} finally {
				if (total > limit) return 'limit';
				total += 0;
			}
		}
		return total;
	`);

	assert.ok(graph.nodes.find((n: any) => n.type === 'loop' && n.data?.loopLabel === 'outer'));
	assert.ok(graph.nodes.find((n: any) => n.data?.construct === 'switch'));
	assert.ok(nodeByText(graph, 'continue outer'));
	assert.ok(nodeByText(graph, 'break outer'));
	assert.ok(nodeByText(graph, "throw new Error('boom')"));
	assert.ok(nodeByText(graph, "return 'invalid'"));
	assert.ok(nodeByText(graph, "return 'error'"));
	assert.ok(nodeByText(graph, "return 'limit'"));
	assert.ok(nodeByText(graph, 'return total'));
}
);