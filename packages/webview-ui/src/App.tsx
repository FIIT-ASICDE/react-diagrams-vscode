import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { VSCodePanels, VSCodePanelTab, VSCodePanelView } from '@vscode/webview-ui-toolkit/react';
import StateDiagram from './app@diagrams/state/StateDiagram';
import Tests from './app@components/Tests';
import Debug from './app@components/Debug';
import { vscode } from './app@vscode/api';
import type { Message } from '@react-diagrams/core';

function App() {
	const [updatePayload, setUpdatePayload] = useState(vscode.getState() ?? {});
	const [activeTabId, setActiveTabId] = useState('diagram');

	useEffect(() => {
		const onMessage = (event: MessageEvent<Message>) => {
			if (event.data?.type != 'update')
				return;
			
			// console.debug(event.data.data);
			setUpdatePayload(event.data.data);
			vscode.setState(event.data.data);
		};

		window.addEventListener('message', onMessage);
		vscode.postMessage("refresh"); // rdy
		return () => window.removeEventListener('message', onMessage);
	}, []);

	const showDebugTab = useMemo(() => updatePayload?.debug !== undefined, [updatePayload]);
	const debugValue = updatePayload?.debug;
	const resolvedActiveTabId = !showDebugTab && activeTabId == 'debug' ? 'diagram' : activeTabId;

	const onPanelsChange = (event) => {
		const nextActiveTabId = event?.currentTarget?.activeid ?? event?.target?.activeid;
		if (typeof nextActiveTabId === 'string') {
			setActiveTabId(nextActiveTabId);
		}
	};

	return (
		<div className="flex h-screen flex-col overflow-hidden px-1.5 vscode-bg">
			<VSCodePanels
				className="min-h-0 flex-1 webview-panels"
				activeid={resolvedActiveTabId}
				onChange={onPanelsChange}
			>
				<VSCodePanelTab id="diagram" className="mx-2">Diagram</VSCodePanelTab>
				<VSCodePanelTab id="details" className="mx-2">Details</VSCodePanelTab>
				{/* <VSCodePanelTab id="tests" className="mx-2">Tests</VSCodePanelTab> */}
				{showDebugTab && <VSCodePanelTab id="debug" className="mx-2">Debug</VSCodePanelTab>}

				<VSCodePanelView id="diagram" className="h-full p-1">
					<StateDiagram />
				</VSCodePanelView>

				<VSCodePanelView id="details">
					<div className="p-4 text-sm leading-6 text-(--vscode-descriptionForeground)">
						<h2 className="mb-2 text-base text-(--vscode-foreground)">Details</h2>
						<p>This is a sample details tab. Add selected node metadata or component state summaries here.</p>
					</div>
				</VSCodePanelView>

				{/* <VSCodePanelView id="tests">
					<div className="p-4 text-sm leading-6 text-(--vscode-descriptionForeground)">
						<Tests />
					</div>
				</VSCodePanelView> */}

				{showDebugTab && (
					<VSCodePanelView id="debug">
						<Debug value={debugValue} />
					</VSCodePanelView>
				)}
			</VSCodePanels>
		</div>
	);
}

export default App;
