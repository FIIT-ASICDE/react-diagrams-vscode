import { VSCodePanels, VSCodePanelTab, VSCodePanelView } from '@vscode/webview-ui-toolkit/react';
import { useEffect, useState, type CSSProperties } from 'react';
import StateDiagram from '@/app@diagrams/state/StateDiagram';
import Debug from '@/app@components/Debug';
import type { Message } from '@react-diagrams/core/app@vscode';
import { vscode, type UpdatePayload } from '@/app@vscode/api';

type ChatSettingsConfig = {
	code: boolean;
	diagramJson: boolean;
	diagramMermaid: boolean;
	diagramImage: boolean;
	debug: boolean;
	allowToolCall: boolean;
	maxToolIterations: number;
	diagramImageTimeoutMs: number;
};

const DEFAULT_CHAT_SETTINGS: ChatSettingsConfig = {
	code: true,
	diagramJson: true,
	diagramMermaid: true,
	diagramImage: true,
	debug: true,
	allowToolCall: true,
	maxToolIterations: 3,
	diagramImageTimeoutMs: 15000,
};

function App() {
	const [updatePayload, setUpdatePayload] = useState<UpdatePayload>(() => (vscode.getState() as UpdatePayload) ?? {});
	const [activeTabId, setActiveTabId] = useState('diagram');
	const [settingsConfig, setSettingsConfig] = useState<ChatSettingsConfig>(DEFAULT_CHAT_SETTINGS);

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
	const resolvedActiveTabId = activeTabId;

	const onPanelsChange = (event) => {
		const nextActiveTabId = event?.currentTarget?.activeid ?? event?.target?.activeid;
		if (typeof nextActiveTabId === 'string') {
			setActiveTabId(nextActiveTabId);
		}
	};

	const onApplySettings = (value: unknown) => {
		if (!value || typeof value != 'object')
			return;

		const nextConfig = value as ChatSettingsConfig;
		setSettingsConfig(nextConfig);
		vscode.postMessage('settings/update', nextConfig);
	};

	return (
		<div className="flex h-screen flex-col overflow-hidden px-1.5 vscode-bg">
			<VSCodePanels
				className="min-h-0 flex-1 webview-panels"
				activeid={resolvedActiveTabId}
				onChange={onPanelsChange}
			>
				<VSCodePanelTab id="diagram" className="mx-2">Diagram</VSCodePanelTab>
				<VSCodePanelTab id="settings" className="mx-2">Settings</VSCodePanelTab>

				<VSCodePanelView id="diagram" className="h-full p-1">
					<StateDiagram model={model} />
				</VSCodePanelView>

				<VSCodePanelView id="settings">
					<Debug value={settingsConfig} onApply={onApplySettings} />
				</VSCodePanelView>
			</VSCodePanels>
		</div>
	);
}

export default App;