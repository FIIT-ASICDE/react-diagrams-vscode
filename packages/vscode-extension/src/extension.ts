import { commands, ExtensionContext, workspace } from "vscode";
import { ComponentStatePanel } from "./app@panels/ComponentStatePanel";

export function activate(context: ExtensionContext) {
	const showComponentStateDiagram = commands.registerCommand("vs-code-ext.componentState", () => {
		ComponentStatePanel.render(context.extensionUri);
	});

	const refreshCurrentPanelOnSave = workspace.onDidSaveTextDocument((document) => {
		if (!ComponentStatePanel.currentPanel) {
			return;
		}

		void ComponentStatePanel.refreshCurrentPanel(document);
	});

	context.subscriptions.push(showComponentStateDiagram, refreshCurrentPanelOnSave);
}