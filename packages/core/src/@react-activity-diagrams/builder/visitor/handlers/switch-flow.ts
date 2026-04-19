import { Node as MorphNode, Statement, SwitchStatement, SyntaxKind } from 'ts-morph';
import { compactLabel } from '../utils';
import type { BuildResult } from '../types';
import type { StatementVisitorHost } from './host-context';

interface SwitchCaseGroup {
  labels: string[];
  clauseStatements: Statement[];
  executableStatements: Statement[];
  hasBreak: boolean;
}

export function visitSwitch(host: StatementVisitorHost, stmt: SwitchStatement): BuildResult {
  const expressionText = stmt.getExpression().getText();
  const decisionId = host.createDecisionNode(compactLabel(expressionText), expressionText);
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
    const hasBreak = clauseStatements.some((statement) => containsBreakForCurrentSwitch(statement));
    const executableStatements = clauseStatements.filter(
      (statement) => statement.getKind() !== SyntaxKind.BreakStatement,
    );

    if (executableStatements.length > 0 || hasBreak) {
      groups.push({
        labels: pendingLabels,
        clauseStatements,
        executableStatements,
        hasBreak,
      });
      pendingLabels = [];
    }
  }

  const normalExitSources: string[] = [];
  const endExits: string[] = [];
  const directBreakBranches: Array<{ semanticKind: 'case' | 'default' }> = [];

  const mergeId = host.writer.addFlowNode('merge', '');

  for (const group of groups) {
    const isDefaultOnly = group.labels.every((label) => label === 'default');
    const semanticKind = isDefaultOnly ? 'default' as const : 'case' as const;
    const displayLabelBase = formatSwitchGroupLabel(group.labels);

    if (group.executableStatements.length === 0) {
      if (group.hasBreak) {
        directBreakBranches.push({ semanticKind });
      }
      continue;
    }

    const analysis = host.analyzeStatementsSemantics(group.executableStatements);
    const displayLabel = analysis.exits.length > 0 && !group.hasBreak
      ? `${displayLabelBase} (falls through)`
      : displayLabelBase;

    const caseNodeId = host.writer.addFlowNode('expandable', compactLabel(displayLabel), {
      sourceText: group.clauseStatements.map((statement) => statement.getText()).join('\n'),
      nodeKind: 'switch-case',
    });

    host.writer.addEdge(
      decisionId,
      caseNodeId,
      '',
      false,
      host.edgeMeta('bottom', semanticKind),
    );

    if (analysis.endExits.length > 0 && analysis.exits.length === 0) {
      endExits.push(caseNodeId);
    }

    if (analysis.exits.length > 0) {
      host.writer.addEdge(caseNodeId, mergeId);
      normalExitSources.push(caseNodeId);
    }
  }

  const normalPathCount = normalExitSources.length + directBreakBranches.length;
  if (normalPathCount === 0) {
    return {
      entry: decisionId,
      exits: [],
      endExits: [...new Set(endExits)],
    };
  }

  for (const branch of directBreakBranches) {
    host.writer.addEdge(
      decisionId,
      mergeId,
      '',
      false,
      host.edgeMeta('bottom', branch.semanticKind),
    );
  }

  return {
    entry: decisionId,
    exits: [mergeId],
    endExits: [...new Set(endExits)],
  };
}

function containsBreakForCurrentSwitch(node: MorphNode): boolean {
  if (node.getKind() === SyntaxKind.BreakStatement) {
    return true;
  }

  if (
    MorphNode.isSwitchStatement(node) ||
    MorphNode.isForStatement(node) ||
    MorphNode.isForInStatement(node) ||
    MorphNode.isForOfStatement(node) ||
    MorphNode.isWhileStatement(node) ||
    MorphNode.isDoStatement(node)
  ) {
    return false;
  }

  for (const child of node.getChildren()) {
    if (containsBreakForCurrentSwitch(child)) {
      return true;
    }
  }

  return false;
}

function formatSwitchGroupLabel(labels: string[]): string {
  const caseValues = labels
    .filter((label) => label !== 'default')
    .map((label) => label.replace(/^case\s+/i, ''));
  const hasDefault = labels.includes('default');

  if (caseValues.length === 0) {
    return 'default';
  }

  const caseLabel = `case: ${caseValues.join(' | ')}`;
  return hasDefault ? `default | ${caseLabel}` : caseLabel;
}