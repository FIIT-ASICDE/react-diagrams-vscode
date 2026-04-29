import type { Node } from '@xyflow/react';
import type { GraphWriter } from '../../graph-writer';

/**
 * Read / mutate node data on a `GraphWriter`-built node.
 *
 * Both helpers used to be duplicated verbatim in `action-flow.ts`,
 * `control-flow.ts`, and `switch-flow.ts`, and each copy reached into
 * the writer's private `nodes` array via an unsafe cast. Centralising
 * them keeps the cast in one place, makes the API surface obvious, and
 * lets us refactor the access path later without chasing copies.
 *
 * Note: this still relies on the writer exposing its `nodes` array,
 * which it does (constructor receives `private readonly nodes: Node[]`).
 * If `GraphWriter` ever wraps node creation behind a stricter API, both
 * helpers can be moved onto it as proper methods without touching every
 * call site.
 */

type WriterWithNodes = { nodes?: Node[] };

function getNodes(writer: GraphWriter): Node[] | undefined {
  return (writer as unknown as WriterWithNodes).nodes;
}

export function getNodeData(
  writer: GraphWriter,
  nodeId: string,
): Record<string, unknown> | undefined {
  const node = getNodes(writer)?.find((candidate) => candidate.id === nodeId);
  return node?.data as Record<string, unknown> | undefined;
}

export function setNodeData(
  writer: GraphWriter,
  nodeId: string,
  extra: Record<string, unknown>,
): void {
  const node = getNodes(writer)?.find((candidate) => candidate.id === nodeId);
  if (!node) return;
  node.data = { ...(node.data ?? {}), ...extra };
}