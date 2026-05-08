import { useEffect } from 'react';
import type { ActivityGraphPayload } from '@react-diagrams/core/app@vscode';
import type { ActivityMessage } from '../model/types';

type Handlers = {
	onCodeData: (payload: ActivityGraphPayload) => void;
	onCodeError: (errorMessage: string) => void;
	onImageRequest: () => void;
	onGraphRequest: () => void;
};
// Subscribe to extension->webview messages and dispatch typed handlers.
export function useActivityMessages(handlers: Handlers): void {
	useEffect(() => {
		// Single gateway for all runtime messages sent by the extension host.
		function listener(event: MessageEvent<ActivityMessage>) {
			const message = event.data;
			if (!message || typeof message !== 'object') return;

			const type = (message as { type?: string }).type;
			const data = (message as { data?: unknown }).data;

			switch (type) {
				case 'diagram/requestImage':
					handlers.onImageRequest();
					return;

				case 'diagram/requestGraph':
					handlers.onGraphRequest();
					return;

				case 'code/data':
					if (data && typeof data === 'object') {
						handlers.onCodeData(data as ActivityGraphPayload);
					}
					return;

				case 'code/error': {
					const messageText =
						typeof data === 'string'
							? data
							: typeof (data as { message?: unknown })?.message === 'string'
								? String((data as { message: string }).message)
								: 'Unknown error';
					handlers.onCodeError(messageText);
					return;
				}

				default:
					return;
			}
		}

		window.addEventListener('message', listener);
		return () => window.removeEventListener('message', listener);
	}, [handlers]);
}
