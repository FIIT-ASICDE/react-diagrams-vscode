import { useCallback, useEffect, useRef, useState } from 'react';
import { ReactFlow, Background, addEdge, applyEdgeChanges, applyNodeChanges, type Node, type Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { VSCodeButton } from '@vscode/webview-ui-toolkit/react';
import { vscode } from '../../app@vscode/api';
import { nodeTypes } from './diagram-rendering/nodeTypes';
import DiagramNavigator from './diagram-rendering/DiagramNavigator';
import BackEdge from './diagram-rendering/BackEdge';


type CodeDataMessage = {
	type: 'code/data';
	nodes: Node[];
	edges: Edge[];
};

type CodeErrorMessage = {
	type: 'code/error';
	message?: string;
};

type NodePreviewDataMessage = {
	type: 'code/nodePreviewData';
	title: string;
	sourceText?: string;
	nodes: Node[];
	edges: Edge[];
};

type NodePreviewErrorMessage = {
	type: 'code/nodePreviewError';
	message?: string;
};

const customNode = {
	action: nodeTypes.action,
	expandable: nodeTypes.expandable,
	decision: nodeTypes.decision,
	merge: nodeTypes.merge,
	initial: nodeTypes.initial,
	end: nodeTypes.end,
	textPreview: nodeTypes.textPreview,
};

const customEdge = {
	back: BackEdge,
};

type ActivityNodeType = 'start' | 'action' | 'decision' | 'merge' | 'end';

type ActivityMessage = CodeDataMessage | CodeErrorMessage | NodePreviewDataMessage | NodePreviewErrorMessage | { type?: string };

function truncate(text: string, maxLength: number) {
	return text.length <= maxLength ? text : `${text.slice(0, maxLength - 3)}...`;
}

export default function ActivityDiagram() {
	const [nodes, setNodes] = useState<Node[]>([]);
	const [edges, setEdges] = useState<Edge[]>([]);
	const [renameDraft, setRenameDraft] = useState<{ nodeId: string; value: string } | null>(null);
	const [previewStack, setPreviewStack] = useState<Array<{ title: string; sourceText?: string; nodes: Node[]; edges: Edge[] }>>([]);
	const [fitViewRevision, setFitViewRevision] = useState(0);
	const nodeCounter = useRef(1);
	const reactFlowRef = useRef<{ fitView: (options?: { padding?: number; duration?: number }) => void } | null>(null);

	const inPreview = previewStack.length > 0;
	const currentPreview = inPreview ? previewStack[previewStack.length - 1] : null;
	const displayedNodes = currentPreview?.nodes ?? nodes;
	const displayedEdges = currentPreview?.edges ?? edges;
	const diagramNodes = currentPreview?.nodes ?? nodes;
	const diagramEdges = currentPreview?.edges ?? edges;

	const createNode = useCallback((type: ActivityNodeType, previewMode = false): Node => {
		const currentIndex = nodeCounter.current++;
		const idPrefix = previewMode ? 'preview' : type;
		const id = `${idPrefix}-${currentIndex}`;

		const defaultLabelByType: Record<ActivityNodeType, string> = {
			start: 'Start',
			action: 'Action',
			decision: 'Condition',
			merge: 'Merge',
			end: 'End',
		};

		return {
			id,
			type,
			draggable: true,
			position: { x: 80 + (currentIndex % 4) * 220, y: 80 + Math.floor(currentIndex / 4) * 120 },
			data: { label: `${defaultLabelByType[type]} ${currentIndex}` },
		};
	}, []);

	const addNode = useCallback((type: ActivityNodeType) => {
		if (inPreview) {
			setPreviewStack((stackSnapshot) => {
				if (stackSnapshot.length === 0) {
					return stackSnapshot;
				}

				const lastIndex = stackSnapshot.length - 1;
				const lastPreview = stackSnapshot[lastIndex];

				return [
					...stackSnapshot.slice(0, lastIndex),
					{
						...lastPreview,
						nodes: [...lastPreview.nodes, createNode(type, true)],
					},
				];
			});
			return;
		}

		setNodes((snapshot) => [...snapshot, createNode(type)]);
	}, [createNode, inPreview]);

	const generateSkeleton = useCallback(() => {
		vscode.postMessage('code/generateSkeleton', { nodes: diagramNodes, edges: diagramEdges });
	}, [diagramNodes, diagramEdges]);

	const openNodePreview = useCallback((node: Node) => {
		const sourceText = String((node.data as { sourceText?: unknown } | undefined)?.sourceText ?? '').trim();
		const label = String((node.data as { label?: unknown } | undefined)?.label ?? '').trim();
		const nodeType = String(node.type ?? 'action');
		const isTruncatedLabel = label.endsWith('...');

		if (nodeType !== 'expandable' && !(isTruncatedLabel && sourceText)) {
			return;
		}

		if (!sourceText) {
			return;
		}

		if (nodeType !== 'expandable') {
			const lines = sourceText.split(/\r?\n/);
			const longestLineLength = lines.reduce((max, line) => Math.max(max, line.length), 0);
			const previewWidth = Math.min(1100, Math.max(420, longestLineLength * 7 + 60));
			const previewHeight = Math.min(720, Math.max(220, lines.length * 20 + 60));

			setPreviewStack((stackSnapshot) => [
				...stackSnapshot,
				{
					title: label || 'Full text preview',
					sourceText,
					nodes: [
						{
							id: `text-preview-${Date.now()}`,
							type: 'textPreview',
							position: { x: 0, y: 0 },
							draggable: true,
							data: {
								label: sourceText,
								previewWidth,
								previewHeight,
							},
						},
					],
					edges: [],
				},
			]);
			setFitViewRevision((revision) => revision + 1);
			return;
		}

		vscode.postMessage('code/nodePreview', {
			title: String((node.data as { label?: unknown } | undefined)?.label ?? 'Node'),
			sourceText,
		});
	}, []);

	useEffect(() => {
		const onMessage = (event: MessageEvent) => {
			const message = event.data as ActivityMessage;

			if (message.type === 'code/data') {
				const codeMessage = message as CodeDataMessage;
				setNodes(codeMessage.nodes);
				setEdges(codeMessage.edges);
				setPreviewStack([]);
				setFitViewRevision((revision) => revision + 1);
				nodeCounter.current = codeMessage.nodes.length + 1;
				return;
			}

			if (message.type === 'code/error') {
				const errorMessage = message as CodeErrorMessage;
				setNodes([
					{ id: 'n1', position: { x: 0, y: 0 }, data: { label: 'Activity diagram error' } },
					{ id: 'n2', position: { x: 0, y: 100 }, data: { label: truncate(errorMessage.message ?? 'Unknown error', 80) } },
				]);

				setEdges([{ id: 'n1-n2', source: 'n1', target: 'n2' }]);
				setPreviewStack([]);
				setFitViewRevision((revision) => revision + 1);
				return;
			}

			if (message.type === 'code/nodePreviewData') {
				const previewMessage = message as NodePreviewDataMessage;
				setPreviewStack((stackSnapshot) => [
					...stackSnapshot,
					{
						title: previewMessage.title,
						sourceText: previewMessage.sourceText,
						nodes: previewMessage.nodes,
						edges: previewMessage.edges,
					},
				]);
				setFitViewRevision((revision) => revision + 1);
				return;
			}

			if (message.type === 'code/nodePreviewError') {
				const errorMessage = message as NodePreviewErrorMessage;
				setPreviewStack((stackSnapshot) => [
					...stackSnapshot,
					{ title: 'Preview unavailable', sourceText: errorMessage.message, nodes: [], edges: [] },
				]);
				setFitViewRevision((revision) => revision + 1);
				return;
			}
		};

		window.addEventListener('message', onMessage);
		vscode.postMessage('code/request');

		return () => {
			window.removeEventListener('message', onMessage);
		};
	}, []);

	useEffect(() => {
		if (!reactFlowRef.current) {
			return;
		}

		if (displayedNodes.length === 0) {
			return;
		}

		requestAnimationFrame(() => {
			reactFlowRef.current?.fitView({ padding: 0.22, duration: 250 });
		});
	}, [fitViewRevision, displayedNodes.length]);

	const onNodesChange = useCallback(
		(changes) => {
			if (inPreview) {
				setPreviewStack((stackSnapshot) => {
					if (stackSnapshot.length === 0) {
						return stackSnapshot;
					}

					const lastIndex = stackSnapshot.length - 1;
					const lastPreview = stackSnapshot[lastIndex];

					return [
						...stackSnapshot.slice(0, lastIndex),
						{ ...lastPreview, nodes: applyNodeChanges(changes, lastPreview.nodes) },
					];
				});
				return;
			}

			setNodes((nodesSnapshot) => applyNodeChanges(changes, nodesSnapshot));
		},
		[inPreview],
	);

	const onEdgesChange = useCallback(
		(changes) => {
			if (inPreview) {
				setPreviewStack((stackSnapshot) => {
					if (stackSnapshot.length === 0) {
						return stackSnapshot;
					}

					const lastIndex = stackSnapshot.length - 1;
					const lastPreview = stackSnapshot[lastIndex];

					return [
						...stackSnapshot.slice(0, lastIndex),
						{ ...lastPreview, edges: applyEdgeChanges(changes, lastPreview.edges) },
					];
				});
				return;
			}
			setEdges((edgesSnapshot) => applyEdgeChanges(changes, edgesSnapshot));
		},
		[inPreview],
	);

	const onConnect = useCallback(
		(params) => {
			if (inPreview) {
				setPreviewStack((stackSnapshot) => {
					if (stackSnapshot.length === 0) {
						return stackSnapshot;
					}

					const lastIndex = stackSnapshot.length - 1;
					const lastPreview = stackSnapshot[lastIndex];

					return [
						...stackSnapshot.slice(0, lastIndex),
						{ ...lastPreview, edges: addEdge(params, lastPreview.edges) },
					];
				});
				return;
			}
			setEdges((edgesSnapshot) => addEdge(params, edgesSnapshot));
		},
		[inPreview],
	);

	const onNodeDoubleClick = useCallback((_: React.MouseEvent, node: Node) => {
		if (inPreview) {
			return;
		}

		const currentLabel = String((node.data as { label?: unknown } | undefined)?.label ?? '');
		setRenameDraft({ nodeId: node.id, value: currentLabel });
	}, [inPreview]);

	const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
		openNodePreview(node);
	}, [openNodePreview]);

	const navigateTo = useCallback((stackIndex: number) => {
		if (stackIndex < 0) {
			setPreviewStack([]);
			return;
		}

		setPreviewStack((stackSnapshot) => stackSnapshot.slice(0, stackIndex + 1));
	}, []);

	const applyRename = useCallback(() => {
		if (!renameDraft) {
			return;
		}

		setNodes((nodesSnapshot) =>
			nodesSnapshot.map((candidate) =>
				candidate.id === renameDraft.nodeId
					? { ...candidate, data: { ...candidate.data, label: renameDraft.value } }
					: candidate,
			),
		);

		setRenameDraft(null);
	}, [renameDraft]);

	const cancelRename = useCallback(() => {
		setRenameDraft(null);
	}, []);

	return (
		<div className="relative h-full w-full">
			<div className="absolute top-2 left-2 z-10 flex flex-wrap items-center gap-2 rounded bg-[var(--vscode-editor-background)]/90 p-2">
				<VSCodeButton appearance="secondary" onClick={() => addNode('start')}>Add Start</VSCodeButton>
				<VSCodeButton appearance="secondary" onClick={() => addNode('action')}>Add Action</VSCodeButton>
				<VSCodeButton appearance="secondary" onClick={() => addNode('decision')}>Add Decision</VSCodeButton>
				<VSCodeButton appearance="secondary" onClick={() => addNode('merge')}>Add Merge</VSCodeButton>
				<VSCodeButton appearance="secondary" onClick={() => addNode('end')}>Add End</VSCodeButton>
				<VSCodeButton appearance="primary" onClick={generateSkeleton}>Generate Skeleton</VSCodeButton>
			</div>
			<div className="absolute right-2 top-16 z-20 w-64">
				<DiagramNavigator
					stackTitles={previewStack.map((entry) => entry.title)}
					onNavigateTo={navigateTo}
				/>
			</div>
			{renameDraft && !inPreview && (
				<div className="absolute left-2 top-16 z-20 flex items-center gap-2 rounded border border-[var(--vscode-input-border)] bg-[var(--vscode-editor-background)] p-2">
					<input
						className="min-w-56 rounded border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] px-2 py-1 text-[var(--vscode-input-foreground)]"
						value={renameDraft.value}
						autoFocus
						onChange={(event) => setRenameDraft((snapshot) => snapshot ? { ...snapshot, value: event.target.value } : snapshot)}
						onKeyDown={(event) => {
							if (event.key === 'Enter') {
								applyRename();
							}
							if (event.key === 'Escape') {
								cancelRename();
							}
						}}
					/>
					<VSCodeButton appearance="primary" onClick={applyRename}>Save</VSCodeButton>
					<VSCodeButton appearance="secondary" onClick={cancelRename}>Cancel</VSCodeButton>
				</div>
			)}
			<ReactFlow
				nodes={displayedNodes}
				edges={displayedEdges}
				style={{ background: '#eef0f3' }}
				onInit={(instance) => {
					reactFlowRef.current = instance;
					requestAnimationFrame(() => instance.fitView({ padding: 0.22, duration: 250 }));
				}}
				onNodesChange={onNodesChange}
				onEdgesChange={onEdgesChange}
				onConnect={onConnect}
				onNodeClick={onNodeClick}
				onNodeDoubleClick={onNodeDoubleClick}
				nodeTypes={customNode}
				edgeTypes={customEdge}
				fitView
			>
				<Background gap={18} size={1} color="#cfd4dc" />
			</ReactFlow>
		</div>
	);
}
