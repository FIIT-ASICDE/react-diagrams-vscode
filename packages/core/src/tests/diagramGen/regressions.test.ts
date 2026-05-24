import assert from 'node:assert/strict';
import test from 'node:test';

import {
	assertSyntacticallyValidTypeScript,
	buildGraphFromBody,
	generateFromFunctionBody,
	hasPath,
	nodeByConstruct,
	nodeByText,
	nodeText,
	outgoingFrom,
	targetNode,
} from './helpers';

test('DiagramBuilder routes switch breaks to post-switch flow, not to end nodes', async () => {
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
	const doneReturn = nodeByText(graph, "return 'done'");

	assert.ok(breakNodes.length >= 2);
	assert.ok(doneReturn);

	const endNodeIds = new Set(graph.nodes.filter((node: any) => node.type === 'end').map((node: any) => String(node.id)));

	for (const breakNode of breakNodes) {
		const outgoing = outgoingFrom(graph, breakNode.id);
		assert.ok(outgoing.length > 0);
		assert.equal(outgoing.some((edge: any) => endNodeIds.has(String(edge.target))), false);
		assert.ok(hasPath(graph, breakNode.id, doneReturn.id));
	}

	assert.ok(graph.edges.some((edge: any) => String(edge.label ?? '') === 'exit switch'));
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

	assert.ok(returnNodes.length >= 4);
	assert.ok(endNodes.length >= 4);

	for (const returnNode of returnNodes) {
		const outgoing = outgoingFrom(graph, returnNode.id);
		assert.ok(outgoing.some((edge: any) => targetNode(graph, edge)?.type === 'end'));
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
	assert.ok(switchStart >= 0);
	assert.ok(doneIndex > switchStart);
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
	assert.ok(afterIndex > switchIndex);
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
});

test('diagramGen non-switch decision edges are always labeled yes/no', async () => {
	const graph = await buildGraphFromBody(`
		let total = 0;
		for (const item of items) {
			if (!item) continue;
			if (item.stop) break;
			try {
				if (item.fatal) return 'fatal';
				use(item);
			} finally {
				if (total > limit) break;
				total += item.value ?? 0;
			}
		}
		return total;
	`);

	for (const node of graph.nodes as any[]) {
		if (node.type !== 'decision') continue;
		const construct = String(node?.data?.construct ?? '');
		if (construct === 'switch') continue;

		const outgoing = outgoingFrom(graph, node.id);
		for (const edge of outgoing) {
			const label = String(edge.label ?? '').trim().toLowerCase();
			assert.ok(label.length > 0, `Decision edge ${edge.id} from ${node.id} must be labeled`);
			assert.ok(
				label === 'yes' || label === 'no' || label === 'true' || label === 'false',
				`Decision edge ${edge.id} from ${node.id} has unexpected label '${label}'`,
			);
		}
	}
});
