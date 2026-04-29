import { Node as MorphNode, Statement, SwitchStatement, SyntaxKind } from 'ts-morph';
import { compactLabel, getFallthroughEdgeLabel } from '../utils';
import type { BuildResult } from '../types';
import type { StatementVisitorHost } from './host-context';

interface SwitchCaseGroup {
	labels: string[];
	clauseStatements: Statement[];
}

type RenderedGroup = {
	labels: string[];
	entry?: string;
	fallthrough: string[];
	returnExits: string[];
	throwExits: string[];
};

const EXIT_SWITCH_LABEL = 'exit switch';

export function visitSwitch(host: StatementVisitorHost, stmt: SwitchStatement): BuildResult {
	const expressionText = stmt.getExpression().getText();
	const decisionId = host.createDecisionNode(compactLabel(expressionText), expressionText);

	host.writer.updateNodeData(decisionId, { construct: 'switch' });

	const groups = collectSwitchGroups(stmt);

	if (groups.length === 0) {
		return {
			entry: decisionId,
			exits: [decisionId],
			exitLabels: {
				[decisionId]: EXIT_SWITCH_LABEL,
			},
			returnExits: [],
			throwExits: [],
		};
	}

	// Important:
	// Do NOT create merge here. A switch with a single break/fallthrough exit
	// should connect directly to the next statement with label "exit switch".
	const ctx = host.pushSwitchContext(decisionId);

	try {
		const rendered: RenderedGroup[] = groups.map((group) => {
			if (group.clauseStatements.length === 0) {
				return {
					labels: group.labels,
					entry: undefined,
					fallthrough: [],
					returnExits: [],
					throwExits: [],
				};
			}

			const result = host.visitStatementsInline(group.clauseStatements);

			return {
				labels: group.labels,
				entry: result.entry,
				fallthrough: result.exits,
				returnExits: result.returnExits,
				throwExits: result.throwExits,
			};
		});

		const allReturnExits: string[] = [];
		const allThrowExits: string[] = [];
		const switchExitSources: string[] = [];

		for (let index = 0; index < rendered.length; index += 1) {
			const group = rendered[index];
			const edgeLabel = formatEdgeLabel(group.labels);
			const nextEntry = findNextGroupEntry(rendered, index);

			if (!group.entry) {
				if (nextEntry) {
					host.writer.addEdge(decisionId, nextEntry, edgeLabel, false);
				} else {
					// Empty last case/default falls out of switch.
					// Do not create merge yet; this may be the only switch exit.
					switchExitSources.push(decisionId);
				}

				continue;
			}

			host.writer.addEdge(decisionId, group.entry, edgeLabel, false);

			if (group.fallthrough.length > 0) {
				if (nextEntry) {
					for (const exit of group.fallthrough) {
						host.writer.addEdge(exit, nextEntry, getFallthroughEdgeLabel(host, exit));
					}
				} else {
					// Last case falls out of switch.
					switchExitSources.push(...group.fallthrough);
				}
			}

			allReturnExits.push(...group.returnExits);
			allThrowExits.push(...group.throwExits);
		}

		switchExitSources.push(...ctx.pendingBreaks);

		const resolvedSwitchExits = resolveSwitchExits(host, switchExitSources);

		return {
			entry: decisionId,
			exits: resolvedSwitchExits.exits,
			exitLabels: resolvedSwitchExits.exitLabels,
			returnExits: [...new Set(allReturnExits)],
			throwExits: [...new Set(allThrowExits)],
		};
	} finally {
		host.popContext();
	}
}

function resolveSwitchExits(
	host: StatementVisitorHost,
	sources: string[],
): { exits: string[]; exitLabels?: Record<string, string> } {
	const uniqueSources = [...new Set(sources)].filter(Boolean);

	if (uniqueSources.length === 0) {
		return { exits: [] };
	}

	if (uniqueSources.length === 1) {
		return {
			exits: uniqueSources,
			exitLabels: {
				[uniqueSources[0]]: EXIT_SWITCH_LABEL,
			},
		};
	}

	const mergeId = host.writer.addFlowNode('merge', '');

	for (const source of uniqueSources) {
		host.writer.addEdge(source, mergeId, getFallthroughEdgeLabel(host, source));
	}

	return {
		exits: [mergeId],
		exitLabels: {
			[mergeId]: EXIT_SWITCH_LABEL,
		},
	};
}

function collectSwitchGroups(stmt: SwitchStatement): SwitchCaseGroup[] {
	const clauses = stmt.getCaseBlock().getClauses();
	const groups: SwitchCaseGroup[] = [];
	let pendingLabels: string[] = [];

	for (const clause of clauses) {
		const caseClause = clause.asKind(SyntaxKind.CaseClause);
		const label = caseClause
			? `case ${compactLabel(caseClause.getExpression().getText())}`
			: 'default';

		pendingLabels.push(label);

		const clauseStatements = clause.getStatements();

		if (clauseStatements.length > 0) {
			groups.push({
				labels: pendingLabels,
				clauseStatements,
			});
			pendingLabels = [];
		}
	}

	if (pendingLabels.length > 0) {
		groups.push({
			labels: pendingLabels,
			clauseStatements: [],
		});
	}

	return groups;
}

function formatEdgeLabel(labels: string[]): string {
	if (labels.length === 1) return labels[0];

	return labels
		.map((label, index) => {
			if (index === 0) return label;
			return label.startsWith('case ') ? label.slice(5) : label;
		})
		.join(', ');
}

function findNextGroupEntry(groups: { entry?: string }[], fromIndex: number): string | undefined {
	for (let index = fromIndex + 1; index < groups.length; index += 1) {
		if (groups[index].entry) return groups[index].entry;
	}

	return undefined;
}

function containsSwitchScopedBreak(statements: Statement[]): boolean {
	return statements.some((statement) => containsBreakForCurrentSwitch(statement));
}

function containsBreakForCurrentSwitch(node: MorphNode): boolean {
	if (node.getKind() === SyntaxKind.BreakStatement) {
		return true;
	}

	if (isNestedBreakBoundary(node)) {
		return false;
	}

	let found = false;

	node.forEachChild((child) => {
		if (found) return;

		if (containsBreakForCurrentSwitch(child)) {
			found = true;
		}
	});

	return found;
}

function isNestedBreakBoundary(node: MorphNode): boolean {
	switch (node.getKind()) {
		case SyntaxKind.SwitchStatement:
		case SyntaxKind.ForStatement:
		case SyntaxKind.ForInStatement:
		case SyntaxKind.ForOfStatement:
		case SyntaxKind.WhileStatement:
		case SyntaxKind.DoStatement:
		case SyntaxKind.FunctionDeclaration:
		case SyntaxKind.FunctionExpression:
		case SyntaxKind.ArrowFunction:
			return true;

		default:
			return false;
	}
}