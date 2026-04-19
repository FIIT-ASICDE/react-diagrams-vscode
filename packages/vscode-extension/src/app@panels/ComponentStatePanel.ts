import { Disposable, TextDocument, Webview, WebviewPanel, window, Uri, ViewColumn, workspace } from "vscode";
import { getNonce, getUri, jumpToPosition } from "../app@utils";
import { basename, extname } from "path";
import { componentStateCache, getRootPath } from "../app@utils/cache";

export class ComponentStatePanel {
	public static readonly NAME = "Component State";
	public static readonly WEBVIEW_DIR = "dist/webview";
	private static readonly SUPPORTED_EXTENSIONS = [".js", ".jsx", ".ts", ".tsx"];
	// private static readonly modelCache = new Map<string, any>();

	public static current?: ComponentStatePanel;

	private readonly panel: WebviewPanel;
	private disposables: Disposable[] = [];
	// private currentFilePath?: string;
	private refreshRequestId = 0;

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
	public static async render(extensionUri: Uri) {
		const config = workspace.getConfiguration('state.diagram');
		const openOnSide = config.get<boolean>('openStatePanelOnTheSide', true);

		if (ComponentStatePanel.current) { // Already exists, show it
			console.debug("ComponentStatePanel already exists, showing existing panel");
			ComponentStatePanel.current.panel.reveal(openOnSide ? ViewColumn.Beside : ViewColumn.Active, true);
			ComponentStatePanel.current.refresh();
			return;
		}

		if (!ComponentStatePanel.updateCache())
			return;

		const panel = window.createWebviewPanel(
			"componentState",
			ComponentStatePanel.NAME,
			{ viewColumn: openOnSide ? ViewColumn.Beside : ViewColumn.Active, preserveFocus: true },
			{ // Extra panel configurations
				enableScripts: true,
				localResourceRoots: [Uri.joinPath(extensionUri, "out"), Uri.joinPath(extensionUri, ComponentStatePanel.WEBVIEW_DIR)],
			}
		);

		ComponentStatePanel.current = new ComponentStatePanel(panel, extensionUri);
	}

	public static updateCache(document?: TextDocument, forceUpdate?) {
		const result = ComponentStatePanel.doCommonChecksAndGet(document);
		if (!result)
			return;

		const { rootPath, targetDocument } = result;
		return componentStateCache.update(targetDocument, rootPath, forceUpdate);
	}

	// public static isShowingDocument(document: TextDocument) {
	// 	return ComponentStatePanel.current?.isShowingDocument(document) ?? false;
	// }

	public async refresh(document?: TextDocument, forceUpdate?) {
		const result = ComponentStatePanel.doCommonChecksAndGet(document);
		if (!result)
			return;
		const { activeFilePath, rootPath, targetDocument } = result;

		const requestId = ++this.refreshRequestId;;

		this.panel.title = `${ComponentStatePanel.NAME} (${basename(activeFilePath)})`;

		try {
			const model = await componentStateCache.update(targetDocument, rootPath, forceUpdate);

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
		ComponentStatePanel.current = undefined;
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
				console.debug("Refresh requested from webview");
				void this.refresh(componentStateCache.getCurrentDocument());
				return;
			case "nodeDblClick":
				const uri = componentStateCache?.getCurrentDocument()?.uri;
				if (uri) {
					const pos = data.data.pos;
					// console.debug(pos)
					jumpToPosition(uri, pos.line - 1, pos.column - 1);
				}
				return;
		}
	}
}