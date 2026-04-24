import * as path from "path";
import {
	CancellationTokenSource,
	Disposable,
	Range,
	TextDocument,
	TextEditor,
	Webview,
	WebviewPanel,
	window,
	Uri,
	ViewColumn,
	workspace,
} from "vscode";
import { getNonce } from "../app@utils/crypto";
import { getUri } from "../app@utils/urls";
import { convertDiagramToCode, parseActivityComponent } from "@react-diagrams/core";
import type {
	ActivityExtensionToWebviewMessage,
	ActivityGraphPayload,
	ActivityNodePreviewRequestPayload,
} from "@react-diagrams/core/app@vscode";
import { isActivityWebviewToExtensionMessage } from "@react-diagrams/core/app@vscode";
import { Node, Edge } from "@xyflow/react";
import type { DiagramContext } from "../chat/types";
import * as ts from "typescript";

type ActivityGraph = {
	nodes: Node[];
	edges: Edge[];
};

/**
 * The source of the currently displayed diagram.
 * - `document`: diagram is derived from an open text document and follows its edits.
 * - `snippet`: diagram comes from an ad-hoc source text (AI, node preview). Editor edits do NOT overwrite it.
 * - `none`: nothing is shown yet.
 */
type DiagramSource =
	| { kind: "document"; uri: Uri }
	| { kind: "snippet"; text: string; sourceFile?: string }
	| { kind: "none" };

/**
 * What the panel should do once the webview signals it is ready.
 * This avoids race conditions when the webview boots while an AI-provided
 * snippet is already in flight.
 */
type PendingIntent =
	| { kind: "followActiveEditor" }
	| { kind: "showSnippet"; text: string; sourceFile?: string }
	| { kind: "none" };

function isVisibleGraphMessage(
	message: unknown
): message is { type: "diagram/visibleGraph"; data: ActivityGraphPayload } {
	return !!message && typeof message === "object" && (message as { type?: unknown }).type === "diagram/visibleGraph";
}

function isGraphSnapshotMessage(
	message: unknown
): message is { type: "diagram/graphSnapshot"; data: ActivityGraphPayload } {
	return !!message && typeof message === "object" && (message as { type?: unknown }).type === "diagram/graphSnapshot";
}

function isWebviewReadyMessage(message: unknown): message is { type: "webview/ready" } {
	return !!message && typeof message === "object" && (message as { type?: unknown }).type === "webview/ready";
}

function isDiagramImageMessage(
	message: unknown
): message is { type: "diagram/imageData"; data: { dataUrl?: string; error?: string } } {
	return !!message && typeof message === "object" && (message as { type?: unknown }).type === "diagram/imageData";
}

export class ComponentActivityPanel {
	public static readonly WEBVIEW_DIR = "dist/webview";
	public static currentPanel?: ComponentActivityPanel;

	private readonly panel: WebviewPanel;
	private readonly disposables: Disposable[] = [];

	private diagramSource: DiagramSource = { kind: "none" };
	private pendingIntent: PendingIntent = { kind: "followActiveEditor" };

	private lastKnownActivityGraph?: ActivityGraph;
	private lastVisibleActivityGraph?: ActivityGraph;
	private lastDiagramImageDataUrl?: string;

	private pendingImageRequest?: {
		resolve: (dataUrl?: string) => void;
		timeout: ReturnType<typeof setTimeout>;
	};

	private pendingGraphRequest?: {
		resolve: (graph?: ActivityGraph) => void;
		timeout: ReturnType<typeof setTimeout>;
	};

	private isWebviewReady = false;
	private readyWaiters: Array<() => void> = [];

	// ───────────────────────── Public static API ─────────────────────────

	public static getCurrentActivityGraph(): ActivityGraph | undefined {
		const current = ComponentActivityPanel.currentPanel?.lastKnownActivityGraph;
		if (!current) {
			return undefined;
		}
		return { nodes: [...current.nodes], edges: [...current.edges] };
	}

	public static getCurrentVisibleActivityGraph(): ActivityGraph | undefined {
		const current = ComponentActivityPanel.currentPanel?.lastVisibleActivityGraph;
		if (!current) {
			return undefined;
		}
		return { nodes: [...current.nodes], edges: [...current.edges] };
	}

	public static getCurrentDiagramImageDataUrl(): string | undefined {
		return ComponentActivityPanel.currentPanel?.lastDiagramImageDataUrl;
	}

	public static render(extensionUri: Uri) {
		const initialDocument = ComponentActivityPanel.getPreferredDocumentStatic();

		if (ComponentActivityPanel.currentPanel) {
			const existing = ComponentActivityPanel.currentPanel;
			existing.pendingIntent = { kind: "followActiveEditor" };

			const doc = existing.toSupportedDocument(initialDocument);
			if (doc) {
				existing.diagramSource = { kind: "document", uri: doc.uri };
			}

			existing.panel.reveal(ViewColumn.One);
			existing.postDiagramType();

			if (existing.isWebviewReady) {
				void existing.publishCurrentDocument();
			}
			return;
		}

		const panel = window.createWebviewPanel(
			"componentActivity",
			"React Component Activity",
			ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [
					Uri.joinPath(extensionUri, "out"),
					Uri.joinPath(extensionUri, ComponentActivityPanel.WEBVIEW_DIR),
				],
			}
		);

		ComponentActivityPanel.currentPanel = new ComponentActivityPanel(panel, extensionUri, initialDocument);
	}

	public static async showDiagramFromSourceText(
		extensionUri: Uri,
		sourceText: string,
		sourceFile?: string
	): Promise<void> {
		// 1) Make sure the panel exists. If we are creating it, pre-set the intent
		//    BEFORE construction so the first `webview/ready` handles the snippet
		//    instead of publishing the active editor.
		if (!ComponentActivityPanel.currentPanel) {
			ComponentActivityPanel.render(extensionUri);
		}

		const panel = ComponentActivityPanel.currentPanel;
		if (!panel) {
			throw new Error("Activity panel could not be created.");
		}

		panel.diagramSource = { kind: "snippet", text: sourceText, sourceFile };
		panel.pendingIntent = { kind: "showSnippet", text: sourceText, sourceFile };

		panel.panel.reveal(ViewColumn.One);

		// 2) If the webview is already up, run the intent immediately.
		//    Otherwise onWebviewReady() will run it when `webview/ready` arrives.
		if (panel.isWebviewReady) {
			await panel.runPendingIntent();
		}
	}

	// ───────────────────────── Construction / disposal ─────────────────────────

	private constructor(panel: WebviewPanel, extensionUri: Uri, initialDocument?: TextDocument) {
		this.panel = panel;

		const initialDoc = this.toSupportedDocument(initialDocument) ?? this.getPreferredDocument();
		if (initialDoc) {
			this.diagramSource = { kind: "document", uri: initialDoc.uri };
		}

		// NOTE: pendingIntent is left at its default `followActiveEditor`.
		// showDiagramFromSourceText() may override it before the webview boots.

		this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
		this.panel.webview.onDidReceiveMessage(this.webviewMessageListener, this, this.disposables);
		this.panel.webview.html = this.getWebviewContent(this.panel.webview, extensionUri);

		window.onDidChangeActiveTextEditor(
			(editor) => this.handleActiveEditorChanged(editor),
			null,
			this.disposables
		);

		workspace.onDidChangeTextDocument(
			(event) => this.handleDocumentChanged(event.document),
			null,
			this.disposables
		);
	}

	public dispose() {
		ComponentActivityPanel.currentPanel = undefined;
		this.isWebviewReady = false;
		this.readyWaiters = [];

		if (this.pendingImageRequest) {
			clearTimeout(this.pendingImageRequest.timeout);
			this.pendingImageRequest.resolve(undefined);
			this.pendingImageRequest = undefined;
		}

		if (this.pendingGraphRequest) {
			clearTimeout(this.pendingGraphRequest.timeout);
			this.pendingGraphRequest.resolve(undefined);
			this.pendingGraphRequest = undefined;
		}

		this.lastDiagramImageDataUrl = undefined;
		this.pendingIntent = { kind: "none" };
		this.diagramSource = { kind: "none" };

		this.panel.dispose();

		while (this.disposables.length) {
			const disposable = this.disposables.pop();
			disposable?.dispose();
		}
	}

	// ───────────────────────── Outbound messages ─────────────────────────

	public postMessage(message: ActivityExtensionToWebviewMessage) {
		void this.panel.webview.postMessage(message);
	}

	public requestDiagramImage() {
		this.postMessage({
			type: "diagram/requestImage",
			data: {},
		});
	}

	public async requestDiagramImageDataUrl(timeoutMs = 8000): Promise<string | undefined> {
		await this.waitUntilReady();

		if (this.pendingImageRequest) {
			clearTimeout(this.pendingImageRequest.timeout);
			this.pendingImageRequest.resolve(undefined);
			this.pendingImageRequest = undefined;
		}

		this.lastDiagramImageDataUrl = undefined;

		return new Promise<string | undefined>((resolve) => {
			const timeout = setTimeout(() => {
				const pending = this.pendingImageRequest;
				this.pendingImageRequest = undefined;
				(pending?.resolve ?? resolve)(this.lastDiagramImageDataUrl);
			}, timeoutMs);

			this.pendingImageRequest = { resolve, timeout };
			this.requestDiagramImage();
		});
	}

	/**
	 * Ask the webview for its current in-memory graph (possibly with unsaved edits)
	 * and refresh `lastVisibleActivityGraph`. Useful right before feeding the graph
	 * to the AI model.
	 */
	public async refreshVisibleGraph(timeoutMs = 2000): Promise<ActivityGraph | undefined> {
		if (!this.isWebviewReady) {
			return this.lastVisibleActivityGraph;
		}

		if (this.pendingGraphRequest) {
			clearTimeout(this.pendingGraphRequest.timeout);
			this.pendingGraphRequest.resolve(undefined);
			this.pendingGraphRequest = undefined;
		}

		return new Promise<ActivityGraph | undefined>((resolve) => {
			const timeout = setTimeout(() => {
				const pending = this.pendingGraphRequest;
				this.pendingGraphRequest = undefined;
				(pending?.resolve ?? resolve)(this.lastVisibleActivityGraph);
			}, timeoutMs);

			this.pendingGraphRequest = { resolve, timeout };
			this.postMessage({
				type: "diagram/requestGraph",
				data: {},
			} as unknown as ActivityExtensionToWebviewMessage);
		});
	}

	// ───────────────────────── Ready handling ─────────────────────────

	private waitUntilReady(): Promise<void> {
		if (this.isWebviewReady) {
			return Promise.resolve();
		}
		return new Promise<void>((resolve) => {
			this.readyWaiters.push(resolve);
		});
	}

	private async onWebviewReady() {
		if (this.isWebviewReady) {
			return;
		}
		this.isWebviewReady = true;

		// Always tell the webview what kind of diagram it is rendering.
		this.postDiagramType();

		// Drain ready waiters FIRST so any code awaiting readiness can schedule work.
		const waiters = this.readyWaiters;
		this.readyWaiters = [];
		for (const w of waiters) {
			w();
		}

		// Then run whatever the panel was asked to show initially.
		await this.runPendingIntent();
	}

	private async runPendingIntent() {
		const intent = this.pendingIntent;
		this.pendingIntent = { kind: "none" };

		switch (intent.kind) {
			case "followActiveEditor":
				await this.publishCurrentDocument();
				return;

			case "showSnippet":
				await this.replaceDiagramFromSource(intent.text, intent.sourceFile);
				return;

			case "none":
			default:
				return;
		}
	}

	// ───────────────────────── Document tracking ─────────────────────────

	private static getPreferredDocumentStatic(): TextDocument | undefined {
		const active = window.activeTextEditor?.document;
		if (active && active.uri.scheme === "file") {
			return active;
		}
		const visible = window.visibleTextEditors.find((editor) => editor.document.uri.scheme === "file");
		return visible?.document;
	}

	private getPreferredDocument(): TextDocument | undefined {
		const active = this.toSupportedDocument(window.activeTextEditor?.document);
		if (active) {
			return active;
		}

		const visible = window.visibleTextEditors
			.map((editor) => editor.document)
			.find((doc) => this.isSupportedDocument(doc));

		if (visible) {
			return visible;
		}

		return workspace.textDocuments.find((doc) => this.isSupportedDocument(doc));
	}

	private toSupportedDocument(document?: TextDocument): TextDocument | undefined {
		if (!document) {
			return undefined;
		}
		return this.isSupportedDocument(document) ? document : undefined;
	}

	private isSupportedDocument(document?: TextDocument): boolean {
		if (!document) {
			return false;
		}
		if (document.uri.scheme !== "file") {
			return false;
		}
		const extension = path.extname(document.uri.fsPath).toLowerCase();
		return [".ts", ".tsx", ".js", ".jsx"].includes(extension);
	}

	private handleActiveEditorChanged(editor: TextEditor | undefined) {
		// Only update the tracked document while we are in "document" mode.
		// If a snippet (AI / preview) is currently displayed, ignore editor changes.
		if (this.diagramSource.kind !== "document") {
			return;
		}

		const document = this.toSupportedDocument(editor?.document);
		if (!document) {
			return;
		}

		this.diagramSource = { kind: "document", uri: document.uri };
	}

	private handleDocumentChanged(document: TextDocument) {
		if (!this.isWebviewReady) {
			return;
		}

		// Ignore editor edits while a snippet is displayed.
		if (this.diagramSource.kind !== "document") {
			return;
		}

		if (document.uri.toString() !== this.diagramSource.uri.toString()) {
			return;
		}

		if (!this.isSupportedDocument(document)) {
			return;
		}

		void this.publishCurrentDocument();
	}

	private getCurrentDocument(): TextDocument | undefined {
		if (this.diagramSource.kind === "document") {
			const match = workspace.textDocuments.find(
				(doc) => doc.uri.toString() === (this.diagramSource as { uri: Uri }).uri.toString()
			);
			if (match) {
				return match;
			}
		}
		return this.getPreferredDocument();
	}

	private getCurrentFilePath(): string | undefined {
		if (this.diagramSource.kind === "document") {
			return this.diagramSource.uri.fsPath;
		}
		if (this.diagramSource.kind === "snippet") {
			return this.diagramSource.sourceFile;
		}
		return this.getCurrentDocument()?.uri.fsPath;
	}

	// ───────────────────────── Parsing / publishing ─────────────────────────

	private postDiagramType() {
		this.postMessage({
			type: "diagram/type",
			data: { diagramType: "activity" },
		});
	}

	private async parseAndSendDiagram(sourceText: string, sourceFile?: string) {
		const rootDir = sourceFile ? path.dirname(sourceFile) : ".";

		try {
			const parsedComponent = await parseActivityComponent(sourceText, rootDir);

			this.lastKnownActivityGraph = {
				nodes: parsedComponent.nodes,
				edges: parsedComponent.edges,
			};

			this.postMessage({
				type: "code/data",
				data: {
					nodes: parsedComponent.nodes,
					edges: parsedComponent.edges,
					sourceFile,
				},
			});
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Unable to build diagram from source.";

			this.postMessage({
				type: "code/error",
				data: { message },
			});
		}
	}

	private async replaceDiagramFromSource(sourceText: string, sourceFile?: string) {
		const normalizedSource = this.extractFunctionBodyIfWrapped(sourceText);
		await this.parseAndSendDiagram(normalizedSource, sourceFile);
	}

	private async publishCurrentDocument() {
		const document = this.getCurrentDocument();
		if (!document) {
			return;
		}

		this.diagramSource = { kind: "document", uri: document.uri };
		await this.parseAndSendDiagram(document.getText(), document.uri.fsPath);
	}

	// ───────────────────────── Skeleton generation ─────────────────────────

	public static async generateCodeFromCurrentDiagram(): Promise<string> {
		const panel = ComponentActivityPanel.currentPanel;

		if (!panel) {
			throw new Error("Activity panel is not open.");
		}

		const graph =
			await panel.refreshVisibleGraph(2000) ??
			ComponentActivityPanel.getCurrentVisibleActivityGraph() ??
			ComponentActivityPanel.getCurrentActivityGraph();

		if (!graph || graph.nodes.length === 0) {
			throw new Error("No activity diagram available.");
		}

		return panel.generateAndEnrichSkeletonFromDiagram(
			graph.nodes,
			graph.edges,
			panel.getCurrentFilePath()
		);
	}

	private async generateAndEnrichSkeletonFromDiagram(
		nodes: Node[],
		edges: Edge[],
		activeFilePath?: string
	): Promise<string> {
		if (!nodes.length) {
			void window.showWarningMessage("Cannot generate skeleton: the activity diagram has no nodes.");
			return "";
		}

		const generatedCode = convertDiagramToCode(nodes, edges);

		const generatedDocument = await workspace.openTextDocument({
			language: "typescript",
			content: generatedCode,
		});

		await window.showTextDocument(
			generatedDocument,
			ViewColumn.Beside,
			true
		);

		return generatedCode; // 👈 toto je jediná dôležitá zmena
	}

	private buildDiagramContext(
		availability: DiagramContext["availability"],
		nodes: unknown[],
		edges: unknown[]
	): DiagramContext {
		const nodeTypes = Array.from(
			new Set(
				nodes
					.map((node) => {
						if (!node || typeof node !== "object") {
							return "unknown";
						}
						const maybeType = (node as { type?: unknown }).type;
						return typeof maybeType === "string" && maybeType.trim() ? maybeType : "unknown";
					})
					.filter((value) => value !== "unknown")
			)
		).sort((left, right) => left.localeCompare(right));

		const json = JSON.stringify({ nodes, edges }, null, 2);

		return {
			availability,
			json,
			nodeCount: nodes.length,
			edgeCount: edges.length,
			nodeTypes,
		};
	}

	// ───────────────────────── AST helper (unchanged) ─────────────────────────

	private extractFunctionBodyIfWrapped(sourceText: string): string {
		const trimmed = sourceText.trim();
		if (!trimmed) {
			return trimmed;
		}

		const sourceFile = ts.createSourceFile(
			"inline.tsx",
			trimmed,
			ts.ScriptTarget.Latest,
			true,
			ts.ScriptKind.TSX
		);

		const first = sourceFile.statements[0];
		if (!first) {
			return trimmed;
		}

		const isSupportedFunctionLike = (
			node: ts.Node
		): node is
			| ts.FunctionDeclaration
			| ts.FunctionExpression
			| ts.ArrowFunction
			| ts.MethodDeclaration
			| ts.ConstructorDeclaration
			| ts.GetAccessorDeclaration
			| ts.SetAccessorDeclaration =>
			ts.isFunctionDeclaration(node) ||
			ts.isFunctionExpression(node) ||
			ts.isArrowFunction(node) ||
			ts.isMethodDeclaration(node) ||
			ts.isConstructorDeclaration(node) ||
			ts.isGetAccessorDeclaration(node) ||
			ts.isSetAccessorDeclaration(node);

		const getNodeName = (node: ts.Node): string => {
			if (ts.isConstructorDeclaration(node)) {
				return "constructor";
			}
			if (
				ts.isFunctionDeclaration(node) ||
				ts.isMethodDeclaration(node) ||
				ts.isGetAccessorDeclaration(node) ||
				ts.isSetAccessorDeclaration(node) ||
				ts.isPropertyDeclaration(node) ||
				ts.isPropertyAssignment(node)
			) {
				return node.name?.getText(sourceFile) ?? "anonymous";
			}
			return "anonymous";
		};

		const getBlockStatements = (
			node:
				| ts.FunctionDeclaration
				| ts.FunctionExpression
				| ts.ArrowFunction
				| ts.MethodDeclaration
				| ts.ConstructorDeclaration
				| ts.GetAccessorDeclaration
				| ts.SetAccessorDeclaration
		): string[] | null => {
			const body = node.body;
			if (!body) {
				return null;
			}
			if (ts.isBlock(body)) {
				return body.statements.map((s) => s.getText(sourceFile));
			}
			return [`return ${body.getText(sourceFile)};`];
		};

		interface ExtractedFn {
			name: string;
			statements: string[];
		}

		const collectFunctions = (node: ts.Node): ExtractedFn[] => {
			if (isSupportedFunctionLike(node)) {
				const statements = getBlockStatements(node);
				if (statements) {
					return [{ name: getNodeName(node), statements }];
				}
			}

			if (ts.isVariableStatement(node)) {
				const results: ExtractedFn[] = [];
				for (const decl of node.declarationList.declarations) {
					if (decl.initializer && isSupportedFunctionLike(decl.initializer)) {
						const statements = getBlockStatements(decl.initializer);
						if (statements) {
							const name = ts.isIdentifier(decl.name) ? decl.name.text : "anonymous";
							results.push({ name, statements });
						}
					}
				}
				return results;
			}

			if (ts.isExpressionStatement(node)) {
				return collectFunctions(node.expression);
			}
			if (ts.isParenthesizedExpression(node)) {
				return collectFunctions(node.expression);
			}
			if (ts.isCallExpression(node)) {
				return collectFunctions(node.expression);
			}

			if (ts.isObjectLiteralExpression(node)) {
				const results: ExtractedFn[] = [];
				for (const prop of node.properties) {
					if (ts.isMethodDeclaration(prop) && prop.body) {
						const statements = prop.body.statements.map((s) => s.getText(sourceFile));
						results.push({ name: getNodeName(prop), statements });
						continue;
					}
					if (ts.isPropertyAssignment(prop) && isSupportedFunctionLike(prop.initializer)) {
						const statements = getBlockStatements(prop.initializer);
						if (statements) {
							results.push({ name: getNodeName(prop), statements });
						}
					}
				}
				return results;
			}

			if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
				const results: ExtractedFn[] = [];
				for (const member of node.members) {
					if (isSupportedFunctionLike(member)) {
						const statements = getBlockStatements(member);
						if (statements) {
							results.push({ name: getNodeName(member), statements });
						}
						continue;
					}
					if (
						ts.isPropertyDeclaration(member) &&
						member.initializer &&
						isSupportedFunctionLike(member.initializer)
					) {
						const statements = getBlockStatements(member.initializer);
						if (statements) {
							results.push({ name: getNodeName(member), statements });
						}
					}
				}
				return results;
			}

			return [];
		};

		const extracted = collectFunctions(first);

		if (extracted.length === 0) {
			return trimmed;
		}
		if (extracted.length === 1) {
			return extracted[0].statements.join("\n");
		}
		return extracted
			.map(({ name, statements }) => `function ${name}() {\n${statements.join("\n")}\n}`)
			.join("\n\n");
	}

	// ───────────────────────── HTML / messaging ─────────────────────────

	private getWebviewContent(webview: Webview, extensionUri: Uri) {
		const stylesUri = getUri(webview, extensionUri, [
			ComponentActivityPanel.WEBVIEW_DIR,
			"assets",
			"index.css",
		]);
		const scriptUri = getUri(webview, extensionUri, [
			ComponentActivityPanel.WEBVIEW_DIR,
			"assets",
			"index.js",
		]);

		const nonce = getNonce();

		return /*html*/ `
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data: blob:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
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
		if (isWebviewReadyMessage(message)) {
			void this.onWebviewReady();
			return;
		}

		if (isDiagramImageMessage(message)) {
			const dataUrl =
				typeof message.data?.dataUrl === "string" ? message.data.dataUrl : undefined;

			this.lastDiagramImageDataUrl = dataUrl;

			if (this.pendingImageRequest) {
				const pending = this.pendingImageRequest;
				this.pendingImageRequest = undefined;
				clearTimeout(pending.timeout);
				pending.resolve(dataUrl);
			}

			if (message.data?.error) {
				console.warn("Diagram image capture failed:", message.data.error);
			}
			return;
		}

		// Response to an explicit `diagram/requestGraph` from the panel.
		if (isGraphSnapshotMessage(message)) {
			const payload = message.data;
			const nodes = Array.isArray(payload?.nodes) ? (payload.nodes as Node[]) : [];
			const edges = Array.isArray(payload?.edges) ? (payload.edges as Edge[]) : [];
			const graph: ActivityGraph = { nodes, edges };
			this.lastVisibleActivityGraph = graph;

			if (this.pendingGraphRequest) {
				const pending = this.pendingGraphRequest;
				this.pendingGraphRequest = undefined;
				clearTimeout(pending.timeout);
				pending.resolve(graph);
			}
			return;
		}

		// Back-compat: some older webview builds may still push this unsolicited.
		// We accept it as a best-effort cache update but no longer rely on it.
		if (isVisibleGraphMessage(message)) {
			const payload = message.data;
			const nodes = Array.isArray(payload?.nodes) ? (payload.nodes as Node[]) : [];
			const edges = Array.isArray(payload?.edges) ? (payload.edges as Edge[]) : [];
			this.lastVisibleActivityGraph = { nodes, edges };
			return;
		}

		if (!isActivityWebviewToExtensionMessage(message)) {
			return;
		}

		switch (message.type) {
			case "diagram/requestType":
				this.postDiagramType();
				return;

			case "diagram/openSourceFile":
				// Back-compat only: older webviews still send this at boot.
				// We honor it only if nothing else is driving the view.
				if (this.diagramSource.kind !== "snippet") {
					void this.publishCurrentDocument();
				}
				return;

			case "diagram/generateSkeleton": {
				const payload = message.data as ActivityGraphPayload;
				const nodes = Array.isArray(payload.nodes) ? (payload.nodes as Node[]) : [];
				const edges = Array.isArray(payload.edges) ? (payload.edges as Edge[]) : [];

				this.lastKnownActivityGraph = { nodes, edges };
				this.lastVisibleActivityGraph = { nodes, edges };

				void this.generateAndEnrichSkeletonFromDiagram(
					nodes,
					edges,
					this.getCurrentFilePath()
				);
				return;
			}

			case "code/nodePreview": {
				const payload = message.data as ActivityNodePreviewRequestPayload;
				const sourceText = typeof payload.sourceText === "string" ? payload.sourceText : "";

				if (!sourceText.trim()) {
					return;
				}

				// Node preview drilldown → switch to snippet mode so editor edits
				// don't overwrite the drilled-down view.
				this.diagramSource = {
					kind: "snippet",
					text: sourceText,
					sourceFile: this.getCurrentFilePath(),
				};
				void this.replaceDiagramFromSource(sourceText, this.getCurrentFilePath());
				return;
			}

			default:
				return;
		}
	}
}