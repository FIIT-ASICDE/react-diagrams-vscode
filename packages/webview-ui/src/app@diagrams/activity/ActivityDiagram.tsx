import { useCallback, useEffect, useRef, useState } from 'react';
import {
	ReactFlow,
	Background,
	type Node,
	type Edge,
	type ReactFlowInstance,
	useReactFlow,
	Controls,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { VSCodeButton } from '@vscode/webview-ui-toolkit/react';
import { vscode } from '../../app@vscode/api';
import { nodeTypes } from './diagram-rendering/nodeTypes';
import BackEdge, { NormalEdge } from './diagram-rendering/BackEdge';
import { generateCodeFromDiagram } from './logic/diagram-code-generation';
import { toPng } from 'html-to-image';
import {
	applyRenameToEdges,
	applyRenameToNodes,
	createEdgeRenameDraft,
	createRenameDraft,
} from './logic/rename-utils';
import {
	appendNode,
	applyEdgeChangesToEdges,
	applyNodeChangesToNodes,
	centerNodeInViewport,
	connectEdges,
	createActivityNode,
} from './logic/graph-edit-utils';
import type { ActivityGraphPayload } from '@react-diagrams/core/app@vscode';
import type {
	ActivityNodeType,
	ActivityMessage,
	DiagramRenameDraft,
} from './model/types';
import { useDiagramHistoryNavigator } from './logic/useDiagramHistoryNavigator';

const customNode = {
	action: nodeTypes.action,
	expandable: nodeTypes.expandable,
	decision: nodeTypes.decision,
	loop: nodeTypes.loop,
	merge: nodeTypes.merge,
	initial: nodeTypes.initial,
	end: nodeTypes.end,
	textPreview: nodeTypes.textPreview,
};

const customEdge = {
	back: BackEdge,
	smoothstep: NormalEdge,
};

function AutoFitOnSnapshotChange({ nodesCount }: { nodesCount: number }) {
	const { fitView, getNodes, setCenter } = useReactFlow();

	useEffect(() => {
		if (!nodesCount) return;

		requestAnimationFrame(() => {
			void fitView({ padding: 0.2 });

			const nodes = getNodes();
			const startNode = nodes.find((n) => n.type === 'initial') ?? nodes[0];
			if (!startNode) return;

			const x = startNode.position.x - (startNode.width ?? 0) / 2;
			const y = startNode.position.y;

			setTimeout(() => {
				setCenter(x, y, {
					zoom: 0.6,
					duration: 200,
				});
			}, 50);
		});
	}, [nodesCount, fitView, getNodes, setCenter]);

	return null;
}

async function captureDiagramImage(): Promise<string | null> {
	const element = document.querySelector('.react-flow') as HTMLElement | null;
	if (!element) {
		return null;
	}

	return toPng(element, {
		cacheBust: true,
		pixelRatio: 2,
	});
}

function truncate(text: string, maxLength: number) {
	return text.length <= maxLength ? text : `${text.slice(0, maxLength - 3)}...`;
}

export default function ActivityDiagram() {
	const [renameDraft, setRenameDraft] = useState<DiagramRenameDraft | null>(null);
	const [sourceFile, setSourceFile] = useState<string | undefined>(undefined);

	const nodeCounter = useRef(1);
	const reactFlowRef = useRef<ReactFlowInstance<Node, Edge> | null>(null);
	const previewClickTimeoutRef = useRef<number | null>(null);

	const {
		currentHistoryIndex,
		currentDiagram,
		visibleNodes,
		visibleEdges,
		currentTitle,
		historyRef,
		updateCurrentDiagram,
		applyIncomingDiagramPayload,
		setRootError,
		markPendingPreview,
		clearPendingPreview,
		goBack,
	} = useDiagramHistoryNavigator();


	const postMessage = useCallback((type: string, data: unknown = {}) => {
		vscode.postMessage(type, data);
	}, []);

	const handleIncomingMessage = useCallback(async (message: ActivityMessage | { type?: string; data?: unknown }) => {
		if (message?.type === 'diagram/requestImage') {
			try {
				const dataUrl = await captureDiagramImage();
				postMessage('diagram/imageData', { dataUrl });
			} catch (error) {
				postMessage('diagram/imageData', {
					dataUrl: null,
					error: error instanceof Error ? error.message : 'Image capture failed',
				});
			}
			return;
		}

		if (message?.type === 'code/data') {
			const payload = message.data as ActivityGraphPayload;
			const incomingFile =
				typeof payload.sourceFile === 'string' && payload.sourceFile.trim()
					? payload.sourceFile
					: undefined;

			setSourceFile(incomingFile);

			const incomingNodes = applyIncomingDiagramPayload(payload);
			nodeCounter.current = incomingNodes.length + 1;
			return;
		}

		if (message?.type === 'code/error') {
			const errorMessage = message.data as { message?: string };
			const errorNodes: Node[] = [
				{ id: 'n1', position: { x: 0, y: 0 }, data: { label: 'Activity diagram error' } },
				{
					id: 'n2',
					position: { x: 0, y: 100 },
					data: { label: truncate(errorMessage.message ?? 'Unknown error', 80) },
				},
			];
			const errorEdges: Edge[] = [{ id: 'n1-n2', source: 'n1', target: 'n2' }];

			if (historyRef.current.length === 0) {
				setRootError(errorNodes, errorEdges);
			} else {
				updateCurrentDiagram((diagram) => ({
					...diagram,
					nodes: errorNodes,
					edges: errorEdges,
				}));
			}

			clearPendingPreview();
		}
	}, [
		applyIncomingDiagramPayload,
		clearPendingPreview,
		historyRef,
		postMessage,
		setRootError,
		updateCurrentDiagram,
	]);

	useEffect(() => {
		const onMessage = (event: MessageEvent) => {
			void handleIncomingMessage(event.data);
		};

		window.addEventListener('message', onMessage);

		postMessage('webview/ready');
		// postMessage('diagram/openSourceFile', {
		// });

		return () => {
			if (previewClickTimeoutRef.current !== null) {
				window.clearTimeout(previewClickTimeoutRef.current);
				previewClickTimeoutRef.current = null;
			}
			window.removeEventListener('message', onMessage);
		};
	}, [handleIncomingMessage, postMessage]);



	useEffect(() => {
		postMessage('diagram/visibleGraph', {
			nodes: visibleNodes,
			edges: visibleEdges,
		});
	}, [postMessage, visibleEdges, visibleNodes]);

	useEffect(() => {
		nodeCounter.current = visibleNodes.length + 1;
	}, [visibleNodes.length]);

	const addNode = useCallback((type: ActivityNodeType) => {
		const createCenteredNode = () =>
			centerNodeInViewport(
				createActivityNode(type, nodeCounter.current++, false),
				reactFlowRef.current,
				window.innerWidth,
				window.innerHeight,
			);

		updateCurrentDiagram((diagram) => ({
			...diagram,
			nodes: appendNode(diagram.nodes, createCenteredNode()),
		}));
	}, [updateCurrentDiagram]);

	const generateSkeleton = useCallback(() => {
		generateCodeFromDiagram(vscode, visibleNodes, visibleEdges);
	}, [visibleEdges, visibleNodes]);

	const openNodeDiagram = useCallback((node: Node) => {
		if (String(node.type ?? 'action') !== 'expandable') {
			return;
		}

		const sourceText = String(
			(node.data as { sourceText?: unknown } | undefined)?.sourceText ?? ''
		).trim();

		if (!sourceText) {
			return;
		}

		markPendingPreview(
			String((node.data as { label?: unknown } | undefined)?.label ?? 'Expanded Diagram')
		);

		postMessage('code/nodePreview', {
			title: String((node.data as { label?: unknown } | undefined)?.label ?? 'Node'),
			sourceText,
		});
	}, [markPendingPreview, postMessage]);

	const openRenameForNode = useCallback((node: Node, useFullText: boolean) => {
		const draft = createRenameDraft(node);

		if (!useFullText) {
			setRenameDraft({ kind: 'node', draft });
			return;
		}

		const sourceText = String(
			(node.data as { sourceText?: unknown } | undefined)?.sourceText ?? ''
		).trim();

		setRenameDraft({
			kind: 'node',
			draft: {
				...draft,
				value: sourceText || draft.value,
			},
		});
	}, []);

	const onNodesChange = useCallback((changes) => {
		updateCurrentDiagram((diagram) => ({
			...diagram,
			nodes: applyNodeChangesToNodes(diagram.nodes, changes),
		}));
	}, [updateCurrentDiagram]);

	const onEdgesChange = useCallback((changes) => {
		updateCurrentDiagram((diagram) => ({
			...diagram,
			edges: applyEdgeChangesToEdges(diagram.edges, changes),
		}));
	}, [updateCurrentDiagram]);

	const onConnect = useCallback((params) => {
		updateCurrentDiagram((diagram) => ({
			...diagram,
			edges: connectEdges(diagram.edges, params),
		}));
	}, [updateCurrentDiagram]);

	const onNodeDoubleClick = useCallback((_: React.MouseEvent, node: Node) => {
		if (previewClickTimeoutRef.current !== null) {
			window.clearTimeout(previewClickTimeoutRef.current);
			previewClickTimeoutRef.current = null;
		}

		openRenameForNode(node, String(node.type ?? 'action') === 'expandable');
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

		if (String(node.type ?? 'action') !== 'expandable') {
			openRenameForNode(node, true);
			previewClickTimeoutRef.current = null;
			return;
		}

		previewClickTimeoutRef.current = window.setTimeout(() => {
			openNodeDiagram(node);
			previewClickTimeoutRef.current = null;
		}, 150);
	}, [openNodeDiagram, openRenameForNode]);

	const applyRename = useCallback(() => {
		if (!renameDraft) {
			return;
		}

		if (renameDraft.kind === 'node') {
			updateCurrentDiagram((diagram) => ({
				...diagram,
				nodes: applyRenameToNodes(diagram.nodes, renameDraft.draft),
			}));
		} else {
			updateCurrentDiagram((diagram) => ({
				...diagram,
				edges: applyRenameToEdges(diagram.edges, renameDraft.draft),
			}));
		}

		setRenameDraft(null);
	}, [renameDraft, updateCurrentDiagram]);

	const cancelRename = useCallback(() => {
		setRenameDraft(null);
	}, []);

	return (
		<div className="relative h-full w-full">
			<div className="absolute top-2 left-2 z-10 flex flex-wrap items-center gap-2 rounded bg-[var(--vscode-editor-background)]/90 p-2">
				<VSCodeButton
					appearance="secondary"
					disabled={currentHistoryIndex === 0}
					onClick={goBack}
				>
					&lt;
				</VSCodeButton>
				<div className="max-w-[220px] truncate text-xs text-[var(--vscode-foreground)]">
					{currentTitle}
				</div>
				<VSCodeButton appearance="secondary" onClick={() => addNode('start')}>Add Start</VSCodeButton>
				<VSCodeButton appearance="secondary" onClick={() => addNode('action')}>Add Action</VSCodeButton>
				<VSCodeButton appearance="secondary" onClick={() => addNode('decision')}>Add Decision</VSCodeButton>
				<VSCodeButton appearance="secondary" onClick={() => addNode('merge')}>Add Merge</VSCodeButton>
				<VSCodeButton appearance="secondary" onClick={() => addNode('end')}>Add End</VSCodeButton>
				<VSCodeButton appearance="primary" onClick={generateSkeleton}>Generate Skeleton</VSCodeButton>
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
				className="download-image"
				nodes={visibleNodes}
				edges={visibleEdges}
				style={{ backgroundColor: 'white' }}
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
				snapToGrid
			>
				<AutoFitOnSnapshotChange nodesCount={visibleNodes.length} />
				<Controls />
				<Background gap={18} size={1} />
			</ReactFlow>
		</div>
	);
}
