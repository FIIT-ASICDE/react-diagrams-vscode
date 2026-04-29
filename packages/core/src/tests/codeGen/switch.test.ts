import assert from 'node:assert/strict';
import test from 'node:test';

import { assertSyntacticallyValidTypeScript, blockFor, generateFromBody } from './helpers';

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

test('codeGen switch post-flow is reached via exit switch boundary', async () => {
	const generated = await generateFromBody(`
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
		afterSwitch();
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /switch\s*\(kind\)/);
	assert.match(generated, /afterSwitch\(\);/);

	const switchBlock = blockFor(generated, /switch\s*\(kind\)/);
	assert.doesNotMatch(switchBlock, /afterSwitch\(\)/);
});

test('codeGen all-return switch does not emit unreachable post-switch code', async () => {
	const generated = await generateFromBody(`
		switch (kind) {
			case 'a': return 'a';
			case 'b': return 'b';
			default: return 'x';
		}
		afterSwitch();
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /case\s+'a':[\s\S]*return\s+'a';/);
	assert.match(generated, /case\s+'b':[\s\S]*return\s+'b';/);
	assert.match(generated, /default:[\s\S]*return\s+'x';/);
	assert.doesNotMatch(generated, /afterSwitch\(\);/);
});
