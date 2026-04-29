import assert from 'node:assert/strict';
import test from 'node:test';

import { assertSyntacticallyValidTypeScript, blockFor, generateFromBody } from './helpers';

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
