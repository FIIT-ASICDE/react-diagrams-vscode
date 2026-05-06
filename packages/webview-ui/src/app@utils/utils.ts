import chroma from 'chroma-js';
import { getViewportForBounds, type Rect, type Node, getNodesBounds } from '@xyflow/react';
import { snapdom, type SnapdomOptions } from '@zumer/snapdom';
import { getFontEmbedCSS, toPng } from 'html-to-image';

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

	if (!blockedHueRanges.some(([start, end]) => start == -1 && end == -1) && h % 100 < 7)
	{
		const minG = 50;
		const maxG = 160;
		const spread = 30;
		
		const totalSlots = Math.floor((maxG - minG) / spread) + 1;
		const slot = h % totalSlots;
		const grayValue = minG + (slot * spread);
		return chroma(grayValue, grayValue, grayValue).hex();
	}

	const hue = shiftHue(h % 360, blockedHueRanges);
	return chroma.lch(lightness, saturation, hue).hex();
}

export type DownloadImgOptions = {
	minZoom?: number;
	maxZoom?: number;
	backgroundColor?: string;
	padding?: number;
	width?: number, height?: number,
	imagePadding?: number;
	maxWidth?: number;
	maxHeight?: number;
	snapdom?: SnapdomOptions;
	htmlToImage?: { [key: string]: any };
}

type DiagramImageFormatter<T> = (diagram: HTMLElement, options: { [key: string]: any }) => Promise<T>;

let cachedFontEmbedCSS: Promise<string> | undefined;

export function getDiagramImageSize(bounds: Rect, maxWidth = 3950, maxHeight = 3950, imagePadding = 48) {
	const naturalWidth = Math.max(bounds.width + imagePadding * 2, 1);
	const naturalHeight = Math.max(bounds.height + imagePadding * 2, 1);
	const scale = Math.min(1, maxWidth / naturalWidth, maxHeight / naturalHeight);
	
	return {
		width: Math.max(1, Math.round(naturalWidth * scale)),
		height: Math.max(1, Math.round(naturalHeight * scale)),
	};
}

export async function snapdomToPngDataUrl(diagram: HTMLElement, options: { [key: string]: any }) { // compatible design with reactflow...
	const { backgroundColor, height, snapdom: snapdomOptions, style, width } = options;
	const flowRoot = diagram.closest('.react-flow') as HTMLElement | null;
	const exportRoot = document.createElement('div');
	const exportViewport = diagram.cloneNode(true) as HTMLElement;

	exportRoot.className = `${flowRoot?.className ?? 'react-flow'} diagram-image-export`;

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
			dpr: 1,
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

export async function htmlToImageToPng(diagram: HTMLElement, options: { [key: string]: any }) { // slightly optimized variant of toPng
	const { backgroundColor, height, htmlToImage, style, width } = options;
	cachedFontEmbedCSS ??= getFontEmbedCSS(diagram, {
		cacheBust: false,
		includeQueryParams: true,
		preferredFontFormat: 'woff2',
	});

	return toPng(diagram, {
		backgroundColor,
		cacheBust: false,
		canvasHeight: height,
		canvasWidth: width,
		fontEmbedCSS: await cachedFontEmbedCSS,
		height,
		includeQueryParams: true,
		pixelRatio: 1,
		preferredFontFormat: 'woff2',
		skipAutoScale: false,
		width,
		style,
		...htmlToImage,
	});
}

export async function downloadDiagramImage<T>(nodesBounds: Rect | Node[], format: DiagramImageFormatter<T> = snapdomToPngDataUrl as DiagramImageFormatter<T>, options: DownloadImgOptions = {}) {
	const { minZoom = 0.25, maxZoom = 2.25, backgroundColor = "#fdfdfe", padding = 0.02, imagePadding = 48, maxWidth = 3950, maxHeight = 3950 } = options;
	const bounds = nodesBounds instanceof Array ? getNodesBounds(nodesBounds) : nodesBounds;
	if (!options.width || !options.height) {
		const imgSize = getDiagramImageSize(bounds, maxWidth, maxHeight, imagePadding);
		options.width = imgSize.width;
		options.height = imgSize.height;
	}
	const viewport = getViewportForBounds(bounds, options.width, options.height, minZoom, maxZoom, padding);

	const diagram = document.querySelector('.react-flow__viewport') as HTMLElement;
	if (!diagram) {
		console.error('Could not find diagram element');
		return null;
	}
	return await format(diagram, {
		backgroundColor,
		width: options.width,
		height: options.height,
		htmlToImage: options.htmlToImage,
		snapdom: options.snapdom,
		style: {
			width: `${options.width}px`,
			height: `${options.height}px`,
			transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
		},
	});
}
