import { useEffect } from 'react';
import type { ActivityGraphPayload } from '@react-diagrams/core/app@vscode';
import type { ActivityMessage } from '../model/types';

type Handlers = {
	onCodeData: (payload: ActivityGraphPayload) => void;
	onCodeError: (errorMessage: string) => void;
	onImageRequest: () => void;
	onGraphRequest: () => void;
};

/**
 * Subscribe to messages from the extension host and route each known
 * message type to its handler. Splits what used to be one ~60-line
 * dispatch in ActivityDiagram.tsx into a small hook so the main file
 * stays focused on rendering.
 *
 * Unknown message types are ignored.
 */
export function useActivityMessages(handlers: Handlers): void {
	useEffect(() => {
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
