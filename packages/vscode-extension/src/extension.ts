import { commands, ExtensionContext, ExtensionMode, RelativePattern, workspace } from "vscode";
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

	const autoRestartInDev = setupAutoRestartInDevelopment(context);

	context.subscriptions.push(showComponentStateDiagram, refreshCurrentPanelOnSave, autoRestartInDev);
}

function setupAutoRestartInDevelopment(context: ExtensionContext) {
	if (context.extensionMode != ExtensionMode.Development)
		return { dispose() { } };

	const extensionDistPattern = new RelativePattern(context.extensionUri.fsPath, "dist/**/*.js");
	const watcher = workspace.createFileSystemWatcher(extensionDistPattern, true, false, true);

	let restartTimer;
	const scheduleRestart = () => {
		if (restartTimer)
			clearTimeout(restartTimer);

		restartTimer = setTimeout(() => {
			restartTimer = undefined;
			void commands.executeCommand("workbench.action.restartExtensionHost");
		}, 350);
	};

	const onChange = watcher.onDidChange(scheduleRestart);

	return {
		dispose() {
			onChange.dispose();
			watcher.dispose();
			if (restartTimer) {
				clearTimeout(restartTimer);
				restartTimer = undefined;
			}
		}
	};
}