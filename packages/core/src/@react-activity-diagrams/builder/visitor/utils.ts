import { Node as MorphNode, SyntaxKind } from 'ts-morph';

export const MAX_LABEL_LENGTH = 20;

export function compactLabel(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  return cleaned.length > MAX_LABEL_LENGTH
    ? `${cleaned.slice(0, MAX_LABEL_LENGTH - 3)}...`
    : cleaned;
}

export function getFallthroughEdgeLabel(sourceId: string): string | undefined {
  return sourceId.startsWith('decision-') || sourceId.startsWith('loop-') ? 'no' : undefined;
}

function isDecisionKind(kind: SyntaxKind): boolean {
  return (
    kind === SyntaxKind.IfStatement ||
    kind === SyntaxKind.DoStatement ||
    kind === SyntaxKind.WhileStatement ||
    kind === SyntaxKind.ForStatement ||
    kind === SyntaxKind.ForInStatement ||
    kind === SyntaxKind.ForOfStatement ||
    kind === SyntaxKind.TryStatement ||
    kind === SyntaxKind.SwitchStatement
  );
}

export function countDecisionsInBranch(node: MorphNode): number {
  const isDecisionNode = (candidate: MorphNode) => isDecisionKind(candidate.getKind());
  const decisions: MorphNode[] = [];

  if (isDecisionNode(node)) {
    decisions.push(node);
  }

  decisions.push(...node.getDescendants().filter(isDecisionNode));

  let maxDepth = 0;

  for (const decision of decisions) {
    let depth = 0;
    let current: MorphNode | undefined = decision;

    while (current && current !== node) {
      if (isDecisionNode(current)) {
        depth += 1;
      }
      current = current.getParent();
    }

    if (current === node && isDecisionNode(current)) {
      depth += 1;
    }

    if (depth > maxDepth) {
      maxDepth = depth;
    }
  }

  return maxDepth;
}
