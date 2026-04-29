// import type { Node } from '@xyflow/react';
// import { StatementVisitorHost } from './host-context';



// type WriterWithNodes = { nodes?: Node[] };

// function getNodes(writer: StatementVisitorHost): Node[] | undefined {
//   return (writer as unknown as WriterWithNodes).nodes;
// }

// export function getNodeData(
//   writer: StatementVisitorHost,
//   nodeId: string,
// ): Record<string, unknown> | undefined {
//   const node = getNodes(writer)?.find((candidate) => candidate.id === nodeId);
//   return node?.data as Record<string, unknown> | undefined;
// }

// export function setNodeData(
//   writer: StatementVisitorHost,
//   nodeId: string,
//   extra: Record<string, unknown>,
// ): void {
//   const node = getNodes(writer)?.find((candidate) => candidate.id === nodeId);
//   if (!node) return;
//   node.data = { ...(node.data ?? {}), ...extra };
// }