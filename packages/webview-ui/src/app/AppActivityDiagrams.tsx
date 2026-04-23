import { useEffect, useState, type CSSProperties } from 'react';
import { VSCodePanels, VSCodePanelTab, VSCodePanelView } from '@vscode/webview-ui-toolkit/react';
import StateDiagram from '@/app@diagrams/state/StateDiagram';
import ActivityDiagram from '@/app@diagrams/activity/ActivityDiagram';
import { vscode } from '@/app@vscode/api';

type DiagramType = 'state' | 'activity';


function App() {
	const [diagramType, setDiagramType] = useState<DiagramType>('state');

	useEffect(() => {
		const onMessage = (event: MessageEvent) => {
			const message = event.data as { type?: string; diagramType?: DiagramType };
			if (message.type === 'diagram/type' && (message.diagramType === 'state' || message.diagramType === 'activity')) {
				setDiagramType(message.diagramType);
			}
			// it recieves diagram type from panel. 
			// activity diagram panel is sending 'activity', state diagram panel not sending anything for now, so it defaults to 'state'
		};

		window.addEventListener('message', onMessage);
		vscode.postMessage('diagram/requestType');

		return () => window.removeEventListener('message', onMessage);
	}, []);

	return (
		<div className="flex h-screen flex-col overflow-hidden px-1.5 vscode-bg">
			<VSCodePanels className="min-h-0 flex-1" activeid="diagram" style={{ '--design-unit': '3.4' } as CSSProperties}>
				<VSCodePanelTab id="diagram" className="mx-2">{diagramType === 'activity' ? 'Activity Diagram' : 'State Diagram'}</VSCodePanelTab>
				<VSCodePanelTab id="details" className="mx-2">Details</VSCodePanelTab>
				<VSCodePanelTab id="tests" className="mx-2">Tests</VSCodePanelTab>

				<VSCodePanelView id="diagram" className="h-full p-1">
					{diagramType === 'activity' ? <ActivityDiagram /> : <StateDiagram />}
				</VSCodePanelView>

				<VSCodePanelView id="details">
					<div className="p-4 text-sm leading-6 text-(--vscode-descriptionForeground)">
						<h2 className="mb-2 text-base text-(--vscode-foreground)">Details</h2>
						<p>This is a sample details tab. Add selected node metadata or component state summaries here.</p>
					</div>
				</VSCodePanelView>
			</VSCodePanels>
		</div>
	);
}

export default App;