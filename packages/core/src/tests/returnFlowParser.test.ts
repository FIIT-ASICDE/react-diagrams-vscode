import assert from 'node:assert/strict';
import test from 'node:test';
import { Project, SyntaxKind } from 'ts-morph';

import { DiagramBuilder } from '../@react-activity-diagrams';

function createFunctionBody(sourceText: string) {
	const project = new Project({ compilerOptions: { allowJs: true, jsx: 2 } });
	const sourceFile = project.createSourceFile('return-flow-sample.tsx', sourceText, { overwrite: true });
	const fn = sourceFile.getDescendantsOfKind(SyntaxKind.FunctionDeclaration)[0];
	assert.ok(fn);
	return fn.getBodyOrThrow().asKindOrThrow(SyntaxKind.Block);
}

test('early return does not reconnect into later actions', async () => {
	const body = createFunctionBody(`
		function sample(flag: boolean) {
			if (flag) {
				return 1;
			}
			doWork();
			return 2;
		}
	`);

	const graph = await new DiagramBuilder().buildStatements(body.getStatements());
	const endNode = graph.nodes.find((node) => node.type === 'end');
	assert.ok(endNode);

	const returnNode = graph.nodes.find((node) => {
		const sourceText = (node.data as { sourceText?: unknown } | undefined)?.sourceText;
		return typeof sourceText === 'string' && sourceText.includes('return 1');
	});
	assert.ok(returnNode);

	const workNode = graph.nodes.find((node) => {
		const sourceText = (node.data as { sourceText?: unknown } | undefined)?.sourceText;
		return typeof sourceText === 'string' && sourceText.includes('doWork()');
	});
	assert.ok(workNode);

	const edgeFromReturnToWork = graph.edges.find(
		(edge) => edge.source === returnNode!.id && edge.target === workNode!.id,
	);
	assert.equal(edgeFromReturnToWork, undefined);

	const returnToEndPath = graph.edges.find((edge) => edge.source === returnNode!.id);
	assert.ok(returnToEndPath);
	assert.notEqual(returnToEndPath!.target, workNode!.id);
});

test('multiple returns are unified by merge before end', async () => {
	const body = createFunctionBody(`
		function sample(a: boolean, b: boolean) {
			if (a) {
				return 1;
			}
			if (b) {
				return 2;
			}
			doWork();
		}
	`);

	const graph = await new DiagramBuilder().buildStatements(body.getStatements());
	const endNode = graph.nodes.find((node) => node.type === 'end');
	assert.ok(endNode);

	const returnNodes = graph.nodes.filter((node) => {
		const sourceText = (node.data as { sourceText?: unknown } | undefined)?.sourceText;
		return typeof sourceText === 'string' && sourceText.trim().startsWith('return');
	});
	assert.equal(returnNodes.length, 2);

	const mergeIntoEndEdge = graph.edges.find((edge) => {
		if (edge.target !== endNode!.id) {
			return false;
		}

		const sourceNode = graph.nodes.find((node) => node.id === edge.source);
		return sourceNode?.type === 'merge';
	});
	assert.ok(mergeIntoEndEdge);

	for (const returnNode of returnNodes) {
		const edgeToMerge = graph.edges.find(
			(edge) => edge.source === returnNode.id && edge.target === mergeIntoEndEdge!.source,
		);
		assert.ok(edgeToMerge);
	}
});

test('diagram does not contain merge nodes with fewer than two incoming edges', async () => {
	const body = createFunctionBody(`
		function sample(flag: boolean) {
			if (flag) {
				return 1;
			}

			doWork();
		}
	`);

	const graph = await new DiagramBuilder().buildStatements(body.getStatements());
	const mergeNodes = graph.nodes.filter((node) => node.type === 'merge');

	for (const mergeNode of mergeNodes) {
		const incoming = graph.edges.filter((edge) => edge.target === mergeNode.id);
		assert.ok(incoming.length >= 2);
	}

	const workNode = graph.nodes.find((node) => {
		const sourceText = (node.data as { sourceText?: unknown } | undefined)?.sourceText;
		return typeof sourceText === 'string' && sourceText.includes('doWork()');
	});
	assert.ok(workNode);

	const endNode = graph.nodes.find((node) => node.type === 'end');
	assert.ok(endNode);

	assert.ok(graph.edges.some((edge) => edge.source === workNode!.id && edge.target === endNode!.id));
});

test('edge IDs are unique', async () => {
	const body = createFunctionBody(`
		function sample(flag: boolean, items: number[]) {
			if (flag) {
				return 1;
			}

			for (let i = 0; i < items.length; i++) {
				if (items[i] < 0) {
					return 2;
				}
			}

			return 3;
		}
	`);

	const graph = await new DiagramBuilder().buildStatements(body.getStatements());
	const edgeIds = graph.edges.map((edge) => edge.id);
	const uniqueIds = new Set(edgeIds);

	assert.equal(uniqueIds.size, edgeIds.length);
});

test('consecutive preparation steps are merged into one action node', async () => {
	const body = createFunctionBody(`
		function sample() {
			const start = 1;
			let total = start;
			total = total + 2;
			doWork(total);
		}
	`);

	const graph = await new DiagramBuilder().buildStatements(body.getStatements());
	const prepNodes = graph.nodes.filter((node) => {
		if (node.type !== 'action') {
			return false;
		}

		const label = String((node.data as { label?: unknown } | undefined)?.label ?? '');
		return label.startsWith('Prepare');
	});

	assert.equal(prepNodes.length, 1);
	const prepSource = String((prepNodes[0].data as { sourceText?: unknown } | undefined)?.sourceText ?? '');
	assert.ok(prepSource.includes('const start = 1;'));
	assert.ok(prepSource.includes('let total = start;'));
	assert.ok(prepSource.includes('total = total + 2;'));
});
