import type { Edge, Node } from '@xyflow/react';
import type { ActivityWebviewMessenger } from '../model/types';
export function generateCodeFromDiagram(vscode: ActivityWebviewMessenger, nodes: Node[], edges: Edge[], sourceFile?: string): void {
	console.log('Generating code from diagram with nodes:', nodes, 'and edges:', edges);
	vscode.postMessage('diagram/generateSkeleton', { nodes, edges, sourceFile });
}
