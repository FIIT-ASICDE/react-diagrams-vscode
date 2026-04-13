import { Disposable, TextDocument, Webview, WebviewPanel, window, Uri, ViewColumn, workspace } from "vscode";
import { getNonce } from "../app@utils/crypto";
import { getUri } from "../app@utils/urls";
import { normalizeFilePath } from "@react-diagrams/core";
import { basename, extname } from "path";
import { componentStateCache, getRootPath } from "../app@utils/cache";

export class ComponentStatePanel {
	public static readonly NAME = "Component State";
	public static readonly WEBVIEW_DIR = "dist/webview";
	private static readonly SUPPORTED_EXTENSIONS = [".js", ".jsx", ".ts", ".tsx"];
	// private static readonly modelCache = new Map<string, any>();

	public static currentPanel?: ComponentStatePanel;

	private readonly panel: WebviewPanel;
	private disposables: Disposable[] = [];
	// private currentFilePath?: string;
	private refreshRequestId = 0;

	private initialDocument?: TextDocument;

	/**
	 * The ComponentStatePanel class private constructor (called only from the render method).
	 *
	 * @param panel A reference to the webview panel
	 * @param extensionUri The URI of the directory containing the extension
	 */
	private constructor(panel: WebviewPanel, extensionUri: Uri, initialDocument?: TextDocument) {
		this.panel = panel;
		this.initialDocument = initialDocument;

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
			console.debug("ComponentStatePanel already exists, showing existing panel");
			ComponentStatePanel.currentPanel.panel.reveal(ViewColumn.Beside, true);
			ComponentStatePanel.refreshCurrentPanel();
			return;
		}

		const result = ComponentStatePanel.doCommonChecksAndGet();
		if (!result)
			return;

		const panel = window.createWebviewPanel(
			"componentState",
			ComponentStatePanel.NAME,
			{ viewColumn: ViewColumn.Beside, preserveFocus: true },
			{ // Extra panel configurations
				enableScripts: true,
				localResourceRoots: [Uri.joinPath(extensionUri, "out"), Uri.joinPath(extensionUri, ComponentStatePanel.WEBVIEW_DIR)],
			}
		);

		ComponentStatePanel.currentPanel = new ComponentStatePanel(panel, extensionUri, result.targetDocument);
	}

	public static async refreshCurrentPanel(document?: TextDocument) {
		await ComponentStatePanel.currentPanel?.refresh(document);
	}

	public static updateCache(document: TextDocument, forceUpdate?) {
		const result = ComponentStatePanel.doCommonChecksAndGet(document);
		if (!result)
			return;

		const { rootPath, targetDocument } = result;
		return componentStateCache.update(targetDocument, rootPath, forceUpdate);
	}

	// public static isShowingDocument(document: TextDocument) {
	// 	return ComponentStatePanel.currentPanel?.isShowingDocument(document) ?? false;
	// }

	public async refresh(document?: TextDocument, forceUpdate?) {
		const result = ComponentStatePanel.doCommonChecksAndGet(document);
		if (!result)
			return;
		const { activeFilePath, rootPath, targetDocument } = result;

		const requestId = ++this.refreshRequestId;;

		this.panel.title = `${ComponentStatePanel.NAME} (${basename(activeFilePath)})`;

		try {
			const model = componentStateCache.update(targetDocument, rootPath, forceUpdate);

			if (requestId != this.refreshRequestId) // Ignore if a newer refresh started while this parse was running.
				return console.debug("Outdated refresh result discarded");

			this.postMessage("update", { model });
			// console.debug("Sending update");
		} catch (error) {
			console.error("Error parsing React component:", error);
		}
	}

	// public isShowingDocument(document: TextDocument) {
	// 	return this.currentFilePath === normalizeFilePath(document.uri.fsPath);
	// }

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
		this.panel.webview.postMessage({ type, data });
	}

	public static doCommonChecksAndGet(doc?: TextDocument) {
		const targetDocument = doc ?? window.activeTextEditor?.document;
		if (!targetDocument) {
			window.showWarningMessage("No active editor found. Open a React component file first.");
			return;
		}

		const activeFilePath = targetDocument.uri.fsPath;
		if (!ComponentStatePanel.isSupportedFile(activeFilePath)) {
			if (!doc)
				window.showWarningMessage("Active file is not a JavaScript or TypeScript file. Open a React component file first.");
			return;
		}

		const rootPath = getRootPath(targetDocument);
		if (!rootPath) {
			window.showWarningMessage("No workspace folder found. Open the project folder first.");
			return;
		}

		return { activeFilePath, rootPath, targetDocument };
	}

	private static isSupportedFile(filePath: string) {
		return ComponentStatePanel.SUPPORTED_EXTENSIONS.includes(extname(filePath));
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
				<meta http-equiv="Content-Security-Policy"
					content="
						default-src 'none';
						img-src ${webview.cspSource} https:;
						style-src ${webview.cspSource};
						script-src 'nonce-${nonce}';
					"
				/>
				<link rel="stylesheet" type="text/css" href="${stylesUri}">
				<title>${ComponentStatePanel.NAME}</title>
				<meta name="diagram-type" content="state" />
			</head>
			<body>
				<div id="root"></div>
				<script type="module" nonce="${nonce}" src="${scriptUri}"></script>
				<!-- <p>${stylesUri}</p> -->
				<!-- <p>${scriptUri}</p> -->
				<!-- <p>${extensionUri}</p> -->
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
		const { type, data } = message;

		switch (type) {
			case "refresh":
				void this.refresh(this.initialDocument);
				this.initialDocument = undefined;
				return;

		}
	}
}