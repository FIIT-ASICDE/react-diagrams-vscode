import { useCallback, useEffect, useRef, useState } from 'react';
import type { Edge, Node } from '@xyflow/react';
import type { ActivityGraphPayload } from '@react-diagrams/core/app@vscode';

export type DiagramHistoryItem = {
	title: string;
	sourceFile?: string;
	nodes: Node[];
	edges: Edge[];
};

function fileNameFromPath(sourceFile?: string): string | undefined {
	if (!sourceFile) {
		return undefined;
	}

	const normalized = sourceFile.replace(/\\/g, '/');
	return normalized.split('/').pop();
}

export function useDiagramHistoryNavigator() {
	const [history, setHistory] = useState<DiagramHistoryItem[]>([]);
	const [currentHistoryIndex, setCurrentHistoryIndex] = useState(0);

	const historyRef = useRef<DiagramHistoryItem[]>([]);
	const currentHistoryIndexRef = useRef(0);
	const pendingPreviewTitleRef = useRef<string | undefined>(undefined);
	const pendingPreviewOpenRef = useRef(false);

	const currentDiagram = history[currentHistoryIndex];
	const visibleNodes = currentDiagram?.nodes ?? [];
	const visibleEdges = currentDiagram?.edges ?? [];
	const currentTitle = currentDiagram?.title ?? 'Diagram';

	useEffect(() => {
		historyRef.current = history;
	}, [history]);

	useEffect(() => {
		currentHistoryIndexRef.current = currentHistoryIndex;
	}, [currentHistoryIndex]);

	const updateCurrentDiagram = useCallback((updater: (diagram: DiagramHistoryItem) => DiagramHistoryItem) => {
		setHistory((historySnapshot) => {
			if (!historySnapshot.length) {
				return historySnapshot;
			}

			const safeIndex = Math.min(currentHistoryIndexRef.current, historySnapshot.length - 1);
			const nextHistory = [...historySnapshot];
			nextHistory[safeIndex] = updater(nextHistory[safeIndex]);
			return nextHistory;
		});
	}, []);

	const pushHistoryEntry = useCallback((entry: DiagramHistoryItem) => {
		setHistory((historySnapshot) => {
			const safeIndex = Math.min(currentHistoryIndexRef.current, Math.max(0, historySnapshot.length - 1));
			const truncated = historySnapshot.slice(0, historySnapshot.length === 0 ? 0 : safeIndex + 1);
			const nextHistory = [...truncated, entry];
			const nextIndex = nextHistory.length - 1;

			currentHistoryIndexRef.current = nextIndex;
			setCurrentHistoryIndex(nextIndex);

			return nextHistory;
		});
	}, []);

	const initializeHistory = useCallback((entry: DiagramHistoryItem) => {
		historyRef.current = [entry];
		currentHistoryIndexRef.current = 0;
		setHistory([entry]);
		setCurrentHistoryIndex(0);
	}, []);

	const markPendingPreview = useCallback((title: string) => {
		pendingPreviewOpenRef.current = true;
		pendingPreviewTitleRef.current = title;
	}, []);

	const clearPendingPreview = useCallback(() => {
		pendingPreviewOpenRef.current = false;
		pendingPreviewTitleRef.current = undefined;
	}, []);

	const createTitle = useCallback((payload: ActivityGraphPayload): string => {
		const pendingTitle = pendingPreviewTitleRef.current?.trim();
		if (pendingTitle) {
			return pendingTitle;
		}

		const sourceFile = typeof payload.sourceFile === 'string' ? payload.sourceFile : '';
		const fileName = fileNameFromPath(sourceFile);
		const currentHistoryLength = historyRef.current.length;

		if (currentHistoryLength === 0) {
			return fileName ? `Root: ${fileName}` : 'Root Diagram';
		}

		if (pendingPreviewOpenRef.current) {
			return fileName ? `${fileName}` : `Expanded ${currentHistoryLength}`;
		}

		return fileName ? `Diagram: ${fileName}` : `Diagram ${currentHistoryLength + 1}`;
	}, []);

	const applyIncomingDiagramPayload = useCallback((payload: ActivityGraphPayload) => {
		const incomingFile = payload.sourceFile;
		const incomingNodes = Array.isArray(payload.nodes) ? payload.nodes as Node[] : [];
		const incomingEdges = Array.isArray(payload.edges) ? payload.edges as Edge[] : [];

		const nextEntry: DiagramHistoryItem = {
			title: createTitle(payload),
			sourceFile: incomingFile,
			nodes: incomingNodes,
			edges: incomingEdges,
		};

		if (historyRef.current.length === 0) {
			initializeHistory(nextEntry);
		} else {
			pushHistoryEntry(nextEntry);
		}

		clearPendingPreview();
		return incomingNodes;
	}, [clearPendingPreview, createTitle, initializeHistory, pushHistoryEntry]);

	const setRootError = useCallback((nodes: Node[], edges: Edge[]) => {
		const rootError: DiagramHistoryItem = {
			title: 'Root Error',
			nodes,
			edges,
		};
		initializeHistory(rootError);
	}, [initializeHistory]);

	const goBack = useCallback(() => {
		const nextIndex = Math.max(0, currentHistoryIndexRef.current - 1);
		currentHistoryIndexRef.current = nextIndex;
		setCurrentHistoryIndex(nextIndex);
	}, []);

	return {
		history,
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
	};
}
