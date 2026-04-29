import assert from 'node:assert/strict';
import test from 'node:test';

import { convertDiagramToCode } from '../../@react-activity-diagrams/code-snippet/main';
import { assertSyntacticallyValidTypeScript, generateFromBody } from './helpers';

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
	assert.doesNotMatch(generated, /return\s+'error';/);
});

test('codeGen keeps full finally sequence inside one finally block', async () => {
	const generated = await generateFromBody(`
		let total = 0;
		let warnings = 0;
		for (const item of items) {
			try {
				if (item.skip) continue;
				if (item.stop) break;
				use(item);
			} finally {
				audit.push('outer-finally');
				if (total > config.finalLimit) break;
				if (warnings > config.absoluteWarningLimit) {
					return { status: 'warning-limit' };
				}
				if (config.forceFinallyReturn) {
					return { status: 'forced-finally-return' };
				}
			}
		}
		after();
	`);

	assertSyntacticallyValidTypeScript(generated);

	assert.match(generated, /finally\s*\{/);
	assert.match(generated, /audit\.push\('outer-finally'\);/);
	assert.match(generated, /if\s*\(total\s*>\s*config\.finalLimit\)\s*\{?[\s\S]*break;/);
	assert.match(generated, /if\s*\(warnings\s*>\s*config\.absoluteWarningLimit\)/);
	assert.match(generated, /status:\s*'warning-limit'/);
	assert.match(generated, /if\s*\(config\.forceFinallyReturn\)/);
	assert.match(generated, /status:\s*'forced-finally-return'/);

	const finallyMatch = generated.match(/finally\s*\{([\s\S]*?)\}\s*(?:after\(|$)/);
	assert.ok(finallyMatch, 'Expected finally block before post-try continuation');
	const finallyBody = finallyMatch[1];
	assert.match(finallyBody, /audit\.push\('outer-finally'\);/);
	assert.match(finallyBody, /config\.forceFinallyReturn/);

	const afterFinally = generated.slice(generated.lastIndexOf('}') + 1);
	assert.doesNotMatch(afterFinally, /config\.forceFinallyReturn/);
});
