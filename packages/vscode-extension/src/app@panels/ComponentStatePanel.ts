import { Disposable, TextDocument, Webview, WebviewPanel, window, Uri, ViewColumn, workspace } from "vscode";
import { doCommonChecksAndGetDoc, getConfigOption, getNonce, getUri, jumpToPosition, saveDiagramImage } from "../app@utils";
import { basename, extname } from "path";
import { componentStateCache, ImageCacheEntry } from "../app@utils/cache";

export class ComponentStatePanel {
	public static readonly NAME = "Component State";
	public static readonly WEBVIEW_DIR = "dist/webview";

	public static current?: ComponentStatePanel;

	private readonly panel: WebviewPanel;
	private disposables: Disposable[] = [];
	// private currentFilePath?: string;
	private refreshRequestId = 0;

	private pendingImageRequest?: Promise<ImageCacheEntry | null>;
	private pendingImageRequestResolve?: (value: ImageCacheEntry | null) => void;

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
		const [openOnSide] = getConfigOption<boolean>('state.diagram', 'openStatePanelOnTheSide');

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
		const result = doCommonChecksAndGetDoc(document);
		if (!result)
			return;

		const [useGuardsWhenPossible, config] = getConfigOption<boolean>('state.diagram', 'useGuardsWhenPossible');
		const knownStateVariableHooks = config.get<string[]>('knownStateVariableHooks', ["useState"]);
		const mergeSquashing = config.get<string[]>('mergeSquashingOptimization');

		const { rootPath, targetDocument } = result;
		return componentStateCache.update(targetDocument, { rootPath, useGuardsWhenPossible, knownStateVariableHooks, mergeSquashing }, forceUpdate);
	}

	// public static isShowingDocument(document: TextDocument) {
	// 	return ComponentStatePanel.current?.isShowingDocument(document) ?? false;
	// }

	public async refresh(document?: TextDocument, forceUpdate?) {
		const result = doCommonChecksAndGetDoc(document);
		if (!result)
			return;
		const { activeFilePath, rootPath, targetDocument } = result;

		const requestId = ++this.refreshRequestId;;

		this.panel.title = `${ComponentStatePanel.NAME} (${basename(activeFilePath)})`;

		try {
			const [useGuardsWhenPossible, config] = getConfigOption<boolean>('state.diagram', 'useGuardsWhenPossible');
			const knownStateVariableHooks = config.get<string[]>('knownStateVariableHooks', ["useState"]);
			const mergeSquashing = config.get<string[]>('mergeSquashingOptimization');

			const model = await componentStateCache.update(targetDocument, { rootPath, useGuardsWhenPossible, knownStateVariableHooks, mergeSquashing }, forceUpdate);

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
		return this.panel.webview.postMessage({ type, data });
	}

	public requestCurrentDiagramImage(saveToDisk = true) {
		if (!this.panel.visible)
			return;
		if (this.pendingImageRequest)
			return this.pendingImageRequest;

		const { promise, resolve } = Promise.withResolvers<ImageCacheEntry | null>();
		this.pendingImageRequest = promise;
		this.pendingImageRequestResolve = resolve;
		this.postMessage("requestDiagramImage", { saveToDisk });
		return this.pendingImageRequest;
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
		const config = workspace.getConfiguration('state.diagram');
		return /*html*/ `
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				<meta http-equiv="Content-Security-Policy"
					content="
						default-src 'none';
						img-src ${webview.cspSource} https: data:;
						style-src ${webview.cspSource};
						script-src 'nonce-${nonce}';
					"
				/>
				<link rel="stylesheet" type="text/css" href="${stylesUri}">
				<title>${ComponentStatePanel.NAME}</title>
				<meta name="diagram-type" content="state" />
				<script nonce="${nonce}">
					window.CONFIG = ${JSON.stringify({ 
						bgColor: config.get<string>('backgroundColor'), 
						transitionRouting: config.get<string>('transitionRouting') 
					})};
				</script>
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

	private webviewMessageListener(message: any) {
		const { type, data } = message;
		console.debug("Message received from webview:", type, data);

		switch (type) {
			case "refresh":
				void this.refresh(componentStateCache.getCurrentDocument());
				return;
			case "nodeDblClick":
				const uri = componentStateCache?.getCurrentDocument()?.uri;
				if (uri) {
					const pos = data.data.pos;
					// console.debug(pos)
					jumpToPosition(uri, pos.line - 1, pos.col - 1);
				}
				return;

			case "onDiagramImage":
				const { targetDocument } = doCommonChecksAndGetDoc(componentStateCache.getCurrentDocument()) ?? {};
				if (!targetDocument)
					return;

				saveDiagramImage(targetDocument, data, componentStateCache, data?.saveToDisk).then(this.pendingImageRequestResolve).finally(() => {
					this.pendingImageRequestResolve = undefined;
					this.pendingImageRequest = undefined;
				});
				return;
		}
	}
}