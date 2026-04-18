import { useCallback, useEffect, useRef, useState } from 'react';
import { ReactFlow, Background, type Node, type Edge, type ReactFlowInstance } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { VSCodeButton } from '@vscode/webview-ui-toolkit/react';
import { vscode } from '../../app@vscode/api';
import { nodeTypes } from './diagram-rendering/nodeTypes';
import DiagramNavigator from './diagram-rendering/DiagramNavigator';
import BackEdge from './diagram-rendering/BackEdge';
import { generateCodeFromDiagram } from './logic/diagram-code-generation';
import {
	appendSnapshot,
	truncateSnapshots,
} from './logic/snapshot-utils';
import {
	applyRenameToEdges,
	applyRenameToNodes,
	createEdgeRenameDraft,
	createRenameDraft,
} from './logic/rename-utils';
import {
	appendNode,
	appendNodeToTopSnapshot,
	applyEdgeChangesToEdges,
	applyEdgeChangesToTopSnapshot,
	applyNodeChangesToNodes,
	applyNodeChangesToTopSnapshot,
	centerNodeInViewport,
	connectEdges,
	connectTopSnapshotEdges,
	createActivityNode,
} from './logic/graph-edit-utils';
import type {
	ActivityGraphPayload,
	ActivityNodePreviewDataPayload,
} from '@react-diagrams/core/app@vscode';
import type {
	ActivityNodeType,
	ActivityMessage,
	DiagramRenameDraft,
	PreviewSnapshot,
} from './model/types';

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

function truncate(text: string, maxLength: number) {
	return text.length <= maxLength ? text : `${text.slice(0, maxLength - 3)}...`;
}

export default function ActivityDiagram() {
	const [nodes, setNodes] = useState<Node[]>([]);
	const [edges, setEdges] = useState<Edge[]>([]);
	const [renameDraft, setRenameDraft] = useState<DiagramRenameDraft | null>(null);
	const [previewStack, setPreviewStack] = useState<PreviewSnapshot[]>([]);
	const [fitViewRevision, setFitViewRevision] = useState(0);
	const nodeCounter = useRef(1);
	const reactFlowRef = useRef<ReactFlowInstance<Node, Edge> | null>(null);
	const previewClickTimeoutRef = useRef<number | null>(null);

	const inPreview = previewStack.length > 0;
	const currentPreview = inPreview ? previewStack[previewStack.length - 1] : null;
	const displayedNodes = currentPreview?.nodes ?? nodes;
	const displayedEdges = currentPreview?.edges ?? edges;
	const diagramNodes = currentPreview?.nodes ?? nodes;
	const diagramEdges = currentPreview?.edges ?? edges;

	const getStartNodes = useCallback((candidates: Node[]) => {
		const byType = candidates.filter((node) => node.type === 'initial' || node.type === 'start');
		if (byType.length > 0) {
			return byType;
		}

		const byLabel = candidates.filter((node) => String((node.data as { label?: unknown } | undefined)?.label ?? '').toLowerCase().startsWith('start'));
		if (byLabel.length > 0) {
			return byLabel;
		}

		const fallback = [...candidates].sort((left, right) => {
			if (left.position.y !== right.position.y) {
				return left.position.y - right.position.y;
			}
			return left.position.x - right.position.x;
		})[0];

		return fallback ? [fallback] : [];

	}, []);

	const addNode = useCallback((type: ActivityNodeType) => {
		const createCenteredNode = (previewMode: boolean) => centerNodeInViewport(
			createActivityNode(type, nodeCounter.current++, previewMode),
			reactFlowRef.current,
			window.innerWidth,
			window.innerHeight,
		);

		if (inPreview) {
			setPreviewStack((stackSnapshot) => appendNodeToTopSnapshot(stackSnapshot, createCenteredNode(true)));
			return;
		}

		setNodes((snapshot) => appendNode(snapshot, createCenteredNode(false)));
	}, [inPreview]);

	const generateSkeleton = useCallback(() => {
		generateCodeFromDiagram(vscode, diagramNodes, diagramEdges);
	}, [diagramNodes, diagramEdges]);

	const openNodePreview = useCallback((node: Node) => {
		const sourceText = String((node.data as { sourceText?: unknown } | undefined)?.sourceText ?? '').trim();
		const nodeType = String(node.type ?? 'action');

		if (nodeType !== 'expandable') {
			return;
		}

		if (!sourceText) {
			return;
		}

		vscode.postMessage('code/nodePreview', {
			title: String((node.data as { label?: unknown } | undefined)?.label ?? 'Node'),
			sourceText,
		});
	}, []);

	const openRenameForNode = useCallback((node: Node, useFullText: boolean) => {
		const draft = createRenameDraft(node);
		if (!useFullText) {
			setRenameDraft({ kind: 'node', draft });
			return;
		}

		const sourceText = String((node.data as { sourceText?: unknown } | undefined)?.sourceText ?? '').trim();
		setRenameDraft({
			kind: 'node',
			draft: {
				...draft,
				value: sourceText || draft.value,
			},
		});
	}, []);

	useEffect(() => {
		const onMessage = (event: MessageEvent) => {
			const message = event.data as ActivityMessage;

			if (message.type === 'code/data') {
				const payload = message.data as ActivityGraphPayload;
				setNodes(Array.isArray(payload.nodes) ? payload.nodes as Node[] : []);
				setEdges(Array.isArray(payload.edges) ? payload.edges as Edge[] : []);
				setPreviewStack([]);
				setFitViewRevision((revision) => revision + 1);
				nodeCounter.current = (Array.isArray(payload.nodes) ? payload.nodes.length : 0) + 1;
				return;
			}

			if (message.type === 'code/error') {
				const errorMessage = message.data as { message?: string };
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
				const previewMessage = message.data as ActivityNodePreviewDataPayload;
				setPreviewStack((stackSnapshot) => appendSnapshot(stackSnapshot, {
					title: previewMessage.title,
					sourceText: previewMessage.sourceText,
					nodes: Array.isArray(previewMessage.nodes) ? previewMessage.nodes as Node[] : [],
					edges: Array.isArray(previewMessage.edges) ? previewMessage.edges as Edge[] : [],
				}));
				setFitViewRevision((revision) => revision + 1);
				return;
			}

			if (message.type === 'code/nodePreviewError') {
				const errorMessage = message.data as { message?: string };
				setPreviewStack((stackSnapshot) => appendSnapshot(stackSnapshot, { title: 'Preview unavailable', sourceText: errorMessage.message, nodes: [], edges: [] }));
				setFitViewRevision((revision) => revision + 1);
				return;
			}
		};

		window.addEventListener('message', onMessage);
		vscode.postMessage('code/request');

		return () => {
			if (previewClickTimeoutRef.current !== null) {
				window.clearTimeout(previewClickTimeoutRef.current);
				previewClickTimeoutRef.current = null;
			}
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
			const viewportOffsetY = -150;
			const startNodes = getStartNodes(displayedNodes);
			if (startNodes.length === 0) {
				return;
			}

			void reactFlowRef.current?.fitView({
				nodes: startNodes,
				padding: 0,
				maxZoom: 0.85,
				duration: 500,
			})
		});
	}, [fitViewRevision, getStartNodes, inPreview]);

	useEffect(() => {
		vscode.postMessage('diagram/visibleGraph', {
			nodes: displayedNodes,
			edges: displayedEdges,
		});
	}, [displayedNodes, displayedEdges]);

	const onNodesChange = useCallback(
		(changes) => {
			if (inPreview) {
				setPreviewStack((stackSnapshot) => applyNodeChangesToTopSnapshot(stackSnapshot, changes));
				return;
			}

			setNodes((nodesSnapshot) => applyNodeChangesToNodes(nodesSnapshot, changes));
		},
		[inPreview],
	);

	const onEdgesChange = useCallback(
		(changes) => {
			if (inPreview) {
				setPreviewStack((stackSnapshot) => applyEdgeChangesToTopSnapshot(stackSnapshot, changes));
				return;
			}
			setEdges((edgesSnapshot) => applyEdgeChangesToEdges(edgesSnapshot, changes));
		},
		[inPreview],
	);

	const onConnect = useCallback(
		(params) => {
			if (inPreview) {
				setPreviewStack((stackSnapshot) => connectTopSnapshotEdges(stackSnapshot, params));
				return;
			}
			setEdges((edgesSnapshot) => connectEdges(edgesSnapshot, params));
		},
		[inPreview],
	);

	const onNodeDoubleClick = useCallback((_: React.MouseEvent, node: Node) => {
		if (previewClickTimeoutRef.current !== null) {
			window.clearTimeout(previewClickTimeoutRef.current);
			previewClickTimeoutRef.current = null;
		}

		const nodeType = String(node.type ?? 'action');
		openRenameForNode(node, nodeType === 'expandable');
	}, [openRenameForNode]);

	const onEdgeDoubleClick = useCallback((_: React.MouseEvent, edge: Edge) => {
		if (previewClickTimeoutRef.current !== null) {
			window.clearTimeout(previewClickTimeoutRef.current);
			previewClickTimeoutRef.current = null;
		}
		setRenameDraft({ kind: 'edge', draft: createEdgeRenameDraft(edge) });
	}, []);

	const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
		if (previewClickTimeoutRef.current !== null) {
			window.clearTimeout(previewClickTimeoutRef.current);
		}

		const nodeType = String(node.type ?? 'action');

		if (nodeType !== 'expandable') {
			openRenameForNode(node, true);
			previewClickTimeoutRef.current = null;
			return;
		}

		previewClickTimeoutRef.current = window.setTimeout(() => {
			openNodePreview(node);
			previewClickTimeoutRef.current = null;
		}, 150);
	}, [openNodePreview, openRenameForNode]);

	const navigateTo = useCallback((stackIndex: number) => {
		setPreviewStack((stackSnapshot) => truncateSnapshots(stackSnapshot, stackIndex));
		setFitViewRevision((revision) => revision + 1);
	}, []);

	const applyRename = useCallback(() => {
		if (!renameDraft) {
			return;
		}

		if (inPreview) {
			setPreviewStack((stackSnapshot) => {
				if (stackSnapshot.length === 0) {
					return stackSnapshot;
				}

				const lastIndex = stackSnapshot.length - 1;
				const lastPreview = stackSnapshot[lastIndex];
				const updatedPreviewNodes = renameDraft.kind === 'node'
					? applyRenameToNodes(lastPreview.nodes, renameDraft.draft)
					: lastPreview.nodes;
				const updatedPreviewEdges = renameDraft.kind === 'edge'
					? applyRenameToEdges(lastPreview.edges, renameDraft.draft)
					: lastPreview.edges;

				return [
					...stackSnapshot.slice(0, lastIndex),
					{
						...lastPreview,
						nodes: updatedPreviewNodes,
						edges: updatedPreviewEdges,
					},
				];
			});
			setRenameDraft(null);
			return;
		}

		if (renameDraft.kind === 'node') {
			setNodes((nodesSnapshot) => applyRenameToNodes(nodesSnapshot, renameDraft.draft));
		} else {
			setEdges((edgesSnapshot) => applyRenameToEdges(edgesSnapshot, renameDraft.draft));
		}

		setRenameDraft(null);
	}, [inPreview, renameDraft]);

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
			{renameDraft && (
				<div className="absolute inset-0 z-30 flex items-start justify-center bg-black/20 pt-20">
					<div className="w-[760px] max-w-[calc(100vw-48px)] rounded border border-[var(--vscode-editorWidget-border)] bg-[var(--vscode-editorWidget-background)] p-4 shadow-xl">
						<div className="mb-3 text-sm font-semibold text-[var(--vscode-editor-foreground)]">
							{renameDraft.kind === 'edge' ? 'Edit Edge Label' : 'Edit Node Text'}
						</div>

						{renameDraft.kind === 'node' ? (
							<textarea
								className="h-56 w-full resize-y rounded border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] px-3 py-2 text-sm text-[var(--vscode-input-foreground)]"
								value={renameDraft.draft.value}
								placeholder="Node text"
								autoFocus
								onChange={(event) => setRenameDraft((snapshot) => snapshot && snapshot.kind === 'node'
									? { ...snapshot, draft: { ...snapshot.draft, value: event.target.value } }
									: snapshot)}
								onKeyDown={(event) => {
									if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
										applyRename();
									}
									if (event.key === 'Escape') {
										cancelRename();
									}
								}}
							/>
						) : (
							<input
								className="w-full rounded border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] px-3 py-2 text-sm text-[var(--vscode-input-foreground)]"
								value={renameDraft.draft.value}
								placeholder="Edge label"
								autoFocus
								onChange={(event) => setRenameDraft((snapshot) => snapshot && snapshot.kind === 'edge'
									? { ...snapshot, draft: { ...snapshot.draft, value: event.target.value } }
									: snapshot)}
								onKeyDown={(event) => {
									if (event.key === 'Enter') {
										applyRename();
									}
									if (event.key === 'Escape') {
										cancelRename();
									}
								}}
							/>
						)}

						{renameDraft.kind === 'node' && renameDraft.draft.deps !== undefined && (
							<input
								className="mt-3 w-full rounded border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] px-3 py-2 text-sm text-[var(--vscode-input-foreground)]"
								value={renameDraft.draft.deps}
								placeholder="deps"
								onChange={(event) => setRenameDraft((snapshot) => snapshot && snapshot.kind === 'node'
									? { ...snapshot, draft: { ...snapshot.draft, deps: event.target.value } }
									: snapshot)}
							/>
						)}

						<div className="mt-4 flex items-center gap-2">
							{renameDraft.kind === 'node' && (
								<VSCodeButton
									appearance="secondary"
									onClick={() => {
										void navigator.clipboard.writeText(renameDraft.draft.value);
									}}
								>
									Copy
								</VSCodeButton>
							)}
							<VSCodeButton appearance="primary" onClick={applyRename}>Save</VSCodeButton>
							<VSCodeButton appearance="secondary" onClick={cancelRename}>Close</VSCodeButton>
						</div>
					</div>
				</div>
			)}

			<ReactFlow
				nodes={displayedNodes}
				edges={displayedEdges}
				style={{ background: '#eef0f3' }}
				onInit={(instance) => {
					reactFlowRef.current = instance;
				}}
				onNodesChange={onNodesChange}
				onEdgesChange={onEdgesChange}
				onConnect={onConnect}
				onNodeClick={onNodeClick}
				onNodeDoubleClick={onNodeDoubleClick}
				onEdgeDoubleClick={onEdgeDoubleClick}
				nodeTypes={customNode}
				edgeTypes={customEdge}
				fitView
			>
				<Background gap={18} size={1} color="#cfd4dc" />
			</ReactFlow>
		</div>
	);
}
