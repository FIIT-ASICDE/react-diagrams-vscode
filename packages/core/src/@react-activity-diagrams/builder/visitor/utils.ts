import type { StatementVisitorHost } from './handlers/host-context';

// Compacts whitespace in a node label.
export function compactLabel(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  return cleaned;
}

// Returns the default fallthrough label for an exit node.
export function getFallthroughEdgeLabel(host: StatementVisitorHost, sourceId: string): string | undefined {
  const type = host.writer.getNodeType(sourceId);
  return type === 'decision' || type === 'loop' ? 'no' : undefined;
}
  