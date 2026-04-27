import { Node as MorphNode, Statement, SwitchStatement, SyntaxKind } from 'ts-morph';
import { compactLabel, getFallthroughEdgeLabel } from '../utils';
import type { BuildResult } from '../types';
import type { StatementVisitorHost } from './host-context';

interface SwitchCaseGroup {
  labels: string[];
  clauseStatements: Statement[];
}

function setNodeData(host: StatementVisitorHost, nodeId: string, extra: Record<string, unknown>): void {
  const node = (host.writer as unknown as { nodes?: import('@xyflow/react').Node[] }).nodes?.find?.(
    (candidate) => candidate.id === nodeId,
  );
  if (!node) return;
  node.data = { ...(node.data ?? {}), ...extra };
}

export function visitSwitch(host: StatementVisitorHost, stmt: SwitchStatement): BuildResult {
  const expressionText = stmt.getExpression().getText();
  const decisionId = host.createDecisionNode(compactLabel(expressionText), expressionText);
  setNodeData(host, decisionId, { construct: 'switch' });
  const mergeId = host.writer.addFlowNode('merge', '');
  const ctx = host.pushSwitchContext(mergeId);

  try {
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

    if (groups.length === 0) {
      return {
        entry: decisionId,
        exits: [decisionId],
        returnExits: [],
        throwExits: [],
      };
    }

  type RenderedGroup = {
    labels: string[];
    entry?: string;
    exits: string[];
    fallthrough: string[];
    returnExits: string[];
    throwExits: string[];
  };

    const rendered: RenderedGroup[] = groups.map((group) => {
      if (group.clauseStatements.length === 0) {
        return {
          labels: group.labels,
          entry: undefined,
          exits: [],
          fallthrough: [],
          returnExits: [],
          throwExits: [],
        };
      }

      const result = host.visitStatementsInline(group.clauseStatements);

      return {
        labels: group.labels,
        entry: result.entry,
        exits: [],
        fallthrough: result.exits,
        returnExits: result.returnExits,
        throwExits: result.throwExits,
      };
    });

    // Structural marker: CodeGen uses this as post-switch boundary.
    host.writer.addEdge(decisionId, mergeId, '', false);

    const allReturnExits: string[] = [];
    const allThrowExits: string[] = [];

    for (let index = 0; index < rendered.length; index += 1) {
      const group = rendered[index];
      const edgeLabel = formatEdgeLabel(group.labels);

      if (!group.entry) {
        host.writer.addEdge(decisionId, mergeId, edgeLabel, false);
        continue;
      }

      host.writer.addEdge(decisionId, group.entry, edgeLabel, false);

      for (const exit of group.exits) {
        host.writer.addEdge(exit, mergeId);
      }

      if (group.fallthrough.length > 0) {
        const nextEntry = findNextGroupEntry(rendered, index);
        const target = nextEntry ?? mergeId;

        for (const exit of group.fallthrough) {
          host.writer.addEdge(exit, target, getFallthroughEdgeLabel(exit));
        }
      }

      allReturnExits.push(...group.returnExits);
      allThrowExits.push(...group.throwExits);
    }

    for (const breakId of ctx.pendingBreaks) {
      host.writer.addEdge(breakId, mergeId);
    }

    return {
      entry: decisionId,
      exits: [mergeId],
      returnExits: [...new Set(allReturnExits)],
      throwExits: [...new Set(allThrowExits)],
    };
  } finally {
    host.popContext();
  }
}

function formatEdgeLabel(labels: string[]): string {
  if (labels.length === 1) return labels[0];

  return labels
    .map((label, i) => {
      if (i === 0) return label;
      return label.startsWith('case ') ? label.slice(5) : label;
    })
    .join(', ');
}

function findNextGroupEntry(groups: { entry?: string }[], fromIndex: number): string | undefined {
  for (let i = fromIndex + 1; i < groups.length; i += 1) {
    if (groups[i].entry) return groups[i].entry;
  }
  return undefined;
}

