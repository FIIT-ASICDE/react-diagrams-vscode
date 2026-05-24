import assert from 'node:assert/strict';
import test from 'node:test';

import { assertSyntacticallyValidTypeScript, generateFromBody } from './helpers';

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
