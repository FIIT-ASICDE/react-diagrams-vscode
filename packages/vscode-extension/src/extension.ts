import { commands, ExtensionContext, ExtensionMode, RelativePattern, Uri, window, workspace } from "vscode";
import { ComponentActivityPanel } from "./app@panels/ComponentActivityPanel";
import { ComponentStatePanel } from "./app@panels/ComponentStatePanel";
import { normalizeFilePath } from "./app@utils";
// import { registerDiagramChatParticipant } from "@/app@ai/chat/BaseChatParticipant";
import { componentStateCache } from "./app@utils/cache";

export function activate(context: ExtensionContext) {
	const showComponentStateDiagram = commands.registerCommand("vs-code-ext.componentState", () => {
		ComponentStatePanel.render(context.extensionUri);
	});

	const requestStateDiagramImage = commands.registerCommand("vs-code-ext.requestStateDiagramImage", () => {
		if (!ComponentStatePanel.current?.requestCurrentDiagramImage())
			window.showWarningMessage("Component State Panel is rquired to be opened and visible to generate the state diagram image.");
	});

	const showActivityCommand = commands.registerCommand("vs-code-ext.componentActivity", () => {
		ComponentActivityPanel.render(context.extensionUri);
	});

	const refreshCurrentPanelOnSave = workspace.onDidSaveTextDocument((document) => {
		if (!ComponentStatePanel.current) {
			return;
		}

		ComponentStatePanel.updateCache(document);

		const activeDocument = window.activeTextEditor?.document;
		if (!activeDocument)
			return;

		if (normalizeFilePath(activeDocument.uri.fsPath) != normalizeFilePath(document.uri.fsPath))
			return;

		void ComponentStatePanel.current.refresh(activeDocument);
	});

	const settingsChange = workspace.onDidChangeConfiguration(event => {
		if (event.affectsConfiguration('state.diagram')) {
			componentStateCache.clear();
		}
	});

	// const diagramChatParticipant = registerDiagramChatParticipant(context);

	const autoRestartInDev = setupAutoRestartInDevelopment(context);
	context.subscriptions.push(showComponentStateDiagram, requestStateDiagramImage, refreshCurrentPanelOnSave, showActivityCommand, /*diagramChatParticipant,*/ settingsChange, autoRestartInDev);
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