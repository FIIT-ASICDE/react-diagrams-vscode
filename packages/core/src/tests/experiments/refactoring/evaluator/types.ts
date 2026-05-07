export type MetricKey = 'logicalLoc' | 'maxNesting' | 'nodeCount' | 'transitionCount';

export interface CodeMetrics {
	// effectiveLoc: number;
	logicalLoc: number;
	maxNesting: number;
	averageNesting: number;
}

export interface EvaluatedMetrics extends CodeMetrics {
	stateVariableCount: number;
	stateCount: number;
	mutatorCount: number;
	nodeCount: number;
	transitionCount: number;
}

export interface Validity {
	compilesWithoutErrors: boolean;
	nonEmptyDiagramGenerated: boolean;
	errors: string[];
}

export interface FileEvaluation {
	baseFile: string;
	model?: string;
	fileName: string;
	filePath: string;
	relativePath: string;
	validity: Validity;
	metrics: EvaluatedMetrics;
	improvementPct?: Record<MetricKey, number | null>;
	includedInAverages: boolean;
}

export interface FileSummary {
	baseFile: string;
	runs: FileEvaluation[];
	averageImprovementPct: Record<MetricKey, number | null>;
	validRunCount: number;
	totalRunCount: number;
}

export interface GroupReport {
	name: string;
	directory: string;
	files: FileSummary[];
	overallAverageImprovementPct: Record<MetricKey, number | null>;
	validRunCount: number;
	totalRunCount: number;
}

export interface ExperimentReport {
	generatedAt: string;
	experimentDirectory: string;
	dataDirectory: string;
	outputs: {
		json: string;
		html: string;
	};
	metricLabels: Record<MetricKey, string>;
	baselines: FileEvaluation[];
	groups: GroupReport[];
}

export const METRIC_LABELS: Record<MetricKey, string> = {
	logicalLoc: 'Logical LOC',
	maxNesting: 'Nesting level',
	nodeCount: 'Total node count',
	transitionCount: 'Total transition count',
};

export const METRIC_COLORS: Record<MetricKey, string> = {
	logicalLoc: '#3b82f6',
	maxNesting: '#df75fb',
	nodeCount: '#ffb66a',
	transitionCount: '#86c779',
};

export const METRIC_KEYS: MetricKey[] = ['logicalLoc', 'maxNesting', 'nodeCount', 'transitionCount'];
