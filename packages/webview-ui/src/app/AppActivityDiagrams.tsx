import { useEffect, useState, type CSSProperties } from 'react';
import { VSCodePanels, VSCodePanelTab, VSCodePanelView } from '@vscode/webview-ui-toolkit/react';
import StateDiagram from '@/app@diagrams/state/StateDiagram';
import ActivityDiagram from '@/app@diagrams/activity/ActivityDiagram';
import Debug from '@/app@components/Debug';
import { vscode } from '@/app@vscode/api';
import type { ActivityExtensionToWebviewMessage } from '@react-diagrams/core/app@vscode';

type DiagramType = 'state' | 'activity';
type ChatSettingsConfig = {
	code: boolean;
	diagramJson: boolean;
	diagramMermaid: boolean;
	diagramImage: boolean;
	allowToolCall: boolean;
	maxToolIterations: number;
	diagramImageTimeoutMs: number;
};

const DEFAULT_CHAT_SETTINGS: ChatSettingsConfig = {
	code: true,
	diagramJson: true,
	diagramMermaid: true,
	diagramImage: true,
	allowToolCall: true,
	maxToolIterations: 3,
	diagramImageTimeoutMs: 15000,
};


function App() {
	const [diagramType, setDiagramType] = useState<DiagramType>('state');
	const [activeTabId, setActiveTabId] = useState('diagram');
	const [settingsConfig, setSettingsConfig] = useState<ChatSettingsConfig>(DEFAULT_CHAT_SETTINGS);

	useEffect(() => {
		const onMessage = (event: MessageEvent) => {
			const message = event.data as ActivityExtensionToWebviewMessage | { type?: string; data?: unknown };
			if (message.type === 'diagram/type' && message.data.diagramType === 'activity') {
				setDiagramType(message.data.diagramType);
			}

			if (message.type === 'settings/config' && message.data && typeof message.data === 'object') {
				setSettingsConfig(message.data as ChatSettingsConfig);
			}
			// it recieves diagram type from panel. 
			// activity diagram panel is sending 'activity', state diagram panel not sending anything for now, so it defaults to 'state'
		};

		window.addEventListener('message', onMessage);
		vscode.postMessage('diagram/requestType');
		vscode.postMessage('settings/get');

		return () => window.removeEventListener('message', onMessage);
	}, []);

	const onPanelsChange = (event) => {
		const nextActiveTabId = event?.currentTarget?.activeid ?? event?.target?.activeid;
		if (typeof nextActiveTabId == 'string') {
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
				className="min-h-0 flex-1"
				activeid={activeTabId}
				onChange={onPanelsChange}
				style={{ '--design-unit': '3.4' } as CSSProperties}
			>
				<VSCodePanelTab id="diagram" className="mx-2">{diagramType === 'activity' ? 'Activity Diagram' : 'State Diagram'}</VSCodePanelTab>
				<VSCodePanelTab id="settings" className="mx-2">Settings</VSCodePanelTab>

				<VSCodePanelView id="diagram" className="h-full p-1">
					{diagramType === 'activity' ? <ActivityDiagram /> : <StateDiagram />}
				</VSCodePanelView>

				<VSCodePanelView id="settings">
					<div className="p-4 text-sm leading-6 text-(--vscode-descriptionForeground)">
						<Debug value={settingsConfig} onApply={onApplySettings} />
					</div>
				</VSCodePanelView>
			</VSCodePanels>
		</div>
	);
}

export default App;