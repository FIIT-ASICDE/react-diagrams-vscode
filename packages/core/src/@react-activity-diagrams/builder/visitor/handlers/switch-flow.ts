import { Statement, SwitchStatement, SyntaxKind } from 'ts-morph';
import { compactLabel, getFallthroughEdgeLabel } from '../utils';
import type { BuildResult } from '../types';
import type { StatementVisitorHost } from './host-context';

interface SwitchCaseGroup {
  labels: string[];
  clauseStatements: Statement[];
  /** True if this group corresponds (at least in part) to `default:`. */
  isDefault: boolean;
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
 *     `default:` labels that share a body); the edge label is the group's
 *     case labels comma-separated, e.g. `"case 1, 2, default"`
 *   - case bodies render through the regular statement visitor — `break`
 *     becomes an action node tagged construct: 'break' AND registers
 *     itself on the switch's break-context, so we don't have to detect
 *     break-vs-fallthrough here. After visiting all bodies we collect
 *     pendingBreaks from the context and wire them to the post-switch
 *     merge.
 *   - groups whose body has natural fall-through exits (no break) wire
 *     those into the next group's entry
 *
 * Exit semantics:
 *
 *   The switch has an exit edge (to its merge node) whenever ANY of the
 *   following holds:
 *     - the switch has NO `default` case (so a non-matching value just
 *       falls through to whatever comes after the switch) — this is the
 *       common case people miss
 *     - some case has `break`
 *     - some case has natural fall-through with nowhere to go (last
 *       case with no following case)
 *     - some case has an empty body (label-only)
 *
 *   If every case definitely diverts (return / throw / continue) AND a
 *   default exists AND no case has fall-through with no successor, then
 *   the switch genuinely has no normal exit and the surrounding flow
 *   stops there.
 */
export function visitSwitch(host: StatementVisitorHost, stmt: SwitchStatement): BuildResult {
  const expressionText = stmt.getExpression().getText();
  const decisionId = host.createDecisionNode(compactLabel(expressionText), expressionText);
  setNodeData(host, decisionId, { construct: 'switch' });

  // ── Phase 1: collect groups ───────────────────────────────────────────
  const clauses = stmt.getCaseBlock().getClauses();
  const groups: SwitchCaseGroup[] = [];
  let pendingLabels: string[] = [];
  let pendingHasDefault = false;

  for (const clause of clauses) {
    const caseClause = clause.asKind(SyntaxKind.CaseClause);
    const isDefault = !caseClause;
    const label = caseClause
      ? `case ${compactLabel(caseClause.getExpression().getText())}`
      : 'default';
    pendingLabels.push(label);
    pendingHasDefault = pendingHasDefault || isDefault;

    const clauseStatements = clause.getStatements();
    if (clauseStatements.length > 0) {
      groups.push({
        labels: pendingLabels,
        clauseStatements,
        isDefault: pendingHasDefault,
      });
      pendingLabels = [];
      pendingHasDefault = false;
    }
  }

  if (pendingLabels.length > 0) {
    groups.push({
      labels: pendingLabels,
      clauseStatements: [],
      isDefault: pendingHasDefault,
    });
  }

  if (groups.length === 0) {
    // Empty switch — value just falls through to next statement.
    return { entry: decisionId, exits: [decisionId], returnExits: [], throwExits: [] };
  }

  const hasDefault = groups.some((g) => g.isDefault);

  // ── Phase 2: render bodies under a shared switch context ──────────────

  const ctx = host.pushSwitchContext();

  type RenderedGroup = {
    labels: string[];
    isDefault: boolean;
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
          isDefault: group.isDefault,
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
        isDefault: group.isDefault,
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

  // Decide whether to create a merge node:
  //
  //   - missing `default`: the switch may fall through with no match,
  //     so we need a merge that the decision can drop into directly.
  //   - empty (label-only) groups need somewhere to land.
  //   - pending breaks need somewhere to land.
  //   - a group with natural fall-through but no following group needs
  //     somewhere to land.
  //
  // Otherwise the switch genuinely has no normal exit (every case
  // diverts via return / throw / continue / labelled break) and we can
  // skip the merge to keep the graph tight.
  const needsMerge =
    !hasDefault ||
    rendered.some((group, index) => {
      if (!group.entry) return true;
      if (group.fallthrough.length > 0 && !findNextGroupEntry(rendered, index)) return true;
      return false;
    }) ||
    ctx.pendingBreaks.length > 0;

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

  // If there's no `default`, an unmatched value drops straight from
  // the decision into the merge. We use an empty label here (rather
  // than something like 'no match') so CodeGen's switch case parser
  // doesn't mistake it for an actual case label — switch case edges
  // must start with `case ` or be `default`.
  if (mergeId && !hasDefault) {
    host.writer.addEdge(decisionId, mergeId, '', false);
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