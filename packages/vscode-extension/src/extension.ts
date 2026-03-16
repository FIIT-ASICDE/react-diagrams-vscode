import { commands, ExtensionContext } from "vscode";
import { ComponentStatePanel } from "./app@panels/ComponentStatePanel";

export function activate(context: ExtensionContext) {
	// Create the show hello world command
	const showHelloWorldCommand = commands.registerCommand("vs-code-ext.componentState", () => {
		ComponentStatePanel.render(context.extensionUri);
	});

	// Add command to the extension context
	context.subscriptions.push(showHelloWorldCommand);
}