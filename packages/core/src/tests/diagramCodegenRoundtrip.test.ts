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

test('diagram->code emits expandable sourceText verbatim for class nodes', () => {
	const classSource = `class testClass {
	private condition: boolean;
	public functionTest() { this.testMethod(); }
	constructor(condition: boolean) { this.condition = condition; }
	private testMethod() {
		console.log('This is a test method');
		const fn = () => {
			if (this.condition) {
				console.log('Condition is true');
			}
		};
	}
}`;

	const nodes = [
		{ id: 'initial-1', type: 'initial', position: { x: 0, y: 0 }, data: { label: 'Start' } },
		{ id: 'expandable-1', type: 'expandable', position: { x: 0, y: 80 }, data: { label: 'class testClass', sourceText: classSource } },
		{ id: 'end-1', type: 'end', position: { x: 0, y: 160 }, data: { label: 'End' } },
	] as unknown as import('@xyflow/react').Node[];

	const edges = [
		{ id: 'edge-1', source: 'initial-1', target: 'expandable-1' },
		{ id: 'edge-2', source: 'expandable-1', target: 'end-1' },
	] as unknown as import('@xyflow/react').Edge[];

	const generated = convertDiagramToCode(nodes, edges, 'generatedClass', []);

	assert.match(generated, /class\s+testClass\s*\{/);
	assert.match(generated, /private\s+condition\s*:\s*boolean/);
	assert.match(generated, /private\s+testMethod\s*\(/);
	assert.match(generated, /if\s*\(this\.condition\)/);
	assertSyntacticallyValidTypeScript(generated);
});

test('diagram->code does not duplicate try body inside retry loop', async () => {
	const generated = await generateFromFunctionBody(`
		let attempt = 0;
		while (attempt < retries) {
			try {
				const response = await fetch(url);
				if (!response.ok) throw new Error(\`HTTP error: \${response.status}\`);
				const data = await response.json();
				return data;
			} catch (err) {
				attempt++;
			}
		}
		throw new Error('Failed after max retries');
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /while\s*\(attempt < retries\)/);
	assert.match(generated, /try\s*\{/);

	const fetchOccurrences = (generated.match(/const response = await fetch\(url\);/g) ?? []).length;
	assert.equal(fetchOccurrences, 1);
});

test('diagram->code keeps finally actions for return in try', async () => {
	const generated = await generateFromFunctionBody(`
		functionWithFinally();
		try {
			return computeValue();
		} finally {
			console.log('inner tick');
		}
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /try\s*\{/);
	assert.match(generated, /finally\s*\{/);
	assert.match(generated, /console\.log\('inner tick'\)/);
	assert.match(generated, /return\s+computeValue\(\)/);
	assert.doesNotMatch(generated, /return[^\n]*\n\s*\/\/ finally/);
});

test('diagram->code keeps throw->catch->finally flow and normalizes catch references', async () => {
	const generated = await generateFromFunctionBody(`
		try {
			throw new Error('boom');
		} catch (e) {
			console.log(e.message);
		} finally {
			console.log('outer tick');
		}
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /catch\s*\(err\)/);
	assert.match(generated, /console\.log\(err\.message\)/);
	assert.doesNotMatch(generated, /console\.log\(e\.message\)/);
	assert.match(generated, /finally\s*\{/);
	assert.match(generated, /console\.log\('outer tick'\)/);
});

test('diagram->code keeps nested try/finally inside while in for-of skeleton', async () => {
	const generated = await generateFromFunctionBody(`
		for (const item of items) {
			while (item.active) {
				try {
					tick(item);
				} finally {
					console.log('inner tick');
				}
				item.active = false;
			}
		}
		console.log('outer tick');
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /for\s*\(const item of items\)\s*\{/);
	assert.match(generated, /while\s*\(item\.active\)\s*\{/);
	assert.match(generated, /finally\s*\{/);
	assert.match(generated, /console\.log\('inner tick'\)/);
	assert.match(generated, /console\.log\('outer tick'\)/);
});

test('diagram->code keeps continue inside try with finally action', async () => {
	const generated = await generateFromFunctionBody(`
		for (const item of items) {
			try {
				if (!item.ok) {
					continue;
				}
			} finally {
				console.log('tick');
			}
			use(item);
		}
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /continue;/);
	assert.match(generated, /try\s*\{[\s\S]*continue;[\s\S]*\}\s*finally\s*\{/);
	assert.match(generated, /finally\s*\{/);
	assert.match(generated, /console\.log\('tick'\)/);
	assert.doesNotMatch(generated, /continue;\s*\n\s*\/\/ finally/);
});

test('diagram->code keeps break in nested loop with finally action', async () => {
	const generated = await generateFromFunctionBody(`
		for (const item of items) {
			while (item.count > 0) {
				try {
					if (item.stop) {
						break;
					}
					item.count--;
				} finally {
					console.log('inner tick');
				}
			}
		}
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /break;/);
	assert.match(generated, /try\s*\{[\s\S]*break;[\s\S]*\}\s*finally\s*\{/);
	assert.match(generated, /finally\s*\{/);
	assert.match(generated, /console\.log\('inner tick'\)/);
	assert.doesNotMatch(generated, /break;\s*\n\s*\/\/ finally/);
});

test('diagram->code keeps trailing return after outer loop', async () => {
	const generated = await generateFromFunctionBody(`
		let total = 0;
		for (const item of items) {
			while (item.count > 0) {
				total += 1;
				if (total % 2 === 0) {
					break;
				}
				item.count--;
			}
		}
		return total;
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /for\s*\(const item of items\)/);
	assert.match(generated, /while\s*\(item\.count > 0\)/);
	assert.match(generated, /if\s*\(total % 2 === 0\)/);
	assert.match(generated, /break;/);
	assert.match(generated, /return\s+total;/);
});

test('diagram->code emits post-loop guard after while block, not inside loop body', async () => {
	const generated = await generateFromFunctionBody(`
		for (const item of items) {
			let j = 0;
			while (j < item.value) {
				count += item.value;
				j += 1;
			}
			if (count > 20) {
				break;
			}
		}
		return count;
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /while\s*\(j < item\.value\)\s*\{[\s\S]*j \+= 1;[\s\S]*\}/);
	assert.match(generated, /}\s*\n\s*if\s*\(count > 20\)\s*\{/);
	assert.match(generated, /if\s*\(count > 20\)\s*\{[\s\S]*break;/);
	assert.match(generated, /return\s+count;/);
});

test('diagram->code catch parameter is consistent with err', async () => {
	const generated = await generateFromFunctionBody(`
		try {
			risky();
		} catch (e) {
			logger(e.message);
			if (e.name) {
				logger(e.name);
			}
		}
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /catch\s*\(err\)/);
	assert.doesNotMatch(generated, /\be\./);
	assert.match(generated, /err\.message/);
});

test('diagram->code keeps switch break scoped to switch and continues after switch', async () => {
	const generated = await generateFromFunctionBody(`
		for (const item of items) {
			switch (item.kind) {
				case 'a':
					break;
				default:
					tick(item);
			}
			afterSwitch(item);
		}
		return done;
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /switch\s*\(item\.kind\)/);
	assert.match(generated, /case\s+'a':/);
	assert.match(generated, /break;/);
	assert.match(generated, /afterSwitch\(item\);/);
	assert.match(generated, /return\s+done;/);
});

test('diagram->code does not absorb labeled continue in inner loop', async () => {
	const generated = await generateFromFunctionBody(`
		outer: for (const item of items) {
			let j = 0;
			while (j < item.value) {
				j += 1;
				if (item.skipOuter) {
					continue outer;
				}
			}
			use(item);
		}
		return total;
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /continue\s+outer;/);
	assert.match(generated, /return\s+total;/);
});

test('diagram->code keeps post-switch break guard outside inner while body', async () => {
	const generated = await generateFromFunctionBody(`
		let count = 0;
		for (const item of items) {
			switch (item.kind) {
				case 'a': {
					let j = 0;
					while (j < item.value) {
						count += j;
						j += 1;
					}
					handleA(item);
					break;
				}
				default:
					handleDefault(item);
			}

			if (count > 20) {
				break;
			}
		}
		return count;
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /switch\s*\(item\.kind\)/);
	assert.match(generated, /if\s*\(count > 20\)\s*\{[\s\S]*break;/);

	const whileBlock = generated.match(/while\s*\(j < item\.value\)\s*\{[\s\S]*?\n\s*\}/);
	assert.ok(whileBlock, 'Expected while block in generated code');
	assert.doesNotMatch(whileBlock![0], /if\s*\(count > 20\)/);
});

test('diagram->code continues after try/finally with trailing return', async () => {
	const generated = await generateFromFunctionBody(`
		try {
			runWork();
		} finally {
			cleanup();
		}
		return 'done';
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /try\s*\{/);
	assert.match(generated, /finally\s*\{/);
	assert.match(generated, /cleanup\(\);/);
	assert.match(generated, /return\s+'done';/);
});

test('diagram->code continues after try/catch/finally when not all paths terminate', async () => {
	const generated = await generateFromFunctionBody(`
		try {
			if (flag) {
				return 1;
			}
			runWork();
		} catch (error) {
			handleError(error);
		} finally {
			cleanup();
		}
		return 2;
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /catch\s*\(err\)/);
	assert.match(generated, /finally\s*\{/);
	assert.match(generated, /return\s+2;/);
});

test('diagram->code does not continue after try/catch/finally when both paths terminate', async () => {
	const generated = await generateFromFunctionBody(`
		try {
			return 1;
		} catch (error) {
			throw error;
		} finally {
			cleanup();
		}
		return 2;
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /finally\s*\{/);
	assert.match(generated, /return\s+1;/);
	assert.match(generated, /throw\s+err/);
	assert.doesNotMatch(generated, /return\s+2;/);
});

test('diagram->code keeps nested and outer finally scopes separated', async () => {
	const generated = await generateFromFunctionBody(`
		try {
			while (count < 2) {
				try {
					tick();
				} catch (error) {
					handleInner(error);
				} finally {
					console.log('inner tick');
				}
				count += 1;
			}
		} catch (error) {
			handleOuter(error);
		} finally {
			console.log('outer tick');
		}
		return count;
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /console\.log\('inner tick'\)/);
	assert.match(generated, /console\.log\('outer tick'\)/);
	assert.match(generated, /return\s+count;/);
	assert.match(generated, /finally\s*\{[\s\S]*console\.log\('outer tick'\);[\s\S]*\}\s*return\s+count;/);
});

test('diagram->code does not wrap terminating action in extra try/finally inside surrounding try', async () => {
	const generated = await generateFromFunctionBody(`
		for (const item of items) {
			try {
				if (!item.ok) {
					continue;
				}
				if (item.stop) {
					break;
				}
			} finally {
				cleanup(item);
			}
		}
		return total;
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /finally\s*\{[\s\S]*cleanup\(item\);/);
	assert.match(generated, /continue;/);
	assert.match(generated, /break;/);

	const extraSignalWrapper = /try\s*\{\s*(?:continue|break|return|throw)\b[\s\S]*?\}\s*finally\s*\{/g;
	const wrappers = generated.match(extraSignalWrapper) ?? [];
	assert.equal(wrappers.length, 0, 'Expected no signal-level try/finally wrappers');
});

test('diagram->code keeps outer catch/finally and post-loop return in correct scope', async () => {
	const generated = await generateFromFunctionBody(`
		let total = 0;

		outer: for (const item of items) {
			try {
				if (item == null) {
					continue;
				}

				let i = 0;
				while (i < item) {
					try {
						if (i < 0) {
							throw new Error('neg');
						}
						total += i;
					} catch (error) {
						total += 1;
					} finally {
						console.log('inner tick');
					}

					i++;
				}

				if (total % 2 === 0) {
					break;
				}
			} catch (error) {
				if (error.message === 'neg') {
					return 'negative';
				}
				return 'error';
			} finally {
				console.log('outer tick');
			}
		}

		return total;
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /catch\s*\(err\)\s*\{[\s\S]*return\s+'negative';[\s\S]*return\s+'error';/);
	assert.match(generated, /finally\s*\{[\s\S]*console\.log\('inner tick'\);/);
	assert.match(generated, /finally\s*\{[\s\S]*console\.log\('outer tick'\);/);

	const guardOccurrences = (generated.match(/if\s*\(total % 2 === 0\)/g) ?? []).length;
	assert.equal(guardOccurrences, 1, 'Expected post-inner-while guard exactly once');

	const whileBlock = generated.match(/while\s*\(i < item\)\s*\{[\s\S]*?\n\s*\}/);
	assert.ok(whileBlock, 'Expected inner while block');
	assert.doesNotMatch(whileBlock![0], /if\s*\(total % 2 === 0\)/);

	assert.match(generated, /\}\s*\n\s*return\s+total;/);
	const forBlocks = generated.match(/for\s*\([^)]*\)\s*\{[\s\S]*?\n\s*\}/g) ?? [];
	assert.ok(forBlocks.length > 0, 'Expected outer for block');
	const firstForBlock = forBlocks[0];
	assert.ok(firstForBlock, 'Expected first for block content');
	assert.doesNotMatch(firstForBlock, /return\s+total;/);
});
