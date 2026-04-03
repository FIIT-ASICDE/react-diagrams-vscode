import { commands, ExtensionContext, ExtensionMode, RelativePattern, workspace } from "vscode";
import { ComponentActivityPanel } from "./app@panels/ComponentActivityPanel";
import { ComponentStatePanel } from "./app@panels/ComponentStatePanel";

export function activate(context: ExtensionContext) {
	const showStateCommand = commands.registerCommand("vs-code-ext.componentState", () => {
		ComponentStatePanel.render(context.extensionUri);
	});

	const showActivityCommand = commands.registerCommand("vs-code-ext.componentActivity", () => {
		ComponentActivityPanel.render(context.extensionUri);
	});

	// Add command to the extension context
	const autoRestartInDev = setupAutoRestartInDevelopment(context);

	context.subscriptions.push(showStateCommand, showActivityCommand, autoRestartInDev);
}

function setupAutoRestartInDevelopment(context: ExtensionContext) {
	if (context.extensionMode !== ExtensionMode.Development)
		return { dispose() { } };

	const extensionDistPattern = new RelativePattern(context.extensionUri.fsPath, "dist/**/*.js");
	const watcher = workspace.createFileSystemWatcher(extensionDistPattern, true, false, true);

	let restartTimer: NodeJS.Timeout | undefined;
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