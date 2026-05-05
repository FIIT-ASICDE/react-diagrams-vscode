import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import type { Edge, Node, ReactFlowInstance } from '@xyflow/react';
import { getNodesBounds, getViewportForBounds } from '@xyflow/react';
import { toPng } from 'html-to-image';

type Params = {
	postMessage: (type: string, data?: unknown) => void;
	reactFlowRef: MutableRefObject<ReactFlowInstance<Node, Edge> | null>;
};

const IMAGE_WIDTH = 1920;
const IMAGE_HEIGHT = 1080;

async function captureFullDiagram(
	reactFlowRef: MutableRefObject<ReactFlowInstance<Node, Edge> | null>,
): Promise<string> {
	const rf = reactFlowRef.current;
	const viewport = document.querySelector<HTMLElement>('.react-flow__viewport');
	if (!viewport || !rf) return '';

	const nodes = rf.getNodes();
	if (!nodes.length) return '';

	const bounds = getNodesBounds(nodes);
	const { x, y, zoom } = getViewportForBounds(
		bounds,
		IMAGE_WIDTH,
		IMAGE_HEIGHT,
		0.05,   
		2,
		0.1,   
	);

	try {
		return await toPng(viewport, {
			cacheBust: true,
			pixelRatio: 2,
			width: IMAGE_WIDTH,
			height: IMAGE_HEIGHT,
			style: {
				width: `${IMAGE_WIDTH}px`,
				height: `${IMAGE_HEIGHT}px`,
				transform: `translate(${x}px, ${y}px) scale(${zoom})`,
			},
		});
	} catch (error) {
		console.error('Failed to capture full diagram', error);
		return '';
	}
}

export function useActivityExport({ postMessage, reactFlowRef }: Params) {
	const handleImageRequest = useCallback(async () => {
		try {
			const dataUrl = await captureFullDiagram(reactFlowRef);
			postMessage('diagram/imageData', { dataUrl });
		} catch (error) {
			postMessage('diagram/imageData', {
				dataUrl: null,
				error: error instanceof Error ? error.message : 'Image capture failed',
			});
		}
	}, [reactFlowRef, postMessage]);

	const savePng = useCallback(async (filename = 'diagram.png') => {
		const dataUrl = await captureFullDiagram(reactFlowRef);
		if (!dataUrl) return;
		const a = document.createElement('a');
		a.href = dataUrl;
		a.download = filename;
		a.click();
	}, [reactFlowRef]);

	return {
		handleImageRequest,
		savePng,
	};
}
