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

async function generateFromBody(bodySource: string): Promise<string> {
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

function blockFor(source: string, startPattern: RegExp): string {
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

test('codeGen if/else early return', async () => {
	const generated = await generateFromBody(`
		if (flag) {
			return 1;
		} else {
			doWork();
		}
		return 2;
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /if\s*\(flag\)/);
	assert.match(generated, /return\s+1;/);
	assert.match(generated, /doWork\(\);/);
	assert.match(generated, /return\s+2;/);
});

test('codeGen nested if early returns', async () => {
	const generated = await generateFromBody(`
		if (a) {
			if (b) return 'ab';
			return 'a';
		}
		return 'none';
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /if\s*\(a\)/);
	assert.match(generated, /if\s*\(b\)/);
	assert.match(generated, /return\s+'ab';/);
	assert.match(generated, /return\s+'a';/);
	assert.match(generated, /return\s+'none';/);
});

test('codeGen sequential ifs remain sequential', async () => {
	const generated = await generateFromBody(`
		if (a) x();
		if (b) y();
		done();
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /if\s*\(a\)/);
	assert.match(generated, /x\(\);/);
	assert.match(generated, /if\s*\(b\)/);
	assert.match(generated, /y\(\);/);
	assert.match(generated, /done\(\);/);

	const firstIf = generated.indexOf('if (a)');
	const secondIf = generated.indexOf('if (b)');
	assert.ok(secondIf > firstIf);
});

test('codeGen while reconstruction', async () => {
	const generated = await generateFromBody(`
		while (count < limit) {
			count++;
		}
		after();
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /while\s*\(count < limit\)/);
	assert.match(generated, /count\+\+;/);
	assert.match(generated, /after\(\);/);

	const whileBlock = blockFor(generated, /while\s*\(count < limit\)/);
	assert.doesNotMatch(whileBlock, /after\(\);/);
});

test('codeGen while break scope', async () => {
	const generated = await generateFromBody(`
		while (i < n) {
			if (stop) break;
			i++;
		}
		after();
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /while\s*\(i < n\)/);
	assert.match(generated, /if\s*\(stop\)/);
	assert.match(generated, /break;/);
	assert.match(generated, /after\(\);/);
});

test('codeGen while continue scope', async () => {
	const generated = await generateFromBody(`
		while (i < n) {
			if (skip) continue;
			work();
		}
		after();
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /continue;/);
	assert.match(generated, /work\(\);/);
	assert.match(generated, /after\(\);/);
});

test('codeGen do-while reconstruction', async () => {
	const generated = await generateFromBody(`
		do {
			i++;
		} while (i < n);
		return i;
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /do\s*\{/);
	assert.match(generated, /i\+\+;/);
	assert.match(generated, /\}\s*while\s*\(i < n\);/);
	assert.match(generated, /return\s+i;/);
});

test('codeGen do-while break exits loop', async () => {
	const generated = await generateFromBody(`
		do {
			if (stop) break;
			work();
		} while (again);
		after();
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /do\s*\{/);
	assert.match(generated, /if\s*\(stop\)/);
	assert.match(generated, /break;/);
	assert.match(generated, /work\(\);/);
	assert.match(generated, /after\(\);/);
});

test('codeGen for loop reconstruction', async () => {
	const generated = await generateFromBody(`
		for (let i = 0; i < n; i++) {
			work(i);
		}
		after();
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /for\s*\(let i = 0; i < n; i\+\+\)/);
	assert.match(generated, /work\(i\);/);
	assert.match(generated, /after\(\);/);
});

test('codeGen for-of reconstruction', async () => {
	const generated = await generateFromBody(`
		for (const item of items) {
			use(item);
		}
		return done;
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /for\s*\(const item of items\)/);
	assert.match(generated, /use\(item\);/);
	assert.match(generated, /return\s+done;/);
});

test('codeGen nested loops with inner break', async () => {
	const generated = await generateFromBody(`
		for (const group of groups) {
			for (const item of group.items) {
				if (item.stop) break;
			}
			afterInner();
		}
		afterOuter();
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /for\s*\(const group of groups\)/);
	assert.match(generated, /for\s*\(const item of group\.items\)/);
	assert.match(generated, /break;/);
	assert.match(generated, /afterInner\(\);/);
	assert.match(generated, /afterOuter\(\);/);
});

test('codeGen labeled break outer', async () => {
	const generated = await generateFromBody(`
		outer:
		for (const group of groups) {
			for (const item of group.items) {
				if (item.stop) break outer;
			}
		}
		return done;
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /outer:/);
	assert.match(generated, /break\s+outer;/);
	assert.match(generated, /return\s+done;/);
});

test('codeGen labeled continue outer', async () => {
	const generated = await generateFromBody(`
		outer:
		for (const group of groups) {
			for (const item of group.items) {
				if (item.skip) continue outer;
				use(item);
			}
		}
		return done;
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /outer:/);
	assert.match(generated, /continue\s+outer;/);
	assert.match(generated, /use\(item\);/);
	assert.match(generated, /return\s+done;/);
});

test('codeGen switch cases and post-switch statement', async () => {
	const generated = await generateFromBody(`
		switch (kind) {
			case 'a': a(); break;
			case 'b': b(); break;
			default: d();
		}
		after();
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /switch\s*\(kind\)/);
	assert.match(generated, /case\s+'a':/);
	assert.match(generated, /case\s+'b':/);
	assert.match(generated, /default:/);
	assert.match(generated, /after\(\);/);
});

test('codeGen switch return-only cases', async () => {
	const generated = await generateFromBody(`
		switch (kind) {
			case 'a': return 'a';
			case 'b': return 'b';
			default: return 'x';
		}
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /return\s+'a';/);
	assert.match(generated, /return\s+'b';/);
	assert.match(generated, /return\s+'x';/);
});

test('codeGen switch break is not function return', async () => {
	const generated = await generateFromBody(`
		switch (kind) {
			case 'a': return 'a';
			default: break;
		}
		after();
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /break;/);
	assert.match(generated, /after\(\);/);
});

test('codeGen switch fallthrough skeleton', async () => {
	const generated = await generateFromBody(`
		switch (value) {
			case 'a':
				a();
			case 'b':
				b();
				break;
		}
		after();
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /case\s+'a':/);
	assert.match(generated, /a\(\);/);
	assert.match(generated, /case\s+'b':/);
	assert.match(generated, /b\(\);/);
	assert.match(generated, /after\(\);/);
});

test('codeGen post-switch guard outside switch', async () => {
	const generated = await generateFromBody(`
		for (const item of items) {
			switch (item.kind) {
				case 'a': handleA(item); break;
				default: handleDefault(item);
			}
			if (item.done) break;
		}
		return count;
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /switch\s*\(item\.kind\)/);
	assert.match(generated, /if\s*\(item\.done\)/);
	assert.match(generated, /return\s+count;/);

	const switchBlock = blockFor(generated, /switch\s*\(item\.kind\)/);
	assert.doesNotMatch(switchBlock, /item\.done/);
});

test('codeGen try/catch explicit throw skeleton', async () => {
	const generated = await generateFromBody(`
		try {
			throw new Error('x');
		} catch (err) {
			handle(err);
		}
		after();
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /try\s*\{/);
	assert.match(generated, /throw\s+new\s+Error\('x'\);/);
	assert.match(generated, /catch\s*\(/);
	assert.match(generated, /handle\(/);
	assert.match(generated, /after\(\);/);
});

test('codeGen try/finally cleanup continues after try', async () => {
	const generated = await generateFromBody(`
		try {
			work();
		} finally {
			cleanup();
		}
		after();
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /work\(\);/);
	assert.match(generated, /cleanup\(\);/);
	assert.match(generated, /after\(\);/);
});

test('codeGen try/catch/finally explicit skeleton', async () => {
	const generated = await generateFromBody(`
		try {
			throw new Error('boom');
		} catch (err) {
			recover(err);
		} finally {
			cleanup();
		}
		after();
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /try\s*\{/);
	assert.match(generated, /catch\s*\(/);
	assert.match(generated, /recover\(/);
	assert.match(generated, /cleanup\(\);/);
	assert.match(generated, /after\(\);/);
});

test('codeGen return in try through finally keeps return and after', async () => {
	const generated = await generateFromBody(`
		try {
			if (!input) return 'missing';
			work();
		} finally {
			cleanup();
		}
		after();
		return 'done';
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /return\s+'missing';/);
	assert.match(generated, /cleanup\(\);/);
	assert.match(generated, /after\(\);/);
	assert.match(generated, /return\s+'done';/);
});

test('codeGen finally unconditional return override is represented', async () => {
	const generated = await generateFromBody(`
		try {
			return 'try-return';
		} finally {
			return 'finally-return';
		}
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /return\s+'finally-return';/);
});

test('codeGen finally conditional return override contains both returns', async () => {
	const generated = await generateFromBody(`
		try {
			return 'try-return';
		} finally {
			if (flag) return 'finally-return';
		}
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /if\s*\(flag\)/);
	assert.match(generated, /return\s+'finally-return';/);
	assert.match(generated, /return\s+'try-return';/);
});

test('codeGen catch return through finally keeps after normal branch', async () => {
	const generated = await generateFromBody(`
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

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /if\s*\(strict\)/);
	assert.match(generated, /return\s+'error';/);
	assert.match(generated, /cleanup\(\);/);
	assert.match(generated, /after\(\);/);
	assert.match(generated, /return\s+'ok';/);
});

test('codeGen continue through finally remains syntactically valid', async () => {
	const generated = await generateFromBody(`
		for (const item of items) {
			try {
				if (!item) continue;
			} finally {
				cleanup(item);
			}
			use(item);
		}
		return 'done';
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /continue;/);
	assert.match(generated, /cleanup\(item\);/);
	assert.match(generated, /use\(item\);/);
	assert.match(generated, /return\s+'done';/);
});

test('codeGen labeled continue through finally remains syntactically valid', async () => {
	const generated = await generateFromBody(`
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
		return 'done';
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /outer:/);
	assert.match(generated, /continue\s+outer;/);
	assert.match(generated, /cleanup\(item\);/);
	assert.match(generated, /use\(item\);/);
});

test('codeGen break through finally remains syntactically valid', async () => {
	const generated = await generateFromBody(`
		for (const item of items) {
			try {
				if (item.stop) break;
				work(item);
			} finally {
				cleanup(item);
			}
			afterItem(item);
		}
		return 'done';
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /break;/);
	assert.match(generated, /cleanup\(item\);/);
	assert.match(generated, /afterItem\(item\);/);
	assert.match(generated, /return\s+'done';/);
});

test('codeGen throw in catch with finally remains valid', async () => {
	const generated = await generateFromBody(`
		try {
			throw new Error('x');
		} catch (err) {
			throw err;
		} finally {
			cleanup();
		}
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /catch\s*\(/);
	assert.match(generated, /throw\s+err;/);
	assert.match(generated, /cleanup\(\);/);
});

test('codeGen malformed cyclic graph with back edge does not overflow', () => {
	const nodes = [
		{ id: 'initial-1', type: 'initial', position: { x: 0, y: 0 }, data: { label: 'Start' } },
		{ id: 'action-1', type: 'action', position: { x: 0, y: 80 }, data: { sourceText: 'let attempt = 0;' } },
		{ id: 'decision-1', type: 'decision', position: { x: 0, y: 160 }, data: { sourceText: 'attempt < retries' } },
		{ id: 'action-2', type: 'action', position: { x: -100, y: 240 }, data: { sourceText: 'attempt++;' } },
		{ id: 'action-3', type: 'action', position: { x: 100, y: 240 }, data: { sourceText: 'throw err;', construct: 'throw' } },
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
	assert.doesNotMatch(generated, /Maximum call stack|RangeError/i);
});

test('codeGen legacy try node remains supported', () => {
	const nodes = [
		{ id: 'initial-1', type: 'initial', position: { x: 0, y: 0 }, data: { label: 'Start' } },
		{ id: 'decision-try-1', type: 'decision', position: { x: 0, y: 80 }, data: { construct: 'try', sourceText: 'try' } },
		{ id: 'action-try-1', type: 'action', position: { x: -80, y: 160 }, data: { sourceText: 'work();' } },
		{ id: 'action-catch-1', type: 'action', position: { x: 80, y: 160 }, data: { sourceText: 'handle(e);' } },
		{ id: 'merge-1', type: 'merge', position: { x: 0, y: 240 }, data: {} },
		{ id: 'action-after-1', type: 'action', position: { x: 0, y: 320 }, data: { sourceText: 'after();' } },
		{ id: 'end-1', type: 'end', position: { x: 0, y: 400 }, data: {} },
	] as any;

	const edges = [
		{ id: 'e1', source: 'initial-1', target: 'decision-try-1' },
		{ id: 'e2', source: 'decision-try-1', target: 'action-try-1', label: 'try' },
		{ id: 'e3', source: 'decision-try-1', target: 'action-catch-1', label: 'exception' },
		{ id: 'e4', source: 'action-try-1', target: 'merge-1' },
		{ id: 'e5', source: 'action-catch-1', target: 'merge-1' },
		{ id: 'e6', source: 'merge-1', target: 'action-after-1' },
		{ id: 'e7', source: 'action-after-1', target: 'end-1' },
	] as any;

	const generated = convertDiagramToCode(nodes, edges, 'legacyTry', []);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /try\s*\{/);
	assert.match(generated, /catch\s*\(/);
	assert.match(generated, /work\(\);/);
	assert.match(generated, /handle\(e\);/);
	assert.match(generated, /after\(\);/);
});

test('codeGen complex integration skeleton without materialized catch when no explicit throw route exists', async () => {
	const generated = await generateFromBody(`
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

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /outer:/);
	assert.match(generated, /switch\s*\(batch\.kind\)/);
	assert.match(generated, /case\s+'skip':/);
	assert.match(generated, /continue\s+outer;/);
	assert.match(generated, /case\s+'value':/);
	assert.match(generated, /total \+= batch\.value;/);
	assert.match(generated, /case\s+'stop':/);
	assert.match(generated, /break\s+outer;/);
	assert.match(generated, /return\s+'invalid';/);
	assert.match(generated, /return\s+'limit';/);
	assert.match(generated, /total \+= 0;/);
	assert.match(generated, /return\s+total;/);

	// New diagramGen behavior:
	// catch/exception branch is materialized only when there is an explicit
	// modeled exception route. This input has no explicit `throw`, so the
	// generated skeleton is allowed to omit `return 'error';`.
	assert.doesNotMatch(generated, /return\s+'error';/);
});