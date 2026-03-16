import * as path from "path";
import { Disposable, Webview, WebviewPanel, window, Uri, ViewColumn, workspace } from "vscode";
import { getNonce } from "../app@utils/crypto";
import { getUri } from "../app@utils/urls";
import { parseReactComponent } from "@react-diagrams/core";

export class ComponentStatePanel {
	public static readonly WEBVIEW_DIR = "webview-dist/state";

	public static currentPanel?: ComponentStatePanel;

	private readonly panel: WebviewPanel;
	private disposables: Disposable[] = [];

	/**
	 * The ComponentStatePanel class private constructor (called only from the render method).
	 *
	 * @param panel A reference to the webview panel
	 * @param extensionUri The URI of the directory containing the extension
	 */
	private constructor(panel: WebviewPanel, extensionUri: Uri) {
		this.panel = panel;

		this.panel.onDidDispose(() => this.dispose(), null, this.disposables); // when the user closes, or closed programmatically...

		this.panel.webview.html = this.getWebviewContent(this.panel.webview, extensionUri);

		this.panel.webview.onDidReceiveMessage(this.webviewMessageListener, this, this.disposables);
	}

	/**
	 * Renders the current webview panel if it exists otherwise a new webview panel
	 * will be created and displayed.
	 *
	 * @param extensionUri The URI of the directory containing the extension.
	 */
	public static render(extensionUri: Uri) {
		if (ComponentStatePanel.currentPanel) { // Already exists, show it
			ComponentStatePanel.currentPanel.panel.reveal(ViewColumn.One);
			// ComponentStatePanel.currentPanel.postMessage("test", { text: getNonce() });

			const activeEditor = window.activeTextEditor;
			if (!activeEditor) {
				window.showWarningMessage("No active editor found. Open a React component file first.");
				return;
			}
			
			const activeFilePath = activeEditor.document.uri.fsPath;
			const workspaceFolder = workspace.getWorkspaceFolder(activeEditor.document.uri);
			if (!workspaceFolder) {
				window.showWarningMessage("Could not determine workspace folder for the active file.");
				return;
			}

			const srcRootPath = Uri.joinPath(workspaceFolder.uri).fsPath;
			const relativeComponentPath = path.relative(srcRootPath, activeFilePath).replace(/\\/g, "/");

			console.log("Parsing component", relativeComponentPath);
			// console.log(analyzeReactComponent(relativeComponentPath));
			return;
		}

		const panel = window.createWebviewPanel(
			"componentState",
			"React Component State",
			ViewColumn.One,
			{ // Extra panel configurations
				enableScripts: true,
				localResourceRoots: [Uri.joinPath(extensionUri, "out"), Uri.joinPath(extensionUri, ComponentStatePanel.WEBVIEW_DIR)],
			}
		);

		ComponentStatePanel.currentPanel = new ComponentStatePanel(panel, extensionUri);
	}

	/**
	 * Cleans up and disposes of webview resources when the webview panel is closed.
	 */
	public dispose() {
		ComponentStatePanel.currentPanel = undefined;
		this.panel.dispose();

		while (this.disposables.length) {
			const disposable = this.disposables.pop();
			if (disposable) {
				disposable.dispose();
			}
		}
	}

	public postMessage(type: string, data?) {
		this.panel.webview.postMessage({ type, ...data });
	}

	/**
	 * Defines and returns the HTML that should be rendered within the webview panel.
	 *
	 * @remarks This is also the place where references to the React webview build files
	 * are created and inserted into the webview HTML.
	 *
	 * @param webview A reference to the extension webview
	 * @param extensionUri The URI of the directory containing the extension
	 * @returns A template string literal containing the HTML that should be
	 * rendered within the webview panel
	 */
	private getWebviewContent(webview: Webview, extensionUri: Uri) {
		const stylesUri = getUri(webview, extensionUri, [ComponentStatePanel.WEBVIEW_DIR, "assets", "index.css"]); // The CSS file from the React webview
		const scriptUri = getUri(webview, extensionUri, [ComponentStatePanel.WEBVIEW_DIR, "assets", "index.js"]); // The JS file from the React webview

		const nonce = getNonce();

		return /*html*/ `
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
				<link rel="stylesheet" type="text/css" href="${stylesUri}">
				<title>React Component State</title>
			</head>
			<body>
				<div id="root"></div>
				<script type="module" nonce="${nonce}" src="${scriptUri}"></script>
				<!-- <p>${stylesUri}</p> -->
				<!-- <p>${scriptUri}</p> -->
				<!-- <p>${extensionUri}</p> -->
				<!-- <p>${nonce}</p> -->
			</body>
			</html>
		`;
	}

	/**
	 * Sets up an event listener to listen for messages passed from the webview context and
	 * executes code based on the message that is recieved.
	 *
	 * @param webview A reference to the extension webview
	 * @param context A reference to the extension context
	 */
	private webviewMessageListener(message: any) {
		const type = message.type;
		const text = message.text;

		switch (type) {
			case "hello":
				window.showInformationMessage(text);
				return;

		}
	}
}