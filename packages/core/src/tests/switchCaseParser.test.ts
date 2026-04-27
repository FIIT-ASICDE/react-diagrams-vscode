import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Project, SyntaxKind } from 'ts-morph';

import { DiagramBuilder } from '../@react-activity-diagrams';

const switchSample = readFileSync(join(__dirname, '..', '..', 'src', 'tests', 'samples', 'switchNLoops.tsx')).toString();

test('DiagramBuilder builds switch cases as branches', async () => {
	const project = new Project({ compilerOptions: { allowJs: true, jsx: 2 } });
	const sourceFile = project.createSourceFile('switch-sample.tsx', switchSample, { overwrite: true });
	const processItems = sourceFile
		.getDescendantsOfKind(SyntaxKind.FunctionDeclaration)
		.find((candidate) => candidate.getName() === 'processItems');

	assert.ok(processItems);

	const body = processItems!.getBodyOrThrow().asKindOrThrow(SyntaxKind.Block);
	const graph = await new DiagramBuilder().buildStatements(body.getStatements());
	const edgeLabels = graph.edges.map((edge) => String(edge.label ?? ''));
	const decisionLabels = graph.nodes
		.filter((node) => node.type === 'decision')
		.map((node) => String((node.data as { label?: unknown } | undefined)?.label ?? ''));

	assert.ok(decisionLabels.some((label) => /kind/i.test(label) || /status/i.test(label)));
	assert.ok(edgeLabels.some((label) => label.includes('case "fast"')));
	assert.ok(edgeLabels.some((label) => label.includes('case "slow"')));
	assert.ok(edgeLabels.some((label) => label.includes('case "broken"')));
	assert.ok(edgeLabels.some((label) => label === 'default'));
});

test('switch with return-only branches does not add redundant internal merge', async () => {
	const sourceText = `
		function renderRoute(route: string) {
			switch (route) {
				case "dashboard":
					return "dashboard";
				case "settings":
					return "settings";
				default:
					return "missing";
			}
		}
	`;

	const project = new Project({ compilerOptions: { allowJs: true, jsx: 2 } });
	const sourceFile = project.createSourceFile('switch-return-only.ts', sourceText, { overwrite: true });
	const renderRoute = sourceFile
		.getDescendantsOfKind(SyntaxKind.FunctionDeclaration)
		.find((candidate) => candidate.getName() === 'renderRoute');

	assert.ok(renderRoute);

	const body = renderRoute!.getBodyOrThrow().asKindOrThrow(SyntaxKind.Block);
	const graph = await new DiagramBuilder().buildStatements(body.getStatements());

	const mergeNodes = graph.nodes.filter((node) => node.type === 'merge');
	assert.equal(mergeNodes.length, 1);
});

test('switch break routes to switch merge, not end', async () => {
	const sourceText = `
		function mapKind(kind: string) {
			switch (kind) {
				case "a":
					break;
				case "b":
					return "B";
				default:
					break;
			}
			return "done";
		}
	`;

	const project = new Project({ compilerOptions: { allowJs: true, jsx: 2 } });
	const sourceFile = project.createSourceFile('switch-break-routing.ts', sourceText, { overwrite: true });
	const fn = sourceFile
		.getDescendantsOfKind(SyntaxKind.FunctionDeclaration)
		.find((candidate) => candidate.getName() === 'mapKind');

	assert.ok(fn);

	const body = fn!.getBodyOrThrow().asKindOrThrow(SyntaxKind.Block);
	const graph = await new DiagramBuilder().buildStatements(body.getStatements());
	const nodeById = new Map(graph.nodes.map((node) => [String(node.id), node]));
	const breakNodes = graph.nodes.filter((node) =>
		String((node.data as { construct?: unknown } | undefined)?.construct ?? '') === 'break',
	);

	assert.ok(breakNodes.length >= 1);

	for (const breakNode of breakNodes) {
		const outEdges = graph.edges.filter((edge) => String(edge.source) === String(breakNode.id));
		assert.ok(outEdges.length >= 1);
		assert.ok(outEdges.every((edge) => nodeById.get(String(edge.target))?.type === 'merge'));
		assert.ok(outEdges.every((edge) => nodeById.get(String(edge.target))?.type !== 'end'));
	}

	const returnNodes = graph.nodes.filter((node) =>
		String((node.data as { construct?: unknown } | undefined)?.construct ?? '') === 'return',
	);
	assert.ok(returnNodes.length >= 1);
	for (const returnNode of returnNodes) {
		const outEdges = graph.edges.filter((edge) => String(edge.source) === String(returnNode.id));
		assert.ok(outEdges.some((edge) => nodeById.get(String(edge.target))?.type === 'end'));
	}
});

test('continue routes to loop back-edge, not end', async () => {
	const sourceText = `
		function sumPos(items: number[]) {
			let total = 0;
			for (const item of items) {
				if (item < 0) continue;
				total += item;
			}
			return total;
		}
	`;

	const project = new Project({ compilerOptions: { allowJs: true, jsx: 2 } });
	const sourceFile = project.createSourceFile('continue-routing.ts', sourceText, { overwrite: true });
	const fn = sourceFile
		.getDescendantsOfKind(SyntaxKind.FunctionDeclaration)
		.find((candidate) => candidate.getName() === 'sumPos');

	assert.ok(fn);

	const body = fn!.getBodyOrThrow().asKindOrThrow(SyntaxKind.Block);
	const graph = await new DiagramBuilder().buildStatements(body.getStatements());
	const nodeById = new Map(graph.nodes.map((node) => [String(node.id), node]));
	const continueNodes = graph.nodes.filter((node) =>
		String((node.data as { construct?: unknown } | undefined)?.construct ?? '') === 'continue',
	);

	assert.ok(continueNodes.length >= 1);

	for (const continueNode of continueNodes) {
		const outEdges = graph.edges.filter((edge) => String(edge.source) === String(continueNode.id));
		assert.ok(outEdges.length >= 1);
		assert.ok(outEdges.every((edge) => nodeById.get(String(edge.target))?.type === 'loop'));
		assert.ok(outEdges.every((edge) => nodeById.get(String(edge.target))?.type !== 'end'));
	}
});
