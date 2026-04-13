import chroma from 'chroma-js';

function isHueBlocked(hue, blockedRanges) {
	return blockedRanges.some(([start, end]) => start <= end ? hue >= start && hue <= end : hue >= start || hue <= end);
}

export function shiftHue(hue, blockedRanges) {
	let newHue = hue;

	while (isHueBlocked(newHue, blockedRanges)) 
		newHue = (newHue + 10) % 360;

	return newHue;
}

export function getColor(text, options: { depth?: number; saturation?: number; blockedHueRanges?: [number, number][] } = {}) {
	const { depth = 3, saturation = 60, blockedHueRanges = [] } = options;

	let h = 0;
	for (let i = 0; i < text.length; i++) {
		h = (h * 31 + text.charCodeAt(i)) >>> 0;
	}

	const hue = shiftHue(h % 360, blockedHueRanges);
	const lightness = Math.min(35 + depth * 12, 85);
	return chroma.lch(lightness, saturation, hue).hex();
}
