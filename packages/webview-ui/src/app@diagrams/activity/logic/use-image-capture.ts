import { useCallback } from 'react';
import { toPng } from 'html-to-image';

/**
 * Capture the visible diagram as a PNG data URL.
 *
 * Wraps html-to-image's `toPng` for the `.react-flow` element. Errors are
 * logged and resolved as empty string so callers don't have to deal with
 * rejection paths just to send "image not available" back to the host.
 */
export function useImageCapture() {
	return useCallback(async (): Promise<string> => {
		const root = document.querySelector<HTMLElement>('.react-flow');
		if (!root) return '';

		try {
			return await toPng(root, { cacheBust: true, pixelRatio: 2 });
		} catch (error) {
			console.error('Failed to capture diagram image', error);
			return '';
		}
	}, []);
}