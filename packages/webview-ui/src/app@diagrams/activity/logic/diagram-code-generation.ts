import type { Edge, Node } from '@xyflow/react';
import type { ActivityWebviewMessenger } from '../model/types';

export function generateCodeFromDiagram(vscode: ActivityWebviewMessenger, nodes: Node[], edges: Edge[]): void {
	vscode.postMessage('code/generateSkeleton', { nodes, edges });
}
