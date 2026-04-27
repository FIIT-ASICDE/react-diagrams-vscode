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
		`Expected syntactically valid TypeScript, got: ${syntaxDiagnostics.map((d) => d.messageText).join(' | ')}\n\nGenerated:\n${source}`,
	);
}

async function generateFromFunctionBody(bodySource: string): Promise<string> {
	const project = new Project({ compilerOptions: { allowJs: true, jsx: 2 } });
	const sourceFile = project.createSourceFile(
		'roundtrip-source.ts',
		`async function source() {\n${bodySource}\n}`,
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
	assert.match(generated, /doWork\(\)/);
	assert.match(generated, /return\s+2/);
});

test('diagram->code supports loop reconstruction', async () => {
	const generated = await generateFromFunctionBody(`
		while (count < 3) {
			count += 1;
		}
		finish();
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /while\s*\(count < 3\)/);
	assert.match(generated, /count \+= 1/);
	assert.match(generated, /finish\(\)/);
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
	assert.match(generated, /switch\s*\(kind\)/);
	assert.match(generated, /case\s+'a':/);
	assert.match(generated, /case\s+'b':/);
	assert.match(generated, /default:/);
	assert.match(generated, /handleA\(\)/);
	assert.match(generated, /handleB\(\)/);
	assert.match(generated, /handleDefault\(\)/);
});

test('diagram->code supports try/catch/finally as inline finally flow', async () => {
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
	assert.match(generated, /catch\s*\(e\)/);
	assert.match(generated, /runWork\(\)/);
	assert.match(generated, /handleError\(/);
	assert.match(generated, /cleanup\(\)/);
	assert.doesNotMatch(generated, /finally\s*\{/);
});

test('diagram->code does not overflow on cyclic graphs with explicit back edge', () => {
	const nodes = [
		{ id: 'initial-1', type: 'initial', position: { x: 0, y: 0 }, data: { label: 'Start' } },
		{ id: 'action-1', type: 'action', position: { x: 0, y: 80 }, data: { label: 'let attempt = 0', sourceText: 'let attempt = 0;' } },
		{ id: 'decision-1', type: 'decision', position: { x: 0, y: 160 }, data: { label: 'attempt < retries', sourceText: 'attempt < retries' } },
		{ id: 'action-2', type: 'action', position: { x: -100, y: 240 }, data: { label: 'attempt++', sourceText: 'attempt++;' } },
		{ id: 'action-3', type: 'action', position: { x: 100, y: 240 }, data: { label: 'throw err', sourceText: 'throw err;', construct: 'throw' } },
		{ id: 'end-1', type: 'end', position: { x: 0, y: 320 }, data: { label: 'End' } },
	] as any;

	const edges = [
		{ id: 'e1', source: 'initial-1', target: 'action-1' },
		{ id: 'e2', source: 'action-1', target: 'decision-1' },
		{ id: 'e3', source: 'decision-1', target: 'action-2', label: 'yes' },
		{ id: 'e4', source: 'action-2', target: 'decision-1', type: 'back' },
		{ id: 'e5', source: 'decision-1', target: 'action-3', label: 'no' },
		{ id: 'e6', source: 'action-3', target: 'end-1' },
	] as any;

	const generated = convertDiagramToCode(nodes, edges, 'retryGenerated', []);

	assertSyntacticallyValidTypeScript(generated);
	assert.ok(generated.length > 0);
	assert.doesNotMatch(generated, /Maximum call stack|RangeError/i);
});

test('diagram->code supports complex full skeleton roundtrip', async () => {
	const generated = await generateFromFunctionBody(`
		let total = 0;
		let accepted = 0;
		let rejected = 0;
		let warnings = 0;

		outer: for (const record of records) {
			if (!record) {
				rejected++;
				continue;
			}

			if (record.disabled) {
				warnings++;
				continue;
			}

			try {
				switch (record.kind) {
					case 'batch':
						for (let i = 0; i < record.items.length; i++) {
							const item = record.items[i];

							if (!item) continue;

							if (item.invalid) {
								warnings++;
								continue outer;
							}

							total += item.priority > 5 ? item.priority : 1;

							if (total > config.hardLimit) {
								return 'hard-limit';
							}
						}
						break;

					case 'fallthrough-a':
						total += 1;

					case 'fallthrough-b':
						total += 2;
						break;

					case 'loop-test':
						let i = 0;
						while (i < record.tasks.length) {
							const task = record.tasks[i];

							if (!task) {
								i++;
								continue;
							}

							if (task.cancelled) {
								warnings++;
								break;
							}

							do {
								total += task.weight > 10 ? task.weight : 1;

								if (total >= config.softLimit) {
									break outer;
								}
							} while (false);

							i++;
						}
						break;

					case 'single':
						if (record.value < 0) {
							rejected++;
							break;
						}

						record.value === 0 ? warnings++ : accepted++;

						total += record.value;

						if (accepted > config.maxAccepted) {
							return 'too-many-accepted';
						}
						break;

					default:
						warnings++;
						if (warnings > 10) break outer;
						if (total < 0) return 'invalid';
						if (total >= config.target) break;
				}
			} catch (error) {
				warnings++;
				if (config.strict) return 'error';
			} finally {
				total += 0;

				if (total > config.finalLimit) break;
				if (total < 0) return 'invalid';
				if (total >= config.target) break;
			}
		}

		if (accepted === 0) return 'empty';

		if (total >= config.target) {
			return {
				status: 'complete',
				total,
				accepted,
				rejected,
				warnings,
			};
		}

		return {
			status: 'partial',
			total,
			accepted,
			rejected,
			warnings,
		};
	`);

	assertSyntacticallyValidTypeScript(generated);

	assert.match(generated, /outer:/);
	assert.match(generated, /for\s*\(const record of records\)/);
	assert.match(generated, /switch\s*\(record\.kind\)/);
	assert.match(generated, /case\s+'batch':/);
	assert.match(generated, /case\s+'fallthrough-a':/);
	assert.match(generated, /case\s+'fallthrough-b':/);
	assert.match(generated, /case\s+'loop-test':/);
	assert.match(generated, /case\s+'single':/);
	assert.match(generated, /default:/);

	assert.match(generated, /continue\s+outer;/);
	assert.match(generated, /break\s+outer;/);
	assert.match(generated, /try\s*\{/);
	assert.match(generated, /catch\s*\(e\)/);
	assert.doesNotMatch(generated, /finally\s*\{/);

	assert.match(generated, /total \+= 0/);
	assert.match(generated, /total > config\.finalLimit/);
	assert.match(generated, /return\s+'empty'/);
	assert.match(generated, /status:\s*'complete'/);
	assert.match(generated, /status:\s*'partial'/);
});

test('diagram->code keeps do-while body inside loop', async () => {
	const generated = await generateFromFunctionBody(`
		let i = 0;
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
	assert.match(generated, /i\+\+;/);
	assert.match(generated, /break;/);
	assert.match(generated, /\}\s*while\s*\(i < n\);/);
	assert.match(generated, /return\s+i;/);
});

test('diagram->code keeps nested loop break scoped to inner loop', async () => {
	const generated = await generateFromFunctionBody(`
		let total = 0;
		for (const item of items) {
			let j = 0;
			while (j < item.count) {
				total += j;
				if (total > 20) {
					break;
				}
				j++;
			}
			total += 1;
		}
		return total;
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /for\s*\(const item of items\)/);
	assert.match(generated, /while\s*\(j < item\.count\)/);
	assert.match(generated, /break;/);
	assert.match(generated, /total \+= 1;/);
	assert.match(generated, /return\s+total;/);
});

test('diagram->code keeps labeled continue from nested loop', async () => {
	const generated = await generateFromFunctionBody(`
		outer: for (const item of items) {
			for (const child of item.children) {
				if (child.skipItem) {
					continue outer;
				}
				process(child);
			}
			use(item);
		}
		return done;
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /outer:/);
	assert.match(generated, /continue\s+outer;/);
	assert.match(generated, /process\(child\);/);
	assert.match(generated, /use\(item\);/);
	assert.match(generated, /return\s+done;/);
});

test('diagram->code keeps labeled break from nested switch/loop', async () => {
	const generated = await generateFromFunctionBody(`
		outer: for (const item of items) {
			switch (item.kind) {
				case 'stop':
					break outer;
				case 'skip':
					continue;
				default:
					handle(item);
			}
			afterSwitch(item);
		}
		return result;
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /outer:/);
	assert.match(generated, /switch\s*\(item\.kind\)/);
	assert.match(generated, /break\s+outer;/);
	assert.match(generated, /continue;/);
	assert.match(generated, /afterSwitch\(item\);/);
	assert.match(generated, /return\s+result;/);
});

test('diagram->code handles switch fallthrough as duplicated skeleton branch', async () => {
	const generated = await generateFromFunctionBody(`
		switch (value) {
			case 'a':
				console.log('a');
			case 'b':
				console.log('b');
				break;
			default:
				console.log('x');
		}
		done();
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /case\s+'a':/);
	assert.match(generated, /case\s+'b':/);
	assert.match(generated, /default:/);
	assert.match(generated, /console\.log\('a'\);/);
	assert.match(generated, /console\.log\('b'\);/);
	assert.match(generated, /done\(\);/);
});

test('diagram->code keeps post-switch code outside switch', async () => {
	const generated = await generateFromFunctionBody(`
		for (const item of items) {
			switch (item.kind) {
				case 'a':
					handleA(item);
					break;
				default:
					handleDefault(item);
			}

			if (item.done) {
				break;
			}
		}
		return count;
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /switch\s*\(item\.kind\)/);
	assert.match(generated, /if\s*\(item\.done\)/);
	assert.match(generated, /return\s+count;/);

	const switchBlock = generated.match(/switch\s*\(item\.kind\)\s*\{[\s\S]*?\n\s*\}/);
	assert.ok(switchBlock);
	assert.doesNotMatch(switchBlock![0], /if\s*\(item\.done\)/);
});

test('diagram->code keeps post-while guard outside while body', async () => {
	const generated = await generateFromFunctionBody(`
		let count = 0;
		while (count < limit) {
			count++;
		}
		if (count > 10) {
			return 'large';
		}
		return count;
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /while\s*\(count < limit\)/);
	assert.match(generated, /if\s*\(count > 10\)/);
	assert.match(generated, /return\s+'large';/);
	assert.match(generated, /return\s+count;/);

	const whileBlock = generated.match(/while\s*\(count < limit\)\s*\{[\s\S]*?\n\s*\}/);
	assert.ok(whileBlock);
	assert.doesNotMatch(whileBlock![0], /count > 10/);
});

test('diagram->code supports nested try/catch as skeleton', async () => {
	const generated = await generateFromFunctionBody(`
		try {
			try {
				riskyInner();
			} catch (error) {
				handleInner(error);
			}
			afterInner();
		} catch (error) {
			handleOuter(error);
		}
		return done;
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /try\s*\{/);
	assert.match(generated, /riskyInner\(\);/);
	assert.match(generated, /handleInner/);
	assert.match(generated, /handleOuter/);
	assert.match(generated, /afterInner\(\);/);
	assert.match(generated, /return\s+done;/);
});

test('diagram->code keeps inline finally flow after try/catch', async () => {
	const generated = await generateFromFunctionBody(`
		try {
			run();
		} catch (error) {
			recover(error);
		} finally {
			cleanup();
		}
		after();
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /try\s*\{/);
	assert.match(generated, /catch\s*\(/);
	assert.match(generated, /cleanup\(\);/);
	assert.match(generated, /after\(\);/);
});

test('diagram->code supports for, for-of, while and do-while together', async () => {
	const generated = await generateFromFunctionBody(`
		let total = 0;
		for (let i = 0; i < count; i++) {
			for (const item of items) {
				while (item.value > 0) {
					do {
						total += item.value;
						item.value--;
					} while (false);
				}
			}
		}
		return total;
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /for\s*\(let i = 0; i < count; i\+\+\)/);
	assert.match(generated, /for\s*\(const item of items\)/);
	assert.match(generated, /while\s*\(item\.value > 0\)/);
	assert.match(generated, /do\s*\{/);
	assert.match(generated, /return\s+total;/);
});

test('diagram->code supports early returns inside nested branches', async () => {
	const generated = await generateFromFunctionBody(`
		if (a) {
			if (b) {
				return 'ab';
			}
			return 'a';
		}
		if (c) {
			return 'c';
		}
		return 'none';
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /return\s+'ab';/);
	assert.match(generated, /return\s+'a';/);
	assert.match(generated, /return\s+'c';/);
	assert.match(generated, /return\s+'none';/);
});