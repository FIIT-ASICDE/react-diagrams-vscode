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
