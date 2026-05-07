import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Project, SyntaxKind, ts } from 'ts-morph';

import { parseReactComponent, StateGraphOptions } from '../../../../app@state-diagram';
import { analyzeStateDiagram, type StateDiagramGlobalMetrics } from '../../../../app@state-diagram-model/graph/analyzer';
import { METRIC_LABELS, type CodeMetrics, type ExperimentReport, type FileEvaluation, type FileSummary, type GroupReport, type MetricKey, type Validity } from './types';
import { baseStem, checkCompilesWithoutErrors, createSourceFileForMetrics, formatError, listDisabledBaseStems, listSourceFiles, REFACTORING_DIR, SOURCE_EXTENSIONS } from './utils';

export const DATA_DIR = path.join(REFACTORING_DIR, 'data');
export const BASE_DIR = path.join(DATA_DIR, '_Base');
export const REPORT_JSON = path.join(REFACTORING_DIR, 'report.json');
export const REPORT_HTML = path.join(REFACTORING_DIR, 'report.html');

const INVALID_REFACTOR_PENALTY = -0.25;

const LOGICAL_STATEMENT_KINDS = new Set([
	SyntaxKind.VariableStatement,
	SyntaxKind.ExpressionStatement,
	SyntaxKind.ReturnStatement,
	SyntaxKind.IfStatement,
	SyntaxKind.ForStatement,
	SyntaxKind.ForInStatement,
	SyntaxKind.ForOfStatement,
	SyntaxKind.WhileStatement,
	SyntaxKind.DoStatement,
	SyntaxKind.SwitchStatement,
	SyntaxKind.CaseClause,
	SyntaxKind.DefaultClause,
	SyntaxKind.TryStatement,
	SyntaxKind.CatchClause,
	SyntaxKind.ThrowStatement,
	SyntaxKind.BreakStatement,
	SyntaxKind.ContinueStatement,
	SyntaxKind.FunctionDeclaration,
	SyntaxKind.MethodDeclaration,
	SyntaxKind.PropertyDeclaration,
	SyntaxKind.ArrowFunction
]);

const NESTING_KINDS = new Set([
	SyntaxKind.IfStatement,
	SyntaxKind.ForStatement,
	SyntaxKind.ForInStatement,
	SyntaxKind.ForOfStatement,
	SyntaxKind.WhileStatement,
	SyntaxKind.DoStatement,
	SyntaxKind.SwitchStatement,
	SyntaxKind.CaseClause,
	SyntaxKind.DefaultClause,
	SyntaxKind.TryStatement,
	// SyntaxKind.CatchClause,
	SyntaxKind.ConditionalExpression,
	// SyntaxKind.ExpressionStatement,
]);

const parserOptions: StateGraphOptions = { // mirror the extensions defaults...
	useGuardsWhenPossible: true,
	considerEarlyExits: true,
	mergeSquashing: ['merge->merge', 'merge->decision', 'merge->exit']
}

export function buildReport(): ExperimentReport {
	// console.log(path.join(REFACTORING_DIR, '../..'))

	mkdirSync(REFACTORING_DIR, { recursive: true });
	const baselineFiles = listSourceFiles(BASE_DIR);
	const baselines = baselineFiles.map((filePath) => evaluateFile(filePath, path.basename(filePath)));
	const baselineByStem = new Map(baselines.map((baseline) => [baseStem(baseline.filePath), baseline]));
	const disabledBaseStems = listDisabledBaseStems(BASE_DIR);
	const groups = listGroupDirectories().map((groupDirectory) => buildGroupReport(groupDirectory, baselineByStem, disabledBaseStems));

	return {
		generatedAt: new Date().toISOString(),
		experimentDirectory: REFACTORING_DIR,
		dataDirectory: DATA_DIR,
		outputs: {
			json: REPORT_JSON,
			html: REPORT_HTML,
		},
		metricLabels: METRIC_LABELS,
		baselines,
		groups,
	};
}

function listGroupDirectories() {
	if (!existsSync(DATA_DIR))
		return [];

	return readdirSync(DATA_DIR, { withFileTypes: true })
		.filter(en => en.isDirectory() && !en.name.startsWith('_'))
		.map(en => path.join(DATA_DIR, en.name))
		.sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
}

function parseRefactorFileName(filePath: string) {
	const fileName = path.basename(filePath);
	const match = /^(.+)\.([^.]+)\.refactor\.(tsx?|jsx?)$/i.exec(fileName);
	if (!match)
		return { baseStem: baseStem(filePath), model: undefined };

	return {
		baseStem: match[1],
		model: match[2],
	};
}

function evaluateFile(filePath: string, baseFile: string, model?: string): FileEvaluation {
	const sourceText = readFileSync(filePath, 'utf8');
	const compile = checkCompilesWithoutErrors(sourceText, filePath);
	const diagram = getDiagramMetrics(filePath);
	const codeMetrics = getCodeMetrics(sourceText, path.basename(filePath));
	const validity: Validity = {
		compilesWithoutErrors: compile.ok,
		nonEmptyDiagramGenerated: diagram.nonEmptyDiagramGenerated,
		errors: [...compile.errors, ...diagram.errors],
	};

	return {
		baseFile,
		model,
		fileName: path.basename(filePath),
		filePath,
		relativePath: path.relative(REFACTORING_DIR, filePath),
		validity,
		metrics: {
			...codeMetrics,
			stateVariableCount: diagram.metrics.stateVariableCount,
			stateCount: diagram.metrics.stateCount,
			mutatorCount: diagram.metrics.mutatorCount,
			nodeCount: diagram.metrics.nodeCount,
			transitionCount: diagram.metrics.transitionCount,
		},
		includedInAverages: validity.compilesWithoutErrors && validity.nonEmptyDiagramGenerated,
	};
}

function buildGroupReport(groupDirectory: string, baselineByStem: Map<string, FileEvaluation>, disabledBaseStems: Set<string>): GroupReport {
	const groupName = path.basename(groupDirectory);
	const sourceFiles = listSourceFiles(groupDirectory);
	const runsByBase = new Map<string, FileEvaluation[]>();

	for (const filePath of sourceFiles) {
		const parsedName = parseRefactorFileName(filePath);
		if (disabledBaseStems.has(parsedName.baseStem))
			continue;

		const baseline = baselineByStem.get(parsedName.baseStem);
		const baseFile = baseline?.baseFile ?? `${parsedName.baseStem}${path.extname(filePath)}`;
		const run = evaluateFile(filePath, baseFile, parsedName.model);
		const runWithImprovements = baseline ? withImprovements(run, baseline) : run;
		const runs = runsByBase.get(baseFile) ?? [];
		runs.push(runWithImprovements);
		runsByBase.set(baseFile, runs);
	}

	for (const baseline of baselineByStem.values()) {
		if (!runsByBase.has(baseline.baseFile))
			runsByBase.set(baseline.baseFile, []);
	}

	const files: FileSummary[] = [...runsByBase.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([baseFile, runs]) => {
			const averageableRuns = runs.filter((run) => run.includedInAverages || Boolean(run.improvementPct));
			const validRuns = runs.filter((run) => run.includedInAverages);
			return {
				baseFile,
				runs,
				averageImprovementPct: averageMetricMap(averageableRuns.map((run) => run.improvementPct)),
				validRunCount: validRuns.length,
				totalRunCount: runs.length,
			};
		});

	return {
		name: groupName,
		directory: path.relative(REFACTORING_DIR, groupDirectory),
		files,
		overallAverageImprovementPct: averageMetricMap(files.map((file) => file.averageImprovementPct)),
		validRunCount: files.reduce((sum, file) => sum + file.validRunCount, 0),
		totalRunCount: files.reduce((sum, file) => sum + file.totalRunCount, 0),
	};
}

function withImprovements(evaluation: FileEvaluation, baseline: FileEvaluation): FileEvaluation {
	const improvementPct = getImprovementPct(evaluation, baseline);

	return {
		...evaluation,
		improvementPct,
	};
}

function getImprovementPct(evaluation: FileEvaluation, baseline: FileEvaluation): Record<MetricKey, number | null> | undefined {
	if (!evaluation.includedInAverages) {
		if (!Number.isFinite(INVALID_REFACTOR_PENALTY))
			return undefined;

		const penaltyPct = INVALID_REFACTOR_PENALTY * 100;
		return {
			logicalLoc: penaltyPct,
			maxNestedFlow: penaltyPct,
			nodeCount: penaltyPct,
			transitionCount: penaltyPct,
		};
	}

	return {
		logicalLoc: improvementPct(baseline.metrics.logicalLoc, evaluation.metrics.logicalLoc),
		maxNestedFlow: improvementPct(baseline.metrics.maxNestedFlow, evaluation.metrics.maxNestedFlow),
		nodeCount: improvementPct(baseline.metrics.nodeCount, evaluation.metrics.nodeCount),
		transitionCount: improvementPct(baseline.metrics.transitionCount, evaluation.metrics.transitionCount),
	};
}

function improvementPct(base: number, after: number) {
	if (!Number.isFinite(base) || base <= 0)
		return null;

	return ((base - after) / base) * 100;
}

function averageMetricMap(items: Array<Record<MetricKey, number | null> | undefined>): Record<MetricKey, number | null> {
	return {
		logicalLoc: average(items.map((item) => item?.logicalLoc)),
		maxNestedFlow: average(items.map((item) => item?.maxNestedFlow)),
		nodeCount: average(items.map((item) => item?.nodeCount)),
		transitionCount: average(items.map((item) => item?.transitionCount)),
	};
}

function average(values: Array<number | null | undefined>) {
	const validValues = values.filter((value): value is number => typeof value == 'number' && Number.isFinite(value));
	if (!validValues.length)
		return null;

	return validValues.reduce((sum, value) => sum + value, 0) / validValues.length;
}

function getCodeMetrics(sourceText: string, fileName: string): CodeMetrics {
	// const effectiveLoc = getEffectiveLoc(sourceText);
	const sourceFile = createSourceFileForMetrics(sourceText, fileName);
	let logicalLoc = 0;
	let maxNestedFlow = 0;
	// let nestingSum = 0;
	// let nestedStatementCount = 0; // lloc basically...
	const nestingByNode = new Map<unknown, number>();

	sourceFile.forEachDescendant((node) => {
		const parent = node.getParent();
		const parentDepth = parent ? nestingByNode.get(parent) ?? 0 : 0;
		const depth = parentDepth + +NESTING_KINDS.has(node.getKind());
		nestingByNode.set(node, depth);
		maxNestedFlow = Math.max(maxNestedFlow, depth);

		if (!LOGICAL_STATEMENT_KINDS.has(node.getKind()))
			return;

		logicalLoc += 1;
		// nestingSum += parentDepth;
		// nestedStatementCount += 1;
	});

	return {
		// effectiveLoc,
		logicalLoc,
		maxNestedFlow,
		// averageNesting: nestedStatementCount ? nestingSum / nestedStatementCount : 0,
	};
}

// function getEffectiveLoc(sourceText: string) {
// 	const text = stripCommentsPreservingLines(sourceText);
// 	return text.split(/\r?\n/).map(ln => ln.trim()).filter((line) => line && !/^[{}()[\];,]+$/.test(line)).length;
// }

// function stripCommentsPreservingLines(text: string) {
// 	const withoutBlockComments = text.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ''));
// 	return withoutBlockComments.replace(/(^|[^:])\/\/.*$/gm, '$1');
// }

const isNonEmptyDiagram = (metrics: StateDiagramGlobalMetrics) => metrics.mutatorCount > 0 && metrics.nodeCount > 0

function emptyDiagramMetrics(): StateDiagramGlobalMetrics {
	return {
		stateVariableCount: 0,
		stateCount: 0,
		mutatorCount: 0,
		nodeCount: 0,
		transitionCount: 0,
	};
}

function getDiagramMetrics(filePath: string) {
	try {
		const diagram = parseReactComponent(filePath, { rootPath: path.join(REFACTORING_DIR, '../..'), ...parserOptions });
		const analytics = analyzeStateDiagram(diagram);
		return {
			metrics: analytics.metrics,
			nonEmptyDiagramGenerated: isNonEmptyDiagram(analytics.metrics),
			errors: [] as string[],
		};
	}
	catch (error) {
		return {
			metrics: emptyDiagramMetrics(),
			nonEmptyDiagramGenerated: false,
			errors: [formatError(error)],
		};
	}
}
