import { useCallback } from 'react';
import type { Edge, Node } from '@xyflow/react';
import type { ActivityWebviewMessenger } from '../model/types';
import { generateCodeFromDiagram } from '../logic/diagram-code-generation';

type GraphSnapshot = {
	nodes: Node[];
	edges: Edge[];
};

type Params = {
	vscode: ActivityWebviewMessenger;
	getActiveGraph: () => GraphSnapshot;
};

export function useActivityCodegen({ vscode, getActiveGraph }: Params) {
	const generateSkeleton = useCallback(() => {
		const { nodes, edges } = getActiveGraph();
		generateCodeFromDiagram(vscode, nodes, edges);
	}, [getActiveGraph, vscode]);

	return {
		generateSkeleton,
	};
}
