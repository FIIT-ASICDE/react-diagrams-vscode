import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Project, SyntaxKind, ts } from 'ts-morph';

import { parseReactComponent } from '../../../../app@state-diagram';
import { analyzeStateDiagram, type StateDiagramGlobalMetrics } from '../../../../app@state-diagram-model/graph/analyzer';
import { METRIC_LABELS, type CodeMetrics, type ExperimentReport, type FileEvaluation, type FileSummary, type GroupReport, type MetricKey, type Validity } from './types';

export const REFACTORING_DIR = path.resolve(__dirname, '..');
export const CORE_DIR = path.resolve(REFACTORING_DIR, '../../../..');
export const DATA_DIR = path.join(REFACTORING_DIR, 'data');
export const BASE_DIR = path.join(DATA_DIR, '_Base');
export const REPORT_JSON = path.join(REFACTORING_DIR, 'report.json');
export const REPORT_HTML = path.join(REFACTORING_DIR, 'report.html');

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

const LOGICAL_STATEMENT_KINDS = new Set<SyntaxKind>([
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
]);

const NESTING_KINDS = new Set<SyntaxKind>([
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
	SyntaxKind.ConditionalExpression,
]);

export function buildReport(): ExperimentReport {
	mkdirSync(REFACTORING_DIR, { recursive: true });
	const baselineFiles = listSourceFiles(BASE_DIR);
	const baselines = baselineFiles.map((filePath) => evaluateFile(filePath, path.basename(filePath)));
	const baselineByStem = new Map(baselines.map((baseline) => [baseStem(baseline.filePath), baseline]));
	const groups = listGroupDirectories().map((groupDirectory) => buildGroupReport(groupDirectory, baselineByStem));

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

function listSourceFiles(directory: string) {
	if (!existsSync(directory))
		return [];

	return readdirSync(directory, { withFileTypes: true })
		.filter((entry) => entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name)))
		.map((entry) => path.join(directory, entry.name))
		.sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
}

function listGroupDirectories() {
	if (!existsSync(DATA_DIR))
		return [];

	return readdirSync(DATA_DIR, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
		.map((entry) => path.join(DATA_DIR, entry.name))
		.sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
}

function baseStem(filePath: string) {
	return path.basename(filePath, path.extname(filePath));
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

function buildGroupReport(groupDirectory: string, baselineByStem: Map<string, FileEvaluation>): GroupReport {
	const groupName = path.basename(groupDirectory);
	const sourceFiles = listSourceFiles(groupDirectory);
	const runsByBase = new Map<string, FileEvaluation[]>();

	for (const filePath of sourceFiles) {
		const parsedName = parseRefactorFileName(filePath);
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
			const includedRuns = runs.filter((run) => run.includedInAverages);
			return {
				baseFile,
				runs,
				averageImprovementPct: averageMetricMap(includedRuns.map((run) => run.improvementPct)),
				validRunCount: includedRuns.length,
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
	return {
		...evaluation,
		improvementPct: {
			loc: improvementPct(baseline.metrics.loc, evaluation.metrics.loc),
			maxNesting: improvementPct(baseline.metrics.maxNesting, evaluation.metrics.maxNesting),
			nodeCount: improvementPct(baseline.metrics.nodeCount, evaluation.metrics.nodeCount),
			transitionCount: improvementPct(baseline.metrics.transitionCount, evaluation.metrics.transitionCount),
		},
	};
}

function improvementPct(base: number, after: number) {
	if (!Number.isFinite(base) || base <= 0)
		return null;

	return ((base - after) / base) * 100;
}

function averageMetricMap(items: Array<Record<MetricKey, number | null> | undefined>): Record<MetricKey, number | null> {
	return {
		loc: average(items.map((item) => item?.loc)),
		maxNesting: average(items.map((item) => item?.maxNesting)),
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
	const effectiveLoc = getEffectiveLoc(sourceText);
	const sourceFile = createSourceFileForMetrics(sourceText, fileName);
	let logicalLoc = 0;
	let maxNesting = 0;
	let nestingSum = 0;
	let nestedStatementCount = 0;
	const nestingByNode = new Map<unknown, number>();

	sourceFile.forEachDescendant((node) => {
		const parent = node.getParent();
		const parentDepth = parent ? nestingByNode.get(parent) ?? 0 : 0;
		const depth = parentDepth + (NESTING_KINDS.has(node.getKind()) ? 1 : 0);
		nestingByNode.set(node, depth);
		maxNesting = Math.max(maxNesting, depth);

		if (!LOGICAL_STATEMENT_KINDS.has(node.getKind()))
			return;

		logicalLoc += 1;
		nestingSum += parentDepth;
		nestedStatementCount += 1;
	});

	const loc = Math.round(((effectiveLoc + logicalLoc) / 2) * 100) / 100;

	return {
		effectiveLoc,
		logicalLoc,
		loc,
		maxNesting,
		averageNesting: nestedStatementCount ? nestingSum / nestedStatementCount : 0,
	};
}

function getEffectiveLoc(sourceText: string) {
	const text = stripCommentsPreservingLines(sourceText);
	return text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line && !/^[{}()[\];,]+$/.test(line))
		.length;
}

function stripCommentsPreservingLines(text: string) {
	const withoutBlockComments = text.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ''));
	return withoutBlockComments.replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function createSourceFileForMetrics(sourceText: string, fileName: string) {
	const project = new Project({
		compilerOptions: {
			allowJs: true,
			jsx: ts.JsxEmit.ReactJSX,
			module: ts.ModuleKind.Node16,
			moduleResolution: ts.ModuleResolutionKind.Node16,
			skipLibCheck: true,
			target: ts.ScriptTarget.ES2022,
		},
		skipFileDependencyResolution: true,
		skipLoadingLibFiles: true,
	});

	return project.createSourceFile(fileName, sourceText, { overwrite: true });
}

type BunLike = {
	Transpiler?: new (options: { loader: 'js' | 'jsx' | 'ts' | 'tsx' }) => {
		transformSync(sourceText: string): string;
	};
};

function checkCompilesWithoutErrors(sourceText: string, filePath: string) {
	const bun = (globalThis as typeof globalThis & { Bun?: BunLike }).Bun;

	if (bun?.Transpiler) {
		try {
			new bun.Transpiler({ loader: getLoader(filePath) }).transformSync(sourceText);
			return { ok: true, errors: [] as string[] };
		}
		catch (error) {
			return { ok: false, errors: [formatError(error)] };
		}
	}

	try {
		const sourceFile = createSourceFileForMetrics(sourceText, path.basename(filePath));
		const diagnostics = sourceFile.getProject().getPreEmitDiagnostics()
			.filter((diagnostic) => diagnostic.getCategory() == ts.DiagnosticCategory.Error && diagnostic.getCode() < 2000);
		return {
			ok: diagnostics.length == 0,
			errors: diagnostics.map((diagnostic) => diagnostic.getMessageText().toString()),
		};
	}
	catch (error) {
		return { ok: false, errors: [formatError(error)] };
	}
}

function getLoader(filePath: string): 'js' | 'jsx' | 'ts' | 'tsx' {
	const ext = path.extname(filePath).toLowerCase();
	if (ext == '.jsx')
		return 'jsx';
	if (ext == '.ts')
		return 'ts';
	if (ext == '.js')
		return 'js';
	return 'tsx';
}

function getDiagramMetrics(filePath: string) {
	try {
		const diagram = parseReactComponent(filePath, { rootPath: CORE_DIR });
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

function emptyDiagramMetrics(): StateDiagramGlobalMetrics {
	return {
		stateVariableCount: 0,
		stateCount: 0,
		mutatorCount: 0,
		nodeCount: 0,
		transitionCount: 0,
	};
}

function isNonEmptyDiagram(metrics: StateDiagramGlobalMetrics) {
	return metrics.stateVariableCount > 0 && metrics.mutatorCount > 0 && metrics.nodeCount > 0;
}

function formatError(error: unknown) {
	if (error instanceof Error)
		return error.message;

	return String(error);
}