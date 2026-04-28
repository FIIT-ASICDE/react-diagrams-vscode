import { useCallback } from 'react';
import { useImageCapture } from '../logic/use-image-capture';

type Params = {
	postMessage: (type: string, data?: unknown) => void;
};

export function useActivityExport({ postMessage }: Params) {
	const captureImage = useImageCapture();

	const handleImageRequest = useCallback(async () => {
		try {
			const dataUrl = await captureImage();
			postMessage('diagram/imageData', { dataUrl });
		} catch (error) {
			postMessage('diagram/imageData', {
				dataUrl: null,
				error: error instanceof Error ? error.message : 'Image capture failed',
			});
		}
	}, [captureImage, postMessage]);

	return {
		handleImageRequest,
	};
}
