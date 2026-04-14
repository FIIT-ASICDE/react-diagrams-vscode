import * as path from "path";
import { Disposable, TextDocument, TextEditor, Webview, WebviewPanel, window, Uri, ViewColumn, workspace } from "vscode";
import { getNonce } from "../../app@utils/crypto";
import { getUri } from "../../app@utils/urls";
import { convertDiagramToCode, parseActivityComponent, parseActivityPreview } from "@react-diagrams/core";
import type {
	ActivityExtensionToWebviewMessage,
	ActivityGraphPayload,
	ActivityNodePreviewRequestPayload,
} from "@react-diagrams/core/app@vscode";
import { isActivityWebviewToExtensionMessage } from "@react-diagrams/core/app@vscode";
import { Node, Edge } from "@xyflow/react";

type ActivityGraph = {
	nodes: Node[];
	edges: Edge[];
};

function isVisibleGraphMessage(message: unknown): message is { type: "diagram/visibleGraph"; data: ActivityGraphPayload } {
	if (!message || typeof message !== "object")
		return false;

	const maybeType = (message as { type?: unknown }).type;
	return maybeType === "diagram/visibleGraph";
}

export class ComponentActivityPanel {
	public static readonly WEBVIEW_DIR = "dist/webview";

	public static currentPanel?: ComponentActivityPanel;

	private readonly panel: WebviewPanel;
	private disposables: Disposable[] = [];
	// Cache the last file-backed document so we can still read code after the webview gets focus.
	private lastKnownFileDocument?: TextDocument;
	private lastKnownActivityGraph?: ActivityGraph;
	private lastVisibleActivityGraph?: ActivityGraph;

	public static getCurrentActivityGraph(): ActivityGraph | undefined {
		const current = ComponentActivityPanel.currentPanel?.lastKnownActivityGraph;
		if (!current)
			return undefined;

		return {
			nodes: [...current.nodes],
			edges: [...current.edges],
		};
	}

	public static getCurrentVisibleActivityGraph(): ActivityGraph | undefined {
		const current = ComponentActivityPanel.currentPanel?.lastVisibleActivityGraph;
		if (!current)
			return undefined;

		return {
			nodes: [...current.nodes],
			edges: [...current.edges],
		};
	}

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

	public postMessage(message: ActivityExtensionToWebviewMessage) {
		this.panel.webview.postMessage(message);
	}

	private postDiagramType() {
		this.postMessage({ type: "diagram/type", data: { diagramType: "activity" } });
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
			this.postMessage({
				type: "code/error",
				data: { message: "No file editor found. Open a source file and try again." },
			});
			return;
		}

		this.lastKnownFileDocument = bestDocument;
		const parsedComponent: { nodes: Node[]; edges: Edge[] } = await parseActivityComponent(bestDocument.getText());
		this.lastKnownActivityGraph = {
			nodes: parsedComponent.nodes,
			edges: parsedComponent.edges,
		};


		// Send raw code payload to webview; parsing is intentionally done later.
		this.postMessage({
			type: "code/data",
			data: {
				nodes: parsedComponent.nodes,
				edges: parsedComponent.edges,
			},
		});
	}

	private async generateSkeletonFromDiagram(nodes: Node[], edges: Edge[]) {
		if (!nodes?.length) {
			window.showWarningMessage("Cannot generate skeleton: the activity diagram has no nodes.");
			return;
		}

		const content = convertDiagramToCode(nodes, edges);
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
			this.postMessage({
				type: "code/nodePreviewData",
				data: {
					title,
					sourceText,
					nodes: previewGraph.nodes,
					edges: previewGraph.edges,
				},
			});
		}
		catch (error) {
			const message = error instanceof Error ? error.message : "Unable to build preview graph.";
			const lines = sourceText.split(/\r?\n/);
			const longestLineLength = lines.reduce((max, line) => Math.max(max, line.length), 0);
			const previewWidth = Math.min(1100, Math.max(420, longestLineLength * 7 + 60));
			const previewHeight = Math.min(720, Math.max(220, lines.length * 20 + 60));

			this.postMessage({
				type: "code/nodePreviewData",
				data: {
					title: `${title} (fallback)`,
					sourceText: `${message}\n\n${sourceText}`,
					nodes: [
						{
							id: `preview-fallback-${Date.now()}`,
							type: "textPreview",
							position: { x: 0, y: 0 },
							draggable: true,
							data: {
								label: `${message}\n\n${sourceText}`,
								previewWidth,
								previewHeight,
							},
						},
					],
					edges: [],
				},
			});
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

	private webviewMessageListener(message: unknown) {
		if (isVisibleGraphMessage(message)) {
			const payload = message.data as ActivityGraphPayload;
			const nodes = Array.isArray(payload.nodes) ? payload.nodes as Node[] : [];
			const edges = Array.isArray(payload.edges) ? payload.edges as Edge[] : [];
			this.lastVisibleActivityGraph = { nodes, edges };
			return;
		}

		if (!isActivityWebviewToExtensionMessage(message))
			return;

		const type = message.type;

		switch (type) {
			case "diagram/requestType":
				this.postDiagramType();
				return;

			case "code/request":
				void this.publishActiveEditorCode();
				return;

			case "code/generateSkeleton": {
				const payload = message.data as ActivityGraphPayload;
				const nodes = Array.isArray(payload.nodes) ? payload.nodes as Node[] : [];
				const edges = Array.isArray(payload.edges) ? payload.edges as Edge[] : [];
				this.lastKnownActivityGraph = { nodes, edges };
				void this.generateSkeletonFromDiagram(nodes, edges);
				return;
			}

			case "code/nodePreview": {
				const payload = message.data as ActivityNodePreviewRequestPayload;
				const sourceText = typeof payload.sourceText === "string" ? payload.sourceText : "";
				const title = typeof payload.title === "string" && payload.title.trim().length > 0 ? payload.title : "Node";

				if (!sourceText.trim()) {
					this.postMessage({
						type: "code/nodePreviewData",
						data: {
							title: `${title} (fallback)`,
							sourceText: "Node does not contain previewable source.",
							nodes: [
								{
									id: `preview-empty-${Date.now()}`,
									type: "textPreview",
									position: { x: 0, y: 0 },
									draggable: true,
									data: {
										label: "Node does not contain previewable source.",
										previewWidth: 520,
										previewHeight: 240,
									},
								},
							],
							edges: [],
						},
					});
					return;
				}

				void this.buildPreviewFromSource(sourceText, title);
				return;
			}

			default:
				return;
		}
	}
}
