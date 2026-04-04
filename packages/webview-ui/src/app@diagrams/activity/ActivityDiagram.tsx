import { useCallback, useEffect, useState } from 'react';
import { ReactFlow, addEdge, applyEdgeChanges, applyNodeChanges, type Node, type Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { vscode } from '../../app@vscode/api';

type CustomNode = Node<{ label: string }>;

const initialNodes: CustomNode[] = [
	{ id: 'n1', position: { x: 0, y: 0 }, data: { label: 'Activity diagram ready' } },
	{ id: 'n2', position: { x: 0, y: 100 }, data: { label: 'Waiting for code/data...' } },
];

const initialEdges = [{ id: 'n1-n2', source: 'n1', target: 'n2' }];

type CodeDataMessage = {
	type: 'code/data';
	nodes: CustomNode[];
	edges: Edge[];
};

type CodeErrorMessage = {
	type: 'code/error';
	message?: string;
};

type ActivityMessage = CodeDataMessage | CodeErrorMessage | { type?: string };

function truncate(text: string, maxLength: number) {
	return text.length <= maxLength ? text : `${text.slice(0, maxLength - 3)}...`;
}

export default function ActivityDiagram() {
	const [nodes, setNodes] = useState(initialNodes);
	const [edges, setEdges] = useState(initialEdges);

	useEffect(() => {
		const onMessage = (event: MessageEvent) => {
			const message = event.data as ActivityMessage;

			if (message.type === 'code/data') {
				const codeMessage = message as CodeDataMessage;
				setNodes(codeMessage.nodes);
				setEdges(codeMessage.edges);
				return;
			}

			if (message.type === 'code/error') {
				const errorMessage = message as CodeErrorMessage;
				setNodes([
					{ id: 'n1', position: { x: 0, y: 0 }, data: { label: 'Activity diagram error' } },
					{ id: 'n2', position: { x: 0, y: 100 }, data: { label: truncate(errorMessage.message ?? 'Unknown error', 80) } },
				]);

				setEdges([{ id: 'n1-n2', source: 'n1', target: 'n2' }]);
			}
		};

		window.addEventListener('message', onMessage);
		vscode.postMessage('code/request');

		return () => {
			window.removeEventListener('message', onMessage);
		};
	}, []);

	const onNodesChange = useCallback(
		(changes) => setNodes((nodesSnapshot) => applyNodeChanges(changes, nodesSnapshot)),
		[],
	);

	const onEdgesChange = useCallback(
		(changes) => setEdges((edgesSnapshot) => applyEdgeChanges(changes, edgesSnapshot)),
		[],
	);

	const onConnect = useCallback(
		(params) => setEdges((edgesSnapshot) => addEdge(params, edgesSnapshot)),
		[],
	);

	return (
		<div className="h-full w-full">
			<ReactFlow
				nodes={nodes}
				edges={edges}
				onNodesChange={onNodesChange}
				onEdgesChange={onEdgesChange}
				onConnect={onConnect}
				fitView
			/>
		</div>
	);
}
