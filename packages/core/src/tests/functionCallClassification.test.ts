import assert from 'node:assert/strict';
import test from 'node:test';
import { Project } from 'ts-morph';

import { DiagramBuilder } from '../@react-activity-diagrams';
import { parseActivityPreview } from '../app@core/activity-diagrams/parser';

test('DiagramBuilder keeps function calls as action nodes', async () => {
	const sourceText = `
		function helper() {
			return 1;
		}

		helper();
		const wrapped = callWithCallback(() => helper());
	`;

	const project = new Project({ compilerOptions: { allowJs: true } });
	const sourceFile = project.createSourceFile('function-call-classification.ts', sourceText, { overwrite: true });
	const graph = await new DiagramBuilder().buildStatements(sourceFile.getStatements());

	const expandableLabels = graph.nodes
		.filter((node) => node.type === 'expandable')
		.map((node) => String((node.data as { label?: unknown } | undefined)?.label ?? ''));
	const actionSourceTexts = graph.nodes
		.filter((node) => node.type === 'action')
		.map((node) => String((node.data as { sourceText?: unknown } | undefined)?.sourceText ?? ''));

	assert.ok(expandableLabels.some((label) => /function\s+helper\(\)/.test(label)));
	assert.ok(!expandableLabels.some((label) => /function\s+wrapped\(\)/.test(label)));
	assert.ok(actionSourceTexts.some((text) => text.includes('helper();')));
	assert.ok(actionSourceTexts.some((text) => text.includes('callWithCallback(() => helper())')));
});

test('DiagramBuilder covers core node types', async () => {
	const actionGraph = await new DiagramBuilder().buildStatements([
		new Project({ compilerOptions: { allowJs: true } }).createSourceFile('action.ts', 'logValue(1);', { overwrite: true }).getStatements()[0],
	]);
	assert.ok(actionGraph.nodes.some((node) => node.type === 'action'));
	assert.ok(actionGraph.nodes.some((node) => node.type === 'initial'));
	assert.ok(actionGraph.nodes.some((node) => node.type === 'end'));

	const ifProject = new Project({ compilerOptions: { allowJs: true } });
	const ifSource = ifProject.createSourceFile('if.ts', `
		if (flag) {
			handleTrue();
		} else {
			handleFalse();
		}
	`, { overwrite: true });
	const ifGraph = await new DiagramBuilder().buildStatements(ifSource.getStatements());
	assert.ok(ifGraph.nodes.some((node) => node.type === 'decision'));
	assert.ok(ifGraph.nodes.some((node) => node.type === 'merge'));
	assert.ok(ifGraph.nodes.some((node) => node.type === 'action'));
	assert.ok(ifGraph.edges.some((edge) => String(edge.label ?? '') === 'yes'));
	assert.ok(ifGraph.edges.some((edge) => String(edge.label ?? '') === 'no'));

	const whileProject = new Project({ compilerOptions: { allowJs: true } });
	const whileSource = whileProject.createSourceFile('while.ts', `
		while (shouldContinue()) {
			handleLoop();
		}
	`, { overwrite: true });
	const whileGraph = await new DiagramBuilder().buildStatements(whileSource.getStatements());
	assert.ok(whileGraph.nodes.some((node) => node.type === 'loop'));
	assert.ok(whileGraph.nodes.some((node) => node.type === 'action'));
	assert.ok(whileGraph.edges.some((edge) => edge.type === 'back'));
	assert.ok(whileGraph.edges.some((edge) => String(edge.label ?? '') === 'no'));

	const doWhileProject = new Project({ compilerOptions: { allowJs: true } });
	const doWhileSource = doWhileProject.createSourceFile('do-while.ts', `
		do {
			handleLoop();
		} while (shouldContinue());
	`, { overwrite: true });
	const doWhileGraph = await new DiagramBuilder().buildStatements(doWhileSource.getStatements());
	assert.ok(doWhileGraph.nodes.some((node) => node.type === 'loop'));
	assert.ok(doWhileGraph.nodes.some((node) => node.type === 'action'));
	assert.ok(doWhileGraph.edges.some((edge) => edge.type === 'back'));
	assert.ok(doWhileGraph.edges.some((edge) => String(edge.label ?? '') === 'no'));

	const forProject = new Project({ compilerOptions: { allowJs: true } });
	const forSource = forProject.createSourceFile('for.ts', `
		for (let i = 0; i < items.length; i++) {
			handleItem(items[i]);
		}
	`, { overwrite: true });
	const forGraph = await new DiagramBuilder().buildStatements(forSource.getStatements());
	assert.ok(forGraph.nodes.some((node) => node.type === 'loop'));
	assert.ok(forGraph.nodes.some((node) => node.type === 'action'));
	assert.ok(forGraph.edges.some((edge) => edge.type === 'back'));
	assert.ok(forGraph.edges.some((edge) => String(edge.label ?? '') === 'no'));

	const tryProject = new Project({ compilerOptions: { allowJs: true } });
	const trySource = tryProject.createSourceFile('try.ts', `
		try {
			runWork();
		} catch (error) {
			handleError(error);
		} finally {
			cleanup();
		}
	`, { overwrite: true });
	const tryGraph = await new DiagramBuilder().buildStatements(trySource.getStatements());
	assert.ok(tryGraph.nodes.some((node) => node.type === 'decision'));
	assert.ok(tryGraph.nodes.some((node) => node.type === 'merge'));
	assert.ok(tryGraph.nodes.some((node) => node.type === 'action'));

	const switchProject = new Project({ compilerOptions: { allowJs: true } });
	const switchSource = switchProject.createSourceFile('switch.ts', `
		switch (kind) {
			case 'a':
				handleA();
				break;
			default:
				handleDefault();
		}
	`, { overwrite: true });
	const switchGraph = await new DiagramBuilder().buildStatements(switchSource.getStatements());
	assert.ok(switchGraph.nodes.some((node) => node.type === 'decision'));
	assert.ok(switchGraph.nodes.some((node) => node.type === 'merge'));
	assert.ok(switchGraph.nodes.some((node) => node.type === 'action'));

	const returnGraph = await parseActivityPreview(`
		() => {
			return () => {
				handleInline();
			};
		}
	`, '.');
	assert.ok(returnGraph.nodes.some((node) => node.type === 'expandable' && String((node.data as { label?: unknown } | undefined)?.label ?? '') === 'return'));
});

test('DiagramBuilder labels nested loop exits before a for-loop increment as no', async () => {
	const sourceText = `
		for (let i = 0; i < items.length; i++) {
			while (shouldRetry(items[i])) {
				handle(items[i]);
			}
		}
	`;

	const project = new Project({ compilerOptions: { allowJs: true } });
	const sourceFile = project.createSourceFile('nested-loop-fallthrough-no.ts', sourceText, { overwrite: true });
	const graph = await new DiagramBuilder().buildStatements(sourceFile.getStatements());

	const forDecisionNode = graph.nodes.find((node) => {
		if (node.type !== 'loop') {
			return false;
		}

		const label = String((node.data as { label?: unknown } | undefined)?.label ?? '');
		return label.includes('i < items.length');
	});
	assert.ok(forDecisionNode);

	const innerDecisionNode = graph.nodes.find((node) => {
		if (node.type !== 'loop') {
			return false;
		}

		const label = String((node.data as { label?: unknown } | undefined)?.label ?? '');
		return label.includes('shouldRetry(items[i])');
	});
	assert.ok(innerDecisionNode);

	const incrementNode = graph.nodes.find((node) => {
		if (node.type !== 'action') {
			return false;
		}

		const label = String((node.data as { label?: unknown } | undefined)?.label ?? '');
		return label.trim() === 'i++';
	});
	assert.ok(incrementNode);

	assert.ok(graph.edges.some((edge) => edge.source === innerDecisionNode!.id && edge.target === incrementNode!.id && String(edge.label ?? '') === 'no'));
});

test('DiagramBuilder marks hook callbacks as expandable nodes', async () => {
	const sourceText = `
		const stableHandler = useCallback(() => {
			doWork();
		}, []);

		useEffect(() => {
			stableHandler();
		}, [stableHandler]);
	`;

	const project = new Project({ compilerOptions: { allowJs: true, jsx: 2 } });
	const sourceFile = project.createSourceFile('hook-call-classification.tsx', sourceText, { overwrite: true });
	const graph = await new DiagramBuilder().buildStatements(sourceFile.getStatements());

	const expandableNodes = graph.nodes
		.filter((node) => node.type === 'expandable')
		.map((node) => ({
			label: String((node.data as { label?: unknown } | undefined)?.label ?? ''),
			sourceText: String((node.data as { sourceText?: unknown } | undefined)?.sourceText ?? ''),
			deps: String((node.data as { deps?: unknown } | undefined)?.deps ?? ''),
		}));

	assert.ok(expandableNodes.some((node) => /function\s+stableHandler\(\)/.test(node.label)));
	assert.ok(expandableNodes.some((node) => /useEffect\s+callback/.test(node.label)));
	assert.ok(expandableNodes.some((node) => node.sourceText.includes('doWork();')));
	assert.ok(expandableNodes.some((node) => node.sourceText.includes('stableHandler();')));
	assert.ok(expandableNodes.some((node) => node.deps.trim() === '[]'));
	assert.ok(expandableNodes.some((node) => node.deps.includes('[stableHandler]')));
});

test('DiagramBuilder treats forEach-style callbacks as loop cycles', async () => {
	const sourceText = `
		function forEach<T>(items: T[], cb: (item: T) => void) {
			for (const item of items) cb(item);
		}

		function forEachChild(node: unknown, cb: (child: unknown) => void) {
			cb(node);
		}

		const values = [1, 2, 3];
		values.forEach((value) => {
			logValue(value);
		});

		forEach(values, (value) => {
			logValue(value + 1);
		});

		forEachChild(values, (child) => {
			logValue(child);
		});
	`;

	const project = new Project({ compilerOptions: { allowJs: true } });
	const sourceFile = project.createSourceFile('foreach-loop-classification.ts', sourceText, { overwrite: true });
	const graph = await new DiagramBuilder().buildStatements(sourceFile.getStatements());

	const decisionLabels = graph.nodes
		.filter((node) => node.type === 'loop')
		.map((node) => String((node.data as { label?: unknown } | undefined)?.label ?? ''));
	const cycleEdges = graph.edges.filter((edge) => edge.type === 'back');
	const loopEntryEdges = graph.edges.filter((edge) => String(edge.label ?? '') === 'each');

	assert.ok(decisionLabels.some((label) => /forEach/i.test(label)));
	assert.ok(decisionLabels.some((label) => /forEachChild/i.test(label)));
	assert.ok(loopEntryEdges.length >= 3);
	assert.ok(cycleEdges.length >= 3);
});

test('DiagramBuilder stores hook dependencies in node metadata', async () => {
	const sourceText = `
		const [storedValue, setStoredValue] = useState(() => {
			try {
				const item = window.localStorage.getItem(key);
				return item ? JSON.parse(item) : initialValue;
			} catch (error) {
				console.error('LocalStorage read error:', error);
				return initialValue;
			}
		});

		const setValue = useCallback(
			(value) => {
				try {
					const valueToStore = value instanceof Function ? value(storedValue) : value;
					setStoredValue(valueToStore);
					window.localStorage.setItem(key, JSON.stringify(valueToStore));
				} catch (error) {
					console.error('LocalStorage write error:', error);
				}
			},
			[key, storedValue]
		);
	`;

	const project = new Project({ compilerOptions: { allowJs: true, jsx: 2 } });
	const sourceFile = project.createSourceFile('hook-dependency-nodes.tsx', sourceText, { overwrite: true });
	const graph = await new DiagramBuilder().buildStatements(sourceFile.getStatements());

	const expandableNodes = graph.nodes
		.filter((node) => node.type === 'expandable')
		.map((node) => ({
			label: String((node.data as { label?: unknown } | undefined)?.label ?? ''),
			deps: String((node.data as { deps?: unknown } | undefined)?.deps ?? ''),
		}));

	assert.ok(expandableNodes.some((node) => node.deps.trim() === '[]'));
	assert.ok(expandableNodes.some((node) => node.deps.includes('[key, storedValue]')));
	assert.ok(expandableNodes.some((node) => /useState\s+initializer/.test(node.label)));
	assert.ok(expandableNodes.some((node) => /function\s+setValue\(\)/.test(node.label)));
});

test('DiagramBuilder keeps return statements with inline arrow functions expandable', async () => {
	const sourceText = `
		() => {
			return () => {
				if (flag) {
					handle();
				}
			};
		}
	`;

	const graph = await parseActivityPreview(sourceText, '.');

	const returnNode = graph.nodes.find((node) => {
		if (node.type !== 'expandable') {
			return false;
		}

		const label = String((node.data as { label?: unknown } | undefined)?.label ?? '');
		return label === 'return';
	});

	assert.ok(returnNode);
	const source = String((returnNode!.data as { sourceText?: unknown } | undefined)?.sourceText ?? '');
	assert.ok(source.includes('if (flag)'));
	assert.ok(source.includes('handle();'));
});

test('Hook preview keeps inner listener function metadata and source', async () => {
	const sourceText = `
		() => {
			if (!element?.addEventListener) return;
			const listener = (event) => savedHandler.current(event);
			element.addEventListener(eventName, listener);
			return () => element.removeEventListener(eventName, listener);
		}
	`;

	const graph = await parseActivityPreview(sourceText, '.');

	const listenerNode = graph.nodes.find((node) => {
		if (node.type !== 'expandable') {
			return false;
		}

		const label = String((node.data as { label?: unknown } | undefined)?.label ?? '');
		return /function\s+listener\(\)/.test(label);
	});

	assert.ok(listenerNode);
	const source = String((listenerNode!.data as { sourceText?: unknown } | undefined)?.sourceText ?? '');
	assert.ok(source.includes('(event) => savedHandler.current(event)'));
});

test('DiagramBuilder handles do-while and labels decision-to-end as no', async () => {
	const sourceText = `
		let index = 0;
		do {
			index += 1;
		} while (index < 2);
	`;

	const project = new Project({ compilerOptions: { allowJs: true } });
	const sourceFile = project.createSourceFile('do-while-classification.ts', sourceText, { overwrite: true });
	const graph = await new DiagramBuilder().buildStatements(sourceFile.getStatements());

	const decisionNode = graph.nodes.find((node) => {
		if (node.type !== 'loop') {
			return false;
		}

		const label = String((node.data as { label?: unknown } | undefined)?.label ?? '');
		return label.includes('index < 2');
	});

	assert.ok(decisionNode);
	const bodyNode = graph.nodes.find((node) => {
		if (node.type !== 'action') {
			return false;
		}

		const sourceText = String((node.data as { sourceText?: unknown } | undefined)?.sourceText ?? '');
		return sourceText.includes('index += 1');
	});
	assert.ok(bodyNode);
	assert.ok(graph.edges.some((edge) => edge.source === bodyNode!.id && edge.target === decisionNode!.id && edge.type !== 'back'));
	assert.ok(graph.edges.some((edge) => edge.source === decisionNode!.id && edge.target === bodyNode!.id && edge.type === 'back' && String(edge.label ?? '') === 'yes'));
	const endNode = graph.nodes.find((node) => node.type === 'end');
	assert.ok(endNode);
	assert.ok(graph.edges.some((edge) => edge.source === decisionNode!.id && edge.target === endNode!.id && String(edge.label ?? '') === 'no'));
});

test('DiagramBuilder labels do-while no-path to next statement', async () => {
	const sourceText = `
		let index = 0;
		do {
			index += 1;
		} while (index < 2);
		finish(index);
	`;

	const project = new Project({ compilerOptions: { allowJs: true } });
	const sourceFile = project.createSourceFile('do-while-fallthrough-label.ts', sourceText, { overwrite: true });
	const graph = await new DiagramBuilder().buildStatements(sourceFile.getStatements());

	const decisionNode = graph.nodes.find((node) => {
		if (node.type !== 'loop') {
			return false;
		}

		const label = String((node.data as { label?: unknown } | undefined)?.label ?? '');
		return label.includes('index < 2');
	});
	assert.ok(decisionNode);

	const finishNode = graph.nodes.find((node) => {
		if (node.type !== 'action') {
			return false;
		}

		const sourceTextValue = String((node.data as { sourceText?: unknown } | undefined)?.sourceText ?? '');
		return sourceTextValue.includes('finish(index)');
	});
	assert.ok(finishNode);

	assert.ok(graph.edges.some((edge) => edge.source === decisionNode!.id && edge.target === finishNode!.id && String(edge.label ?? '') === 'no'));
});

test('Class expansion shows methods and properties as separate expandable nodes', async () => {
	const classSource = `
export class DiagramContext {
	readyMessage = console.log("Class initialized");

	public sayHello() {
		console.log("Hello from DiagramContext!");
	}

	private calculate() {
		return 42;
	}

	get value() {
		return this.calculate();
	}
}
	`;

	const graph = await parseActivityPreview(classSource, '.');

	const expandableLabels = graph.nodes
		.filter((node) => node.type === 'expandable')
		.map((node) => String((node.data as { label?: unknown } | undefined)?.label ?? ''));
	const actionSourceTexts = graph.nodes
		.filter((node) => node.type === 'action')
		.map((node) => String((node.data as { sourceText?: unknown } | undefined)?.sourceText ?? ''));

	// Methods should be shown as expandable nodes
	assert.ok(expandableLabels.some((label) => /function\s+sayHello\(\)/.test(label)), 'sayHello should be expandable');
	assert.ok(expandableLabels.some((label) => /function\s+calculate\(\)/.test(label)), 'calculate should be expandable');
	assert.ok(expandableLabels.some((label) => /function\s+get_value\(\)/.test(label)), 'getter should be expandable');

	// Property initializer should appear as action
	assert.ok(actionSourceTexts.some((text) => text.includes('readyMessage')), 'readyMessage property initializer should appear');
});
