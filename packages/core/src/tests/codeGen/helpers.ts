import assert from 'node:assert/strict';
import ts from 'typescript';
import { Project, SyntaxKind } from 'ts-morph';

import { DiagramBuilder } from '../../@react-activity-diagrams';
import { convertDiagramToCode } from '../../@react-activity-diagrams/code-snippet/main';

export function assertSyntacticallyValidTypeScript(source: string): void {
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

export async function generateFromBody(bodySource: string): Promise<string> {
	const project = new Project({ compilerOptions: { allowJs: true, jsx: 2 } });
	const sourceFile = project.createSourceFile(
		'codegen-source.ts',
		`async function source(input: any) {\n${bodySource}\n}`,
		{ overwrite: true },
	);

	const fn = sourceFile.getFunctionOrThrow('source');
	const body = fn.getBodyOrThrow().asKindOrThrow(SyntaxKind.Block);
	const graph = await new DiagramBuilder().buildStatements(body.getStatements());

	return convertDiagramToCode(graph.nodes, graph.edges, 'generatedFromDiagram', []);
}

export function blockFor(source: string, startPattern: RegExp): string {
	const match = startPattern.exec(source);
	assert.ok(match, `Expected block start matching ${startPattern}`);

	const start = match.index;
	const open = source.indexOf('{', start);
	assert.ok(open >= 0, 'Expected opening brace');

	let depth = 0;
	for (let i = open; i < source.length; i++) {
		if (source[i] === '{') depth += 1;
		if (source[i] === '}') depth -= 1;
		if (depth === 0) return source.slice(start, i + 1);
	}

	assert.fail('Unclosed block');
}
