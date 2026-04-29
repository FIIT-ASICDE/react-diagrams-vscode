import assert from 'node:assert/strict';
import test from 'node:test';

import { assertSyntacticallyValidTypeScript, generateFromBody } from './helpers';

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
	assert.doesNotMatch(generated, /try\s*\{\s*\}\s*finally/);
	assert.doesNotMatch(generated, /if\s*\(!input\)\s*\{\s*try\s*\{\s*\}\s*finally/);
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
	assert.doesNotMatch(generated, /if\s*\(strict\)\s*\{\s*try\s*\{\s*\}\s*finally/);
	assert.equal((generated.match(/cleanup\(\);/g) ?? []).length, 1);
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

test('codeGen throw in try emits structural catch/finally', async () => {
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
	assert.match(generated, /finally\s*\{/);
	assert.match(generated, /recover\(err\)|recover\(e\)/);
	assert.match(generated, /cleanup\(\);/);
	assert.match(generated, /after\(\);/);
});

test('codeGen return in try executes finally exactly once before return path', async () => {
	const generated = await generateFromBody(`
		try {
			return 'from-try';
		} finally {
			cleanup();
		}
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /try\s*\{[\s\S]*\}\s*finally\s*\{/);
	assert.match(generated, /return\s+'from-try';/);
	assert.equal((generated.match(/cleanup\(\);/g) ?? []).length, 1);
});

test('codeGen finally conditional return overrides only yes branch and preserves no flow', async () => {
	const generated = await generateFromBody(`
		try {
			return 'pending';
		} finally {
			if (config.forceFinallyReturn) return 'forced';
		}
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /if\s*\(config\.forceFinallyReturn\)/);
	assert.match(generated, /return\s+'forced';/);
	assert.match(generated, /return\s+'pending';/);
});

test('codeGen continue and break inside try execute finally first', async () => {
	const generated = await generateFromBody(`
		for (const item of items) {
			try {
				if (!item) continue;
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
	assert.match(generated, /try\s*\{/);
	assert.match(generated, /finally\s*\{[\s\S]*cleanup\(item\);/);
	assert.match(generated, /continue;/);
	assert.match(generated, /break;/);
	assert.match(generated, /return\s+'done';/);
	assert.doesNotMatch(generated, /if\s*\(!item\)\s*\{\s*try\s*\{\s*\}\s*finally/);
	assert.doesNotMatch(generated, /if\s*\(item\.stop\)\s*\{\s*try\s*\{\s*\}\s*finally/);
});

test('codeGen nested retry try/catch/finally remains structural', async () => {
	const generated = await generateFromBody(`
		let attempt = 0;
		while (attempt < retries) {
			try {
				const response = await fetch(url);
				if (!response.ok) throw new Error('bad');
				return await response.json();
			} catch (err) {
				attempt += 1;
				if (attempt >= retries) throw err;
			} finally {
				tick();
			}
		}
		return null;
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /while\s*\(attempt\s*<\s*retries\)/);
	assert.match(generated, /try\s*\{/);
	assert.match(generated, /catch\s*\(/);
	assert.match(generated, /finally\s*\{/);
	assert.match(generated, /tick\(\);/);
});

test('codeGen return in switch inside try/finally stays in switch case', async () => {
	const generated = await generateFromBody(`
		try {
			switch (kind) {
				case 'a':
					return 'a';
				default:
					work();
			}
		} finally {
			cleanup();
		}
		after();
	`);

	assertSyntacticallyValidTypeScript(generated);
	assert.match(generated, /try\s*\{[\s\S]*switch\s*\(kind\)/);
	assert.match(generated, /case\s+'a':[\s\S]*return\s+'a';/);
	assert.match(generated, /finally\s*\{[\s\S]*cleanup\(\);/);
	assert.match(generated, /after\(\);/);
	assert.doesNotMatch(generated, /case\s+'a':[\s\S]*try\s*\{\s*\}\s*finally/);
});
