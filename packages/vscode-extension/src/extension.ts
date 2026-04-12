import { commands, ExtensionContext, ExtensionMode, RelativePattern, Uri, window, workspace } from "vscode";
import { ComponentActivityPanel } from "./app@panels/ComponentActivityPanel";
import { ComponentStatePanel } from "./app@panels/ComponentStatePanel";
import { normalizeFilePath } from "@react-diagrams/core";

export function activate(context: ExtensionContext) {
	const showComponentStateDiagram = commands.registerCommand("vs-code-ext.componentState", () => {
		ComponentStatePanel.render(context.extensionUri);
	});

	const showActivityCommand = commands.registerCommand("vs-code-ext.componentActivity", () => {
		ComponentActivityPanel.render(context.extensionUri);
	});

	const refreshCurrentPanelOnSave = workspace.onDidSaveTextDocument((document) => {
		if (!ComponentStatePanel.currentPanel) {
			return;
		}

		ComponentStatePanel.updateCache(document);

		const activeDocument = window.activeTextEditor?.document;
		if (!activeDocument)
			return;

		if (normalizeFilePath(activeDocument.uri.fsPath) != normalizeFilePath(document.uri.fsPath))
			return;

		void ComponentStatePanel.refreshCurrentPanel(activeDocument);
	});

	const autoRestartInDev = setupAutoRestartInDevelopment(context);

	context.subscriptions.push(showComponentStateDiagram, refreshCurrentPanelOnSave, showActivityCommand, autoRestartInDev);
}

function setupAutoRestartInDevelopment(context: ExtensionContext) {
	if (context.extensionMode != ExtensionMode.Development)
		return { dispose() { } };

	const extensionDistPattern = new RelativePattern(context.extensionUri.fsPath, "dist/**/*.js");
	const watcher = workspace.createFileSystemWatcher(extensionDistPattern, true, false, true);

	let restartTimer;
	const scheduleRestart = (what: Uri) => {
		if (what.fsPath.includes("webview"))
			return; // don't restart on webview code changes, as they are loaded dynamically

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