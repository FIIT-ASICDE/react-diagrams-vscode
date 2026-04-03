import * as path from "path";
import { Disposable, Webview, WebviewPanel, window, Uri, ViewColumn, workspace } from "vscode";
import { getNonce } from "../app@utils/crypto";
import { getUri } from "../app@utils/urls";

export class ComponentActivityPanel {
	public static readonly WEBVIEW_DIR = "webview-dist/state";

	public static currentPanel?: ComponentActivityPanel;

	private readonly panel: WebviewPanel;
	private disposables: Disposable[] = [];

	/**
	 * The ComponentActivityPanel class private constructor (called only from the render method).
	 *
	 * @param panel A reference to the webview panel
	 * @param extensionUri The URI of the directory containing the extension
	 */
	private constructor(panel: WebviewPanel, extensionUri: Uri) {
		this.panel = panel;

		this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

		this.panel.webview.html = this.getWebviewContent(this.panel.webview, extensionUri);

		this.panel.webview.onDidReceiveMessage(this.webviewMessageListener, this, this.disposables);
		this.postDiagramType();
	}

	/**
	 * Renders the current webview panel if it exists otherwise a new webview panel
	 * will be created and displayed.
	 *
	 * @param extensionUri The URI of the directory containing the extension.
	 */
	public static render(extensionUri: Uri) {
		if (ComponentActivityPanel.currentPanel) {
			ComponentActivityPanel.currentPanel.panel.reveal(ViewColumn.One);
			ComponentActivityPanel.currentPanel.postDiagramType();

			const activeEditor = window.activeTextEditor;
			if (!activeEditor) {
				window.showWarningMessage("No active editor found. Open a source file first.");
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

			console.log("Parsing activity component", relativeComponentPath);
			return;
		}

		const panel = window.createWebviewPanel(
			"componentActivity",
			"React Component Activity",
			ViewColumn.One,
			{
				enableScripts: true,
				localResourceRoots: [Uri.joinPath(extensionUri, "out"), Uri.joinPath(extensionUri, ComponentActivityPanel.WEBVIEW_DIR)],
			}
		);

		ComponentActivityPanel.currentPanel = new ComponentActivityPanel(panel, extensionUri);
	}

	/**
	 * Cleans up and disposes of webview resources when the webview panel is closed.
	 */
	public dispose() {
		ComponentActivityPanel.currentPanel = undefined;
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

	private postDiagramType() {
		this.postMessage("diagram/type", { diagramType: "activity" });
	}

	private getWebviewContent(webview: Webview, extensionUri: Uri) {
		const stylesUri = getUri(webview, extensionUri, [ComponentActivityPanel.WEBVIEW_DIR, "assets", "index.css"]);
		const scriptUri = getUri(webview, extensionUri, [ComponentActivityPanel.WEBVIEW_DIR, "assets", "index.js"]);

		const nonce = getNonce();

		return /*html*/ `
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
				<link rel="stylesheet" type="text/css" href="${stylesUri}">
				<title>React Component Activity</title>
			</head>
			<body>
				<div id="root"></div>
				<script type="module" nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>
		`;
	}

	private webviewMessageListener(message: any) {
		const type = message.type;
		const text = message.text;

		switch (type) {
			case "diagram/requestType":
				this.postDiagramType();
				return;

			case "hello":
				window.showInformationMessage(text);
				return;

			default:
				return;
		}
	}
}
