import * as path from "path";
import { Disposable, TextDocument, TextEditor, Webview, WebviewPanel, window, Uri, ViewColumn, workspace } from "vscode";
import { getNonce } from "../app@utils/crypto";
import { getUri } from "../app@utils/urls";
import { generateActivitySkeletonFromGraph, parseActivityComponent, parseActivityPreview } from "@react-diagrams/core";
import { Node, Edge } from "@xyflow/react";
export class ComponentActivityPanel {
	public static readonly WEBVIEW_DIR = "dist/webview";

	public static currentPanel?: ComponentActivityPanel;

	private readonly panel: WebviewPanel;
	private disposables: Disposable[] = [];
	// Cache the last file-backed document so we can still read code after the webview gets focus.
	private lastKnownFileDocument?: TextDocument;

	/**
	 * The ComponentActivityPanel class private constructor (called only from the render method).
	 *
	 * @param panel A reference to the webview panel
	 * @param extensionUri The URI of the directory containing the extension
	 */
	private constructor(panel: WebviewPanel, extensionUri: Uri, initialEditor?: TextEditor) {
		this.panel = panel;
		this.lastKnownFileDocument = initialEditor?.document.uri.scheme === "file" ? initialEditor.document : undefined;

		this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

		window.onDidChangeActiveTextEditor((editor) => {
			if (editor?.document.uri.scheme === "file") {
				this.lastKnownFileDocument = editor.document;
			}
		}, null, this.disposables);

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
			// Capture the editor before revealing webview; reveal can clear activeTextEditor.
			const editorBeforeReveal = window.activeTextEditor;
			if (editorBeforeReveal?.document.uri.scheme === "file") {
				ComponentActivityPanel.currentPanel.lastKnownFileDocument = editorBeforeReveal.document;
			}

			ComponentActivityPanel.currentPanel.panel.reveal(ViewColumn.One);
			ComponentActivityPanel.currentPanel.postDiagramType();
			void ComponentActivityPanel.currentPanel.publishActiveEditorCode();
			return;
		}

		const initialEditor = window.activeTextEditor;

		const panel = window.createWebviewPanel(
			"componentActivity",
			"React Component Activity",
			ViewColumn.One,
			{
				enableScripts: true,
				localResourceRoots: [Uri.joinPath(extensionUri, "out"), Uri.joinPath(extensionUri, ComponentActivityPanel.WEBVIEW_DIR)],
			}
		);

		ComponentActivityPanel.currentPanel = new ComponentActivityPanel(panel, extensionUri, initialEditor);
		void ComponentActivityPanel.currentPanel.publishActiveEditorCode();
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

	private getBestEditorForCode(): TextEditor | undefined {
		// First choice: current active file editor.
		const activeEditor = window.activeTextEditor;
		if (activeEditor && activeEditor.document.uri.scheme === "file") {
			this.lastKnownFileDocument = activeEditor.document;
			return activeEditor;
		}

		// Second choice: any visible file editor (works when focus is currently in webview).
		const visibleFileEditor = window.visibleTextEditors.find(editor => editor.document.uri.scheme === "file");
		if (visibleFileEditor) {
			this.lastKnownFileDocument = visibleFileEditor.document;
			return visibleFileEditor;
		}

		return undefined;
	}

	private async publishActiveEditorCode() {
		const activeEditor = this.getBestEditorForCode();
		const documentFromEditor = activeEditor?.document;
		const documentFromCache = this.lastKnownFileDocument;
		// Last resort: any file document currently open in the workspace session.
		const fallbackOpenFile = workspace.textDocuments.find(doc => doc.uri.scheme === "file");
		const bestDocument = documentFromEditor || documentFromCache || fallbackOpenFile;

		if (!bestDocument) {
			this.postMessage("code/error", { message: "No file editor found. Open a source file and try again." });
			return;
		}

		this.lastKnownFileDocument = bestDocument;
		const parsedComponent: { nodes: Node[]; edges: Edge[] } = await parseActivityComponent(bestDocument.getText());


		// Send raw code payload to webview; parsing is intentionally done later.
		this.postMessage("code/data", {
			nodes: parsedComponent.nodes,
			edges: parsedComponent.edges,
		});
	}

	private async generateSkeletonFromDiagram(nodes: Node[], edges: Edge[]) {
		if (!nodes?.length) {
			window.showWarningMessage("Cannot generate skeleton: the activity diagram has no nodes.");
			return;
		}

		const content = generateActivitySkeletonFromGraph(nodes, edges);
		const generatedDocument = await workspace.openTextDocument({
			language: "typescript",
			content,
		});

		await window.showTextDocument(generatedDocument, ViewColumn.Beside, true);
	}

	private async buildPreviewFromSource(sourceText: string, title: string) {
		const activeEditor = this.getBestEditorForCode();
		const rootDir = activeEditor ? path.dirname(activeEditor.document.uri.fsPath) : ".";

		try {
			const previewGraph = await parseActivityPreview(sourceText, rootDir);
			this.postMessage("code/nodePreviewData", {
				title,
				sourceText,
				nodes: previewGraph.nodes,
				edges: previewGraph.edges,
			});
		}
		catch (error) {
			const message = error instanceof Error ? error.message : "Unable to build preview graph.";
			this.postMessage("code/nodePreviewError", { message });
		}
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
				<meta name="diagram-type" content="activity" />
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

			case "code/request":
				void this.publishActiveEditorCode();
				return;

			case "code/generateSkeleton": {
				const nodes = Array.isArray(message.nodes) ? message.nodes as Node[] : [];
				const edges = Array.isArray(message.edges) ? message.edges as Edge[] : [];
				void this.generateSkeletonFromDiagram(nodes, edges);
				return;
			}

			case "code/nodePreview": {
				const sourceText = typeof message.sourceText === "string" ? message.sourceText : "";
				const title = typeof message.title === "string" && message.title.trim().length > 0 ? message.title : "Node";

				if (!sourceText.trim()) {
					this.postMessage("code/nodePreviewError", { message: "Node does not contain previewable source." });
					return;
				}

				void this.buildPreviewFromSource(sourceText, title);
				return;
			}

			

			case "hello":
				window.showInformationMessage(text);
				return;

			default:
				return;
		}
	}
}
