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
// Root view for activity/state tabs and extension-driven settings.
function App() {
	const [diagramType, setDiagramType] = useState<DiagramType>('state');
	const [activeTabId, setActiveTabId] = useState('diagram');
	const [settingsConfig, setSettingsConfig] = useState<ChatSettingsConfig>(DEFAULT_CHAT_SETTINGS);

	useEffect(() => {
		// Sync diagram mode and settings from extension messages.
		const onMessage = (event: MessageEvent) => {
			const message = event.data as ActivityExtensionToWebviewMessage | { type?: string; data?: unknown };
			if (message.type === 'diagram/type' && message.data && (message.data as { diagramType?: string }).diagramType === 'activity') {
				setDiagramType((message.data as { diagramType: DiagramType }).diagramType);
			}

			if (message.type === 'settings/config' && message.data && typeof message.data === 'object') {
				setSettingsConfig(message.data as ChatSettingsConfig);
			}
		};

		window.addEventListener('message', onMessage);
		vscode.postMessage('diagram/requestType');
		vscode.postMessage('settings/get');

		return () => window.removeEventListener('message', onMessage);
	}, []);

	// Keep selected VS Code tab in React state.
	const onPanelsChange = (event) => {
		const nextActiveTabId = event?.currentTarget?.activeid ?? event?.target?.activeid;
		if (typeof nextActiveTabId == 'string') {
			setActiveTabId(nextActiveTabId);
		}
	};

	// Persist settings in both webview state and extension workspace config.
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