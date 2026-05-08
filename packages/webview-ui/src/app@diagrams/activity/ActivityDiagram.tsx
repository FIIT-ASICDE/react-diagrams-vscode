import { useCallback, useEffect } from 'react';
import type { MouseEvent } from 'react';
import {
	type Node,
} from '@xyflow/react';

import { vscode } from '../../app@vscode/api';
import type { ActivityWebviewMessenger } from './model/types';

import { nodeTypes } from './components/diagram/nodeTypes';
import { useDiagramNavigationStore } from './logic/navigation/use-diagram-navigation-store';
import { DiagramToolbar } from './components/main/Toolbar';
import { DiagramCanvas } from './components/main/DiagramCanvas';
import { DiagramModals } from './components/main/DiagramModals';
import { useActivityCodegen } from './hooks/useActivityCodegen';
import { useActivityExport } from './hooks/useActivityExport';
import { useActivityMessages } from './hooks/useActivityMessages';
import { useActivityModals } from './hooks/useActivityModals';
import { useActivityPlayground } from './hooks/useActivityPlayground';




// Handles activity diagram.
export default function ActivityDiagram() {
	const stack = useDiagramNavigationStore((s) => s.stack);
	const currentIndex = useDiagramNavigationStore((s) => s.currentIndex);
	const visibleRevision = useDiagramNavigationStore((s) => s.visibleRevision);
	const applyIncomingDiagramPayload = useDiagramNavigationStore((s) => s.applyIncomingDiagramPayload);
	const setRootError = useDiagramNavigationStore((s) => s.setRootError);
	const markPendingPreview = useDiagramNavigationStore((s) => s.markPendingPreview);
	const clearPendingPreview = useDiagramNavigationStore((s) => s.clearPendingPreview);
	const goBack = useDiagramNavigationStore((s) => s.goBack);

	const currentDiagram = stack[currentIndex];
	const visibleNodes = currentDiagram?.nodes ?? [];
	const visibleEdges = currentDiagram?.edges ?? [];
	const currentTitle = currentDiagram?.title ?? 'Diagram';
	const canGoBack = currentIndex > 0;

	const postMessage = useCallback((type: string, data: unknown = {}) => {
		vscode.postMessage(type as never, data as never);
	}, []);

	const {
		viewMode,
		playgroundEdges,
		setPlaygroundNodes,
		setPlaygroundEdges,
		activeNodes,
		activeEdges,
		isEditable,
		isPlayground,
		edgeTypes,
		getActiveGraph,
		handleCanvasInit,
		reactFlowRef,
		addPlaygroundNode,
		clearPlayground,
		switchToViewer,
		switchToPlayground,
		onNodesChange,
		onEdgesChange,
		onConnect,
	} = useActivityPlayground({
		visibleNodes,
		visibleEdges,
	});

	const {
		modalState,
		closeModal,
		onNodeContextMenu,
		onEdgeContextMenu,
		onNodeEditChange,
		onEdgeEditChange,
		saveNodeEditDraft,
		saveEdgeEditDraft,
	} = useActivityModals({
		viewMode,
		playgroundEdges,
		setPlaygroundNodes,
		setPlaygroundEdges,
	});

	const { handleImageRequest, savePng } = useActivityExport({ postMessage, reactFlowRef });

	useActivityMessages({
		applyIncomingDiagramPayload,
		setRootError,
		clearPendingPreview,
		getActiveGraph,
		handleImageRequest,
		postMessage,
	});

	const { generateSkeleton } = useActivityCodegen({
		vscode: vscode as unknown as ActivityWebviewMessenger,
		getActiveGraph,
	});

	
	useEffect(() => {
		postMessage('webview/ready');
	}, [postMessage]);

	

	const openNodeDiagram = useCallback(
		(node: Node) => {
			if (viewMode !== 'viewer') return;
			if (String(node.type ?? 'action') !== 'expandable') return;

			const data = (node.data ?? {}) as Record<string, unknown>;
			const sourceText = String(data.sourceText ?? data.label ?? '').trim();
			if (!sourceText) return;

			const title = String(
				(node.data as { label?: unknown } | undefined)?.label ?? 'Expanded Diagram',
			);
			markPendingPreview(title);
			postMessage('code/nodePreview', { title, sourceText });
		},
		[markPendingPreview, postMessage, viewMode],
	);

	

	const onNodeClick = useCallback(
		(_event: MouseEvent, node: Node) => {
			if (viewMode !== 'viewer') return;
			if (String(node.type ?? 'action') === 'expandable') {
				openNodeDiagram(node);
			}
		},
		[openNodeDiagram, viewMode],
	);

	const handleSwitchToViewer = useCallback(() => {
		closeModal();
		switchToViewer();
	}, [closeModal, switchToViewer]);

	const handleSwitchToPlayground = useCallback(() => {
		closeModal();
		switchToPlayground();
	}, [closeModal, switchToPlayground]);

	const handleClearPlayground = useCallback(() => {
		closeModal();
		clearPlayground();
	}, [clearPlayground, closeModal]);

	

	const focusTrigger = `${viewMode}:${viewMode === 'viewer' ? visibleRevision : 'mode'}`;

	return (
		<div className="flex h-full w-full flex-col">
			<DiagramToolbar
				mode={viewMode}
				currentTitle={currentTitle}
				nodeCount={activeNodes.length}
				edgeCount={activeEdges.length}
				canGoBack={canGoBack}
				onBack={goBack}
				onSwitchToViewer={handleSwitchToViewer}
				onSwitchToPlayground={handleSwitchToPlayground}
				onAddNode={addPlaygroundNode}
				onClearPlayground={handleClearPlayground}
				onGenerateSkeleton={generateSkeleton}
				onSavePng={() => savePng(`${currentTitle}.png`)}
			/>

			<div className="relative flex-1 overflow-hidden">
			<DiagramModals
				modalState={modalState}
				viewMode={viewMode}
				onClose={closeModal}
				onNodeEditChange={onNodeEditChange}
				onNodeEditSave={saveNodeEditDraft}
				onEdgeEditChange={onEdgeEditChange}
				onEdgeEditSave={saveEdgeEditDraft}
			/>

			<DiagramCanvas
				nodes={activeNodes}
				edges={activeEdges}
				isEditable={isEditable}
				isPlayground={isPlayground}
				edgeTypes={edgeTypes}
				nodeTypes={nodeTypes}
				focusTrigger={focusTrigger}
				onInit={handleCanvasInit}
				onNodeClick={onNodeClick}
				onNodeContextMenu={onNodeContextMenu}
				onEdgeContextMenu={onEdgeContextMenu}
				onNodesChange={isPlayground ? onNodesChange : undefined}
				onEdgesChange={isPlayground ? onEdgesChange : undefined}
				onConnect={isPlayground ? onConnect : undefined}
			/>
			</div>
		</div>
	);
}