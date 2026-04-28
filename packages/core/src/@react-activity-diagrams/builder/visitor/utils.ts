import { Node as MorphNode, SyntaxKind } from 'ts-morph';

export function compactLabel(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  return cleaned;
}

export function getFallthroughEdgeLabel(sourceId: string): string | undefined {
  return sourceId.startsWith('decision-') || sourceId.startsWith('loop-') ? 'no' : undefined;
}
