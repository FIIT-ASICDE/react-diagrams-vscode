import { Statement, SwitchStatement, SyntaxKind } from 'ts-morph';
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

/**
 * Build a switch as a normal-flow subgraph.
 *
 *   - decision node holds the switch expression, tagged construct: 'switch'
 *   - one outgoing edge per case GROUP; the edge label is the group's
 *     case labels comma-separated, e.g. `"case 1, 2, default"`
 *   - case bodies render through the regular statement visitor — `break`
 *     becomes an action node tagged construct: 'break' AND registers
 *     itself on the switch's break-context, so we don't have to detect
 *     break-vs-fallthrough here. After visiting all bodies we collect
 *     pendingBreaks from the context and wire them to the post-switch
 *     merge.
 *   - groups whose body has natural fall-through exits (no break) wire
 *     those into the next group's entry
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
      groups.push({ labels: pendingLabels, clauseStatements });
      pendingLabels = [];
    }
  }

  if (pendingLabels.length > 0) {
    groups.push({ labels: pendingLabels, clauseStatements: [] });
  }

  if (groups.length === 0) {
    return { entry: decisionId, exits: [decisionId], returnExits: [], throwExits: [] };
  }

  // ── Phase 2: render bodies under a shared switch context ──────────────

  const ctx = host.pushSwitchContext();

  type RenderedGroup = {
    labels: string[];
    entry?: string;
    fallthrough: string[];
    returnExits: string[];
    throwExits: string[];
  };

  let rendered: RenderedGroup[];

  try {
    rendered = groups.map((group) => {
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

      // result.exits are now ONLY the natural fall-through exits.
      // `break` actions inside the body returned exits: [], so the
      // visitor never collected them — they're on ctx.pendingBreaks.
      return {
        labels: group.labels,
        entry: result.entry,
        fallthrough: result.exits,
        returnExits: result.returnExits,
        throwExits: result.throwExits,
      };
    });
  } finally {
    host.popContext();
  }

  // ── Phase 3: connect ──────────────────────────────────────────────────

  // We need a merge if any case will produce flow that needs to land
  // somewhere after the switch:
  //   - empty (label-only) groups need somewhere to land
  //   - pending breaks need somewhere to land
  //   - a group with fall-through but no next group needs somewhere too
  const needsMerge = rendered.some((group, index) => {
    if (!group.entry) return true;
    if (group.fallthrough.length > 0 && !findNextGroupEntry(rendered, index)) return true;
    return false;
  }) || ctx.pendingBreaks.length > 0;

  const mergeId = needsMerge ? host.writer.addFlowNode('merge', '') : undefined;
  const allReturnExits: string[] = [];
  const allThrowExits: string[] = [];

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

    if (group.fallthrough.length > 0) {
      const nextEntry = findNextGroupEntry(rendered, index);
      const target = nextEntry ?? mergeId;

      if (target) {
        for (const exit of group.fallthrough) {
          host.writer.addEdge(exit, target, getFallthroughEdgeLabel(exit));
        }
      }
    }

    allReturnExits.push(...group.returnExits);
    allThrowExits.push(...group.throwExits);
  }

  if (mergeId) {
    for (const breakId of ctx.pendingBreaks) {
      host.writer.addEdge(breakId, mergeId);
    }
  }

  return {
    entry: decisionId,
    exits: mergeId ? [mergeId] : [],
    returnExits: [...new Set(allReturnExits)],
    throwExits: [...new Set(allThrowExits)],
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