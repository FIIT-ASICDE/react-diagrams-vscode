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
	const project = new Project({ compilerOptions: { allowJs: true } });
	const sourceFile = project.createSourceFile(
		'diagram-source.ts',
		`function source(input: any) {\n${bodySource}\n}`,
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
	return String(node.data?.sourceText ?? node.data?.label ?? '');
}

function outgoingFrom(graph: any, nodeId: string) {
	return graph.edges.filter((edge: any) => String(edge.source) === String(nodeId));
}

function targetNode(graph: any, edge: any) {
	return graph.nodes.find((node: any) => String(node.id) === String(edge.target));
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

	const decision = graph.nodes.find(
		(n: any) => n.type === 'decision' && n.data?.sourceText === 'flag',
	);
	assert.ok(decision);

	const labels = outgoingFrom(graph, decision.id).map((e: any) => String(e.label ?? ''));

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

	const loop = graph.nodes.find(
		(n: any) => n.type === 'loop' && n.data?.construct === 'while',
	);
	assert.ok(loop);
	assert.equal(loop.data?.sourceText, 'i < 10');

	const outgoing = outgoingFrom(graph, loop.id);
	assert.ok(outgoing.some((e: any) => e.label === 'yes'));
	assert.ok(outgoing.some((e: any) => e.label === 'no'));
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

	const loop = graph.nodes.find(
		(n: any) => n.type === 'loop' && n.data?.construct === 'do-while',
	);
	assert.ok(loop);
	assert.equal(loop.data?.sourceText, 'i < n');

	const outgoing = outgoingFrom(graph, loop.id);
	assert.ok(outgoing.some((e: any) => e.label === 'yes'));
	assert.ok(outgoing.some((e: any) => e.label === 'no'));

	const generated = await generateFromFunctionBody(`
		do {
			i++;
			if (i > 10) {
				break;
			}
		} while (i < n);
		return i;
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /do\s*\{/);
	assert.match(generated, /while\s*\(i < n\);/);
	assert.match(generated, /break;/);
	assert.match(generated, /return\s+i;/);
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

	const labels = outgoingFrom(graph, decision.id).map((e: any) => String(e.label ?? ''));

	assert.ok(labels.some((l: string) => l.includes("case 'a'")));
	assert.ok(labels.some((l: string) => l.includes("case 'b'")));
	assert.ok(labels.some((l: string) => l.includes('default')));
	assert.ok(labels.some((l: string) => l === ''), 'Expected structural switch merge marker edge');
});

test('diagramGen creates try node with exception edge and inline finally flow', async () => {
	const graph = await buildGraphFromBody(`
		try {
			risky();
		} catch (error) {
			handle(error);
		} finally {
			cleanup();
		}
	`);

	const tryNode = graph.nodes.find(
		(n: any) => n.type === 'decision' && n.data?.construct === 'try',
	);
	assert.ok(tryNode);

	const outgoing = outgoingFrom(graph, tryNode.id);
	assert.ok(outgoing.some((e: any) => String(e.label ?? '') === 'exception'));

	assert.ok(
		graph.nodes.some((n: any) => nodeText(n).includes('cleanup()')),
		'Expected cleanup action from finally to exist in graph',
	);
});

test('diagramGen preserves break and continue metadata', async () => {
	const graph = await buildGraphFromBody(`
		outer: for (const item of items) {
			if (!item) continue;
			if (item.stop) break outer;
		}
	`);

	assert.ok(graph.nodes.some((n: any) => n.data?.construct === 'continue'));
	assert.ok(graph.nodes.some((n: any) => n.data?.construct === 'break'));

	const outerLoop = graph.nodes.find(
		(n: any) => n.type === 'loop' && n.data?.loopLabel === 'outer',
	);
	assert.ok(outerLoop);
});

test('diagramGen creates multiple end nodes for multiple returns', async () => {
	const graph = await buildGraphFromBody(`
		if (ok) return 1;
		return 2;
	`);

	const returns = graph.nodes.filter((n: any) => n.data?.construct === 'return');
	const ends = graph.nodes.filter((n: any) => n.type === 'end');

	assert.ok(returns.length >= 2, 'Expected at least two return nodes');
	assert.ok(ends.length >= 2, 'Expected separate end nodes for separate returns');

	for (const returnNode of returns) {
		const outgoing = outgoingFrom(graph, returnNode.id);
		assert.ok(
			outgoing.some((edge: any) => targetNode(graph, edge)?.type === 'end'),
			`Return node ${returnNode.id} should connect to an End node`,
		);
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

	const loops = graph.nodes.filter((n: any) => n.type === 'loop');
	assert.ok(loops.length >= 2);

	assert.ok(graph.nodes.some((n: any) => n.data?.construct === 'continue'));
	assert.ok(graph.nodes.some((n: any) => n.data?.construct === 'break'));
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

	const decision = graph.nodes.find((n: any) => n.data?.construct === 'switch');
	assert.ok(decision);

	const edges = outgoingFrom(graph, decision.id);
	assert.ok(edges.length >= 2);
	assert.ok(edges.some((e: any) => String(e.label ?? '').includes("case 'a'")));
	assert.ok(edges.some((e: any) => String(e.label ?? '').includes("case 'b'")));
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

	const switchNode = graph.nodes.find((n: any) => n.data?.construct === 'switch');
	assert.ok(switchNode);

	const merge = graph.nodes.find((n: any) => n.type === 'merge');
	assert.ok(merge);

	assert.ok(
		graph.edges.some(
			(e: any) => String(e.source) === String(switchNode.id) && String(e.target) === String(merge.id),
		),
		'Expected structural switch decision -> merge marker edge',
	);

	assert.ok(
		outgoingFrom(graph, merge.id).some((edge: any) =>
			nodeText(targetNode(graph, edge)).includes('after()'),
		),
		'Switch merge should connect to post-switch code',
	);
});

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

	const beforeDone = generated.slice(switchStart, doneIndex);
	const openCount = (beforeDone.match(/\{/g) ?? []).length;
	const closeCount = (beforeDone.match(/\}/g) ?? []).length;

	assert.ok(
		closeCount >= openCount,
		'Expected switch block to be closed before post-switch return',
	);
});

test('diagram->code keeps return-only switch cases as function exits', async () => {
	const generated = await generateFromFunctionBody(`
		switch (input.kind) {
			case 'a':
				return 'a';
			case 'b':
				return 'b';
			default:
				return 'x';
		}
	`);

	assertSyntacticallyValidTypeScript(generated);

	assert.match(generated, /return\s+'a';/);
	assert.match(generated, /return\s+'b';/);
	assert.match(generated, /return\s+'x';/);
	assert.doesNotMatch(generated, /return\s+'done';/);
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