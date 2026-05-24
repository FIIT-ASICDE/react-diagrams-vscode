import { commands, ExtensionContext, ExtensionMode, LanguageModelChatMessage, LanguageModelDataPart, LanguageModelTextPart, lm, RelativePattern, Uri, window, workspace } from "vscode";
import { ComponentActivityPanel } from "./app@panels/ComponentActivityPanel";
import { ComponentStatePanel } from "./app@panels/ComponentStatePanel";
import { getConfigOption, normalizeFilePath } from "./app@utils";
// import { registerDiagramChatParticipant } from "@/app@ai/chat/BaseChatParticipant";
import { componentStateCache } from "./app@utils/cache";
import StateDiagramParticipant from "./app@ai/chat/state-diagrams/StateDiagramParticipant";
import GetCurrentStateDiagramTool from "./app@ai/chat/state-diagrams/tools/GetCurrentStateDiagramTool";
import GetCurrentStateDiagramImageTool from "./app@ai/chat/state-diagrams/tools/GetCurrentStateDiagramImageTool";
import createStateDiagramAgent from "./app@ai/chat/state-diagrams/agents/state-diagram.agent";

export function activate(context: ExtensionContext) {
	const showComponentStateDiagram = commands.registerCommand("react-diagrams.componentState", () => {
		ComponentStatePanel.render(context.extensionUri);
	});
	
	const requestStateDiagramImage = commands.registerCommand("react-diagrams.requestStateDiagramImage", () => {
		if (!ComponentStatePanel.current?.requestCurrentDiagramImage())
			window.showWarningMessage("Component State Panel is rquired to be opened and visible to generate the state diagram image.");
	});

	const showActivityCommand = commands.registerCommand("react-diagrams.componentActivity", () => {
		ComponentActivityPanel.render(context.extensionUri);
	});

	const refreshStatePanelOnSave = workspace.onDidSaveTextDocument((document) => {
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
	const stateDiagramChatParticipant = new StateDiagramParticipant("react-diagrams.state-diagram");
	const stateDiagramChatParticipantReg = stateDiagramChatParticipant.register(context);

	const stateDiagramTools = [
		lm.registerTool("stateDiagram_getCurrentDiagram", new GetCurrentStateDiagramTool()),
		lm.registerTool("stateDiagram_getCurrentImage", new GetCurrentStateDiagramImageTool())
	];

	const installStateDiagramAgent = commands.registerCommand("react-diagrams.installStateDiagramAgent", async () => {
		await createStateDiagramAgent();
	});

	const autoRestartInDev = setupAutoRestartInDevelopment(context);
	context.subscriptions.push(showComponentStateDiagram, requestStateDiagramImage, refreshStatePanelOnSave, stateDiagramChatParticipantReg, ...stateDiagramTools, installStateDiagramAgent, showActivityCommand, settingsChange, autoRestartInDev);
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