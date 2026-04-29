import { Node as MorphNode, SyntaxKind } from 'ts-morph';
import type { StatementVisitorHost } from './handlers/host-context';

export function compactLabel(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  return cleaned;
}

export function getFallthroughEdgeLabel(host: StatementVisitorHost, sourceId: string): string | undefined {
  const type = host.writer.getNodeType(sourceId);
  return type === 'decision' || type === 'loop' ? 'no' : undefined;
}
  