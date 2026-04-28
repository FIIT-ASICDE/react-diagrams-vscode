import { useCallback } from 'react';
import type { Edge, Node } from '@xyflow/react';
import type { ActivityGraphPayload } from '@react-diagrams/core/app@vscode';
import { useActivityMessages as useExtensionActivityMessages } from '../logic/use-activity-messages';

type GraphSnapshot = {
	nodes: Node[];
	edges: Edge[];
};

type Params = {
	applyIncomingDiagramPayload: (payload: ActivityGraphPayload) => Promise<Node[]>;
	setRootError: (nodes: Node[], edges: Edge[]) => void;
	clearPendingPreview: () => void;
	getActiveGraph: () => GraphSnapshot;
	handleImageRequest: () => void;
	postMessage: (type: string, data?: unknown) => void;
};

function truncate(text: string, maxLength: number) {
	return text.length <= maxLength ? text : `${text.slice(0, maxLength - 3)}...`;
}

function buildErrorGraph(message: string): { nodes: Node[]; edges: Edge[] } {
	return {
		nodes: [
			{ id: 'n1', position: { x: 0, y: 0 }, data: { label: 'Activity diagram error' } },
			{ id: 'n2', position: { x: 0, y: 100 }, data: { label: truncate(message, 80) } },
		],
		edges: [{ id: 'n1-n2', source: 'n1', target: 'n2' }],
	};
}

export function useActivityMessages({
	applyIncomingDiagramPayload,
	setRootError,
	clearPendingPreview,
	getActiveGraph,
	handleImageRequest,
	postMessage,
}: Params) {
	const handleCodeData = useCallback(
		(payload: ActivityGraphPayload) => {
			void applyIncomingDiagramPayload(payload);
		},
		[applyIncomingDiagramPayload],
	);

	const handleCodeError = useCallback(
		(message: string) => {
			const { nodes, edges } = buildErrorGraph(message);
			setRootError(nodes, edges);
			clearPendingPreview();
		},
		[clearPendingPreview, setRootError],
	);

	const handleGraphRequest = useCallback(() => {
		const { nodes, edges } = getActiveGraph();
		postMessage('diagram/graphSnapshot', { nodes, edges });
	}, [getActiveGraph, postMessage]);

	useExtensionActivityMessages({
		onCodeData: handleCodeData,
		onCodeError: handleCodeError,
		onImageRequest: handleImageRequest,
		onGraphRequest: handleGraphRequest,
	});

	return {
		handleCodeData,
		handleCodeError,
		handleGraphRequest,
	};
}
