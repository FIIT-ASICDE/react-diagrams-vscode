import { useEffect, useState } from 'react';
import StateDiagram from '@/app@diagrams/state/StateDiagram';
import type { Message } from '@react-diagrams/core/app@vscode';
import { vscode, type UpdatePayload } from '@/app@vscode/api';

function AppStateDiagrams() {
	const [updatePayload, setUpdatePayload] = useState<UpdatePayload>(() => (vscode.getState() as UpdatePayload) ?? {});

	useEffect(() => {
		const onMessage = (event: MessageEvent<Message<UpdatePayload>>) => {
			if (event.data?.type != 'update')
			{
				if (event.data?.type === 'settings/config' && event.data.data && typeof event.data.data === 'object') {
					setSettingsConfig(event.data.data as ChatSettingsConfig);
				}
				return;
			}

			const nextPayload = event.data.data ?? {};
			setUpdatePayload(nextPayload);
			vscode.setState(nextPayload);
		};

		window.addEventListener('message', onMessage);
		vscode.postMessage("refresh"); // rdy
		vscode.postMessage('settings/get');
		return () => window.removeEventListener('message', onMessage);
	}, []);
	const model = updatePayload?.model;

	const onApplySettings = (value: unknown) => {
		if (!value || typeof value != 'object')
			return;

		const nextConfig = value as ChatSettingsConfig;
		setSettingsConfig(nextConfig);
		vscode.postMessage('settings/update', nextConfig);
	};

	return (
		<div className="flex h-screen flex-col overflow-hidden px-1.5 vscode-bg">
			<div className="min-h-0 flex-1 py-px">
				<StateDiagram model={model} />
			</div>
		</div>
	);
}

export default AppStateDiagrams;