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
		`Expected syntactically valid TypeScript, got: ${syntaxDiagnostics.map((d) => d.messageText).join(' | ')}`,
	);
}

async function generateFromFunctionBody(bodySource: string): Promise<string> {
	const project = new Project({ compilerOptions: { allowJs: true, jsx: 2 } });
	const sourceFile = project.createSourceFile(
		'roundtrip-source.ts',
		`function source() {\n${bodySource}\n}`,
		{ overwrite: true },
	);

	const fn = sourceFile.getFunctionOrThrow('source');
	const body = fn.getBodyOrThrow().asKindOrThrow(SyntaxKind.Block);
	const graph = await new DiagramBuilder().buildStatements(body.getStatements());
	return convertDiagramToCode(graph.nodes, graph.edges, 'reconstructed', []);
}

test('diagram->code supports if/else with early return semantics', async () => {
	const generated = await generateFromFunctionBody(`
		if (flag) {
			return 1;
		} else {
			doWork();
		}
		return 2;
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /if\s*\(/);
	assert.match(generated, /return\s+1/);
	assert.match(generated, /return\s+2/);
});

test('diagram->code supports loop reconstruction from decision/back-edge patterns', async () => {
	const generated = await generateFromFunctionBody(`
		while (count < 3) {
			count += 1;
		}
		finish();
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /while\s*\(/);
	assert.match(generated, /finish\(/);
});

test('diagram->code supports switch-case reconstruction', async () => {
	const generated = await generateFromFunctionBody(`
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
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /switch\s*\(/);
	assert.match(generated, /case/);
	assert.match(generated, /default:/);
});

test('diagram->code supports try/catch/finally-like flows', async () => {
	const generated = await generateFromFunctionBody(`
		try {
			runWork();
		} catch (error) {
			handleError(error);
		} finally {
			cleanup();
		}
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /try\s*\{/);
	assert.match(generated, /catch\s*\(err\)/);
	assert.match(generated, /finally\s*\{/);
});

test('diagram->code fails gracefully for malformed diagrams', () => {
	const code = convertDiagramToCode(
		[
			{ id: 'initial-1', type: 'initial', position: { x: 0, y: 0 }, data: { label: 'Start' } },
		],
		[],
		'malformed',
	);

	assert.match(code, /Diagram conversion failed:/);
	assertSyntacticallyValidTypeScript(code);
});

test('diagram->code does not overflow call stack on cyclic retry-like diagrams', () => {
	const nodes = [
		{ id: 'initial-1', type: 'initial', position: { x: 0, y: 0 }, data: { label: 'Start' } },
		{ id: 'action-1', type: 'action', position: { x: 0, y: 80 }, data: { label: 'let attempt = 0' } },
		{ id: 'decision-1', type: 'decision', position: { x: 0, y: 160 }, data: { label: 'attempt < retries' } },
		{ id: 'action-2', type: 'action', position: { x: -100, y: 240 }, data: { label: 'attempt++' } },
		{ id: 'action-3', type: 'action', position: { x: 100, y: 240 }, data: { label: 'throw err' } },
		{ id: 'end-1', type: 'end', position: { x: 0, y: 320 }, data: { label: 'End' } },
	] as unknown as import('@xyflow/react').Node[];

	const edges = [
		{ id: 'edge-1', source: 'initial-1', target: 'action-1' },
		{ id: 'edge-2', source: 'action-1', target: 'decision-1' },
		{ id: 'edge-3', source: 'decision-1', target: 'action-2', label: 'yes' },
		{ id: 'edge-4', source: 'action-2', target: 'decision-1' },
		{ id: 'edge-5', source: 'decision-1', target: 'action-3', label: 'no' },
		{ id: 'edge-6', source: 'action-3', target: 'end-1' },
	] as unknown as import('@xyflow/react').Edge[];

	const generated = convertDiagramToCode(nodes, edges, 'retryGenerated', []);
	assertSyntacticallyValidTypeScript(generated);
	assert.ok(generated.length > 0);
	assert.doesNotMatch(generated, /Maximum call stack|RangeError/i);
});
