import type { CSSProperties } from 'react';
import { VSCodePanels, VSCodePanelTab, VSCodePanelView } from '@vscode/webview-ui-toolkit/react';
import StateDiagram from './app@diagrams/state/StateDiagram';
import Tests from './app@components/Tests';


function App() {
	return (
		<div className="flex h-screen flex-col overflow-hidden px-1.5 vscode-bg">
			<VSCodePanels className="min-h-0 flex-1" activeid="diagram" style={{ '--design-unit': '3.4' } as CSSProperties}>
				<VSCodePanelTab id="diagram" className="mx-2">Diagram</VSCodePanelTab>
				<VSCodePanelTab id="details" className="mx-2">Details</VSCodePanelTab>
				<VSCodePanelTab id="tests" className="mx-2">Tests</VSCodePanelTab>

				<VSCodePanelView id="diagram" className="h-full p-1">
					<StateDiagram />
				</VSCodePanelView>

				<VSCodePanelView id="details">
					<div className="p-4 text-sm leading-6 text-(--vscode-descriptionForeground)">
						<h2 className="mb-2 text-base text-(--vscode-foreground)">Details</h2>
						<p>This is a sample details tab. Add selected node metadata or component state summaries here.</p>
					</div>
				</VSCodePanelView>

				<VSCodePanelView id="tests">
					<div className="p-4 text-sm leading-6 text-(--vscode-descriptionForeground)">
						<Tests />
					</div>
				</VSCodePanelView>
			</VSCodePanels>
		</div>
	);
}

export default App;
