import { useCallback } from 'react';
import { toPng } from 'html-to-image';



// Manages image capture.
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