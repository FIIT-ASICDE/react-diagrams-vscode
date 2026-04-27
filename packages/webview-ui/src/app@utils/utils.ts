import chroma from 'chroma-js';
import { getViewportForBounds, type Rect, type Node, getNodesBounds } from '@xyflow/react';
import { snapdom, type SnapdomOptions } from '@zumer/snapdom';

function isHueBlocked(hue, blockedRanges) {
	return blockedRanges.some(([start, end]) => start <= end ? hue >= start && hue <= end : hue >= start || hue <= end);
}

export function shiftHue(hue, blockedRanges) {
	let newHue = hue;

	while (isHueBlocked(newHue, blockedRanges)) 
		newHue = (newHue + 10) % 360;

	return newHue;
}

export function getColor(forWhat?, options: number | { lightness?: number; saturation?: number; blockedHueRanges?: [number, number][] } = {}) {
	const { lightness = 75, saturation = 60, blockedHueRanges = [] } = typeof options == 'number' ? { lightness: options } : options;
	const txt = String(forWhat ?? '');

	let h = 0;
	for (let i = 0; i < txt.length; i++)
		h = (h * 31 + txt.charCodeAt(i)) >>> 0;

	const hue = shiftHue(h % 360, blockedHueRanges);
	return chroma.lch(lightness, saturation, hue).hex();
}

type DownloadImgOptions = {
	minZoom?: number;
	maxZoom?: number;
	backgroundColor?: string;
	padding?: number;
	snapdom?: SnapdomOptions;
}

type DiagramImageFormatter<T> = (diagram: HTMLElement, options: { [key: string]: any }) => Promise<T>;

export async function snapdomToPngDataUrl(diagram: HTMLElement, options: { [key: string]: any }) { // compatible design with reactflow...
	const { backgroundColor, height, snapdom: snapdomOptions, style, width } = options;
	const flowRoot = diagram.closest('.react-flow') as HTMLElement | null;
	const exportRoot = document.createElement('div');
	const exportViewport = diagram.cloneNode(true) as HTMLElement;

	exportRoot.className = flowRoot?.className ?? 'react-flow';

	Object.assign(exportRoot.style, { backgroundColor, height: `${height}px`, width: `${width}px`, position: 'fixed', left: '0', top: '0', overflow: 'hidden', zIndex: '-1' });

	if (flowRoot) { // edges...
		const flowStyle = getComputedStyle(flowRoot);
		for (const property of flowStyle) {
			if (property.startsWith('--xy-'))
				exportRoot.style.setProperty(property, flowStyle.getPropertyValue(property));
		}
	}

	Object.assign(exportViewport.style, { ...style, left: '0', top: '0', position: 'absolute', transformOrigin: '0 0' });

	exportRoot.appendChild(exportViewport);
	document.body.appendChild(exportRoot);

	try {
		const image = await snapdom.toPng(exportRoot, {
			backgroundColor,
			cache: 'full',
			embedFonts: false,
			fast: true,
			height,
			width,
			...snapdomOptions,
		});

		return image.src;
	} finally {
		exportRoot.remove();
	}
}

export async function downloadDiagramImage<T>(nodesBounds: Rect | Node[], format: DiagramImageFormatter<T> = snapdomToPngDataUrl as DiagramImageFormatter<T>, width = 1920, height = 1080, options: DownloadImgOptions = {}) {
	const { minZoom = 0.5, maxZoom = 1.5, backgroundColor = "#fdfdfe", padding = 0.02 } = options;
	const viewport = getViewportForBounds(nodesBounds instanceof Array ? getNodesBounds(nodesBounds) : nodesBounds, width, height, minZoom, maxZoom, padding);

	const diagram = document.querySelector('.react-flow__viewport') as HTMLElement;
	if (!diagram) {
		console.error('Could not find diagram element');
		return null;
	}
	return await format(diagram, {
		backgroundColor,
		width,
		height,
		snapdom: options.snapdom,
		style: {
			width: `${width}px`,
			height: `${height}px`,
			transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
		},
	});
}

