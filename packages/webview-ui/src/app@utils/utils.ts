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

export function getColor(text: string, options: { lightness?: number; saturation?: number; blockedHueRanges?: [number, number][] } | number = {}) {
	const { lightness = 75, saturation = 60, blockedHueRanges = [] } = typeof options == 'number' ? { lightness: options } : options;

	let h = 0;
	for (let i = 0; i < text.length; i++)
		h = (h * 31 + text.charCodeAt(i)) >>> 0;

	const hue = shiftHue(h % 360, blockedHueRanges);
	return chroma.lch(lightness, saturation, hue).hex();
}
