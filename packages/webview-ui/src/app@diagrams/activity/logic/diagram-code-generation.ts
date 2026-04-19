import type { Edge, Node } from '@xyflow/react';
import type { ActivityWebviewMessenger } from '../model/types';

export function generateCodeFromDiagram(vscode: ActivityWebviewMessenger, nodes: Node[], edges: Edge[], sourceFile?: string): void {
	vscode.postMessage('diagram/generateSkeleton', { nodes, edges, sourceFile });
}
