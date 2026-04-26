import { Node as MorphNode, Statement, SwitchStatement, SyntaxKind } from 'ts-morph';
import { compactLabel, getFallthroughEdgeLabel } from '../utils';
import type { BuildResult } from '../types';
import type { StatementVisitorHost } from './host-context';

interface SwitchCaseGroup {
  /** Case / default labels that share this group's body. */
  labels: string[];

  /** Statements inside the group's clause(s), break/continue included. */
  clauseStatements: Statement[];

  /** Whether the body ends with a `break` (control leaves the switch). */
  hasBreak: boolean;
}

function setNodeData(host: StatementVisitorHost, nodeId: string, extra: Record<string, unknown>): void {
  const node = (host.writer as unknown as { nodes?: import('@xyflow/react').Node[] }).nodes?.find?.(
    (candidate) => candidate.id === nodeId,
  );
  if (!node) return;
  node.data = { ...(node.data ?? {}), ...extra };
}

/**
 * Build a switch as a normal-flow subgraph.
 *
 *   - decision node holds the switch expression, tagged construct: 'switch'
 *   - one outgoing edge per case GROUP (a group is the set of `case X:` /
 *     `default:` labels that share a body); the edge's label is a
 *     comma-separated list of those labels, e.g. `"case 1, 2, default"`
 *   - case bodies render through the regular statement visitor — `break`
 *     is a regular action node with its own `construct: 'break'`
 *   - fall-through groups wire their exits into the next group's entry
 *   - all final exits join at a single merge that is the switch's exit
 */
export function visitSwitch(host: StatementVisitorHost, stmt: SwitchStatement): BuildResult {
  const expressionText = stmt.getExpression().getText();
  const decisionId = host.createDecisionNode(compactLabel(expressionText), expressionText);
  setNodeData(host, decisionId, { construct: 'switch' });

  // ── Phase 1: collect groups ───────────────────────────────────────────
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
        hasBreak: clauseStatements.some(containsBreakForCurrentSwitch),
      });
      pendingLabels = [];
    }
  }

  // Trailing label-only clauses (e.g. `case 5:` with no body).
  if (pendingLabels.length > 0) {
    groups.push({
      labels: pendingLabels,
      clauseStatements: [],
      hasBreak: true,
    });
  }

  if (groups.length === 0) {
    return { entry: decisionId, exits: [decisionId], endExits: [] };
  }

  // ── Phase 2: render bodies ────────────────────────────────────────────

  type RenderedGroup = {
    labels: string[];
    entry?: string;
    exits: string[];
    fallthrough: string[];
    endExits: string[];
  };

  const rendered: RenderedGroup[] = groups.map((group) => {
    if (group.clauseStatements.length === 0) {
      return { labels: group.labels, entry: undefined, exits: [], fallthrough: [], endExits: [] };
    }

    const result = host.visitStatementsInline(group.clauseStatements);

    if (group.hasBreak) {
      return {
        labels: group.labels,
        entry: result.entry,
        exits: result.exits,
        fallthrough: [],
        endExits: result.endExits,
      };
    }

    return {
      labels: group.labels,
      entry: result.entry,
      exits: [],
      fallthrough: result.exits,
      endExits: result.endExits,
    };
  });

  // ── Phase 3: connect ──────────────────────────────────────────────────

  const needsMerge = rendered.some((group, index) => {
    if (!group.entry) {
      return true;
    }

    if (group.exits.length > 0) {
      return true;
    }

    if (group.fallthrough.length > 0 && !findNextGroupEntry(rendered, index)) {
      return true;
    }

    return false;
  });

  const mergeId = needsMerge ? host.writer.addFlowNode('merge', '') : undefined;
  const allEndExits: string[] = [];

  for (let index = 0; index < rendered.length; index += 1) {
    const group = rendered[index];
    const edgeLabel = formatEdgeLabel(group.labels);

    if (!group.entry) {
      if (mergeId) {
        host.writer.addEdge(decisionId, mergeId, edgeLabel, false);
      }
      continue;
    }

    host.writer.addEdge(decisionId, group.entry, edgeLabel, false);

    for (const exit of group.exits) {
      if (mergeId) {
        host.writer.addEdge(exit, mergeId);
      }
    }

    if (group.fallthrough.length > 0) {
      const nextEntry = findNextGroupEntry(rendered, index);
      const target = nextEntry ?? mergeId;

      if (target) {
        for (const exit of group.fallthrough) {
          host.writer.addEdge(exit, target, getFallthroughEdgeLabel(exit));
        }
      }
    }

    allEndExits.push(...group.endExits);
  }

  return {
    entry: decisionId,
    exits: mergeId ? [mergeId] : [],
    endExits: [...new Set(allEndExits)],
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

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

function containsBreakForCurrentSwitch(node: MorphNode): boolean {
  if (node.getKind() === SyntaxKind.BreakStatement) {
    return true;
  }

  // Don't descend into nested loops / switches — their breaks belong to them.
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