import * as path from "path";
import {
	Disposable,
	TextDocument,
	TextEditor,
	Webview,
	WebviewPanel,
	window,
	Uri,
	ViewColumn,
	workspace,
} from "vscode";
import { getNonce, getUri } from "../app@utils";
import { checkStructure, convertDiagramToCode, parseActivityComponent } from "@react-diagrams/core";
import type {
	ActivityExtensionToWebviewMessage,
	ActivityGraphPayload,
	ActivityNodePreviewRequestPayload,
} from "@react-diagrams/core/app@vscode";
import { isActivityWebviewToExtensionMessage } from "@react-diagrams/core/app@vscode";
import { Node, Edge } from "@xyflow/react";
import type { DiagramContext } from "../chat/types";
import { getConfig, updateConfig } from "../chat/config";
import * as ts from "typescript";

type ActivityGraph = {
	nodes: Node[];
	edges: Edge[];
};

type DiagramSource =
	| { kind: "document"; uri: Uri }
	| { kind: "snippet"; text: string; sourceFile?: string }
	| { kind: "none" };

type PendingIntent =
	| { kind: "followActiveEditor" }
	| { kind: "showSnippet"; text: string; sourceFile?: string }
	| { kind: "none" };



const HOOK_NAMES = new Set([
	"useEffect",
	"useLayoutEffect",
	"useInsertionEffect",
	"useCallback",
	"useMemo",
	"useState",
]);


// Type guard for the graph currently visible in the webview.
function isVisibleGraphMessage(
	message: unknown
): message is { type: "diagram/visibleGraph"; data: ActivityGraphPayload } {
	return !!message && typeof message === "object" && (message as { type?: unknown }).type === "diagram/visibleGraph";
}


// Type guard for explicit graph snapshot responses.
function isGraphSnapshotMessage(
	message: unknown
): message is { type: "diagram/graphSnapshot"; data: ActivityGraphPayload } {
	return !!message && typeof message === "object" && (message as { type?: unknown }).type === "diagram/graphSnapshot";
}


// Type guard for the webview ready handshake.
function isWebviewReadyMessage(message: unknown): message is { type: "webview/ready" } {
	return !!message && typeof message === "object" && (message as { type?: unknown }).type === "webview/ready";
}


// Type guard for diagram image capture responses.
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

	

	
	// Returns current activity graph.
	public static getCurrentActivityGraph(): ActivityGraph | undefined {
		const current = ComponentActivityPanel.currentPanel?.lastKnownActivityGraph;
		if (!current) return undefined;
		return { nodes: [...current.nodes], edges: [...current.edges] };
	}

	
	// Returns current visible activity graph.
	public static getCurrentVisibleActivityGraph(): ActivityGraph | undefined {
		const current = ComponentActivityPanel.currentPanel?.lastVisibleActivityGraph;
		if (!current) return undefined;
		return { nodes: [...current.nodes], edges: [...current.edges] };
	}

	
	// Returns current diagram image data url.
	public static getCurrentDiagramImageDataUrl(): string | undefined {
		return ComponentActivityPanel.currentPanel?.lastDiagramImageDataUrl;
	}

	
	// Renders value.
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

	
	// Handles show diagram from source text.
	public static async showDiagramFromSourceText(
		extensionUri: Uri,
		sourceText: string,
		sourceFile?: string
	): Promise<void> {
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

		if (panel.isWebviewReady) {
			await panel.runPendingIntent();
		}
	}

	// Handles constructor.
	private constructor(panel: WebviewPanel, extensionUri: Uri, initialDocument?: TextDocument) {
		this.panel = panel;

		const initialDoc = this.toSupportedDocument(initialDocument) ?? this.getPreferredDocument();
		if (initialDoc) {
			this.diagramSource = { kind: "document", uri: initialDoc.uri };
		}

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

	
	// Handles dispose.
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

	
	// Handles post message.
	public postMessage(message: ActivityExtensionToWebviewMessage) {
		void this.panel.webview.postMessage(message);
	}

	
	// Handles request diagram image.
	public requestDiagramImage() {
		this.postMessage({
			type: "diagram/requestImage",
			data: {},
		});
	}

	
	// Handles request diagram image data url.
	public async requestDiagramImageDataUrl(timeoutMs = 8000): Promise<string | undefined> {
		await this.waitUntilReady();

		if (this.pendingImageRequest) {
			clearTimeout(this.pendingImageRequest.timeout);
			this.pendingImageRequest.resolve(undefined);
			this.pendingImageRequest = undefined;
		}

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

	
	// Handles refresh visible graph.
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

	
	// Handles wait until ready.
	private waitUntilReady(): Promise<void> {
		if (this.isWebviewReady) return Promise.resolve();
		return new Promise<void>((resolve) => {
			this.readyWaiters.push(resolve);
		});
	}

	
	// Handles on webview ready.
	private async onWebviewReady() {
		if (this.isWebviewReady) return;
		this.isWebviewReady = true;

		this.postDiagramType();

		const waiters = this.readyWaiters;
		this.readyWaiters = [];
		for (const w of waiters) w();

		await this.runPendingIntent();
	}

	
	// Execute delayed action once the webview is ready.
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

	
	// Returns preferred document static.
	private static getPreferredDocumentStatic(): TextDocument | undefined {
		const active = window.activeTextEditor?.document;
		if (active && active.uri.scheme === "file") return active;
		const visible = window.visibleTextEditors.find((editor) => editor.document.uri.scheme === "file");
		return visible?.document;
	}

	
	// Returns preferred document.
	private getPreferredDocument(): TextDocument | undefined {
		const active = this.toSupportedDocument(window.activeTextEditor?.document);
		if (active) return active;

		const visible = window.visibleTextEditors
			.map((editor) => editor.document)
			.find((doc) => this.isSupportedDocument(doc));
		if (visible) return visible;

		return workspace.textDocuments.find((doc) => this.isSupportedDocument(doc));
	}

	
	// Handles to supported document.
	private toSupportedDocument(document?: TextDocument): TextDocument | undefined {
		if (!document) return undefined;
		return this.isSupportedDocument(document) ? document : undefined;
	}

	
	// Checks whether is supported document.
	private isSupportedDocument(document?: TextDocument): boolean {
		if (!document) return false;
		if (document.uri.scheme !== "file") return false;
		const extension = path.extname(document.uri.fsPath).toLowerCase();
		return [".ts", ".tsx", ".js", ".jsx"].includes(extension);
	}

	
	// Handles active editor changed.
	private handleActiveEditorChanged(editor: TextEditor | undefined) {
		if (this.diagramSource.kind !== "document") return;

		const document = this.toSupportedDocument(editor?.document);
		if (!document) return;

		this.diagramSource = { kind: "document", uri: document.uri };
	}

	
	// Handles document changed.
	private handleDocumentChanged(document: TextDocument) {
		if (!this.isWebviewReady) return;
		if (this.diagramSource.kind !== "document") return;
		if (document.uri.toString() !== this.diagramSource.uri.toString()) return;
		if (!this.isSupportedDocument(document)) return;

		void this.publishCurrentDocument();
	}

	
	// Returns current document.
	private getCurrentDocument(): TextDocument | undefined {
		if (this.diagramSource.kind === "document") {
			const match = workspace.textDocuments.find(
				(doc) => doc.uri.toString() === (this.diagramSource as { uri: Uri }).uri.toString()
			);
			if (match) return match;
		}
		return this.getPreferredDocument();
	}

	
	// Returns current file path.
	private getCurrentFilePath(): string | undefined {
		if (this.diagramSource.kind === "document") return this.diagramSource.uri.fsPath;
		if (this.diagramSource.kind === "snippet") return this.diagramSource.sourceFile;
		return this.getCurrentDocument()?.uri.fsPath;
	}

	
	// Handles post diagram type.
	private postDiagramType() {
		this.postMessage({
			type: "diagram/type",
			data: { diagramType: "activity" },
		});
	}

	
	// Parse source text and push graph data into the webview.
	private async parseAndSendDiagram(sourceText: string, sourceFile?: string) {
		const rootDir = sourceFile ? path.dirname(sourceFile) : ".";

		try {
			const parsedComponent = await parseActivityComponent(sourceText, rootDir);

			const parsedGraph: ActivityGraph = {
				nodes: parsedComponent.nodes,
				edges: parsedComponent.edges,
			};

			
			// Keep latest parsed graph as fallback when visible graph is unavailable.
			this.lastKnownActivityGraph = parsedGraph;
			this.lastVisibleActivityGraph = {
				nodes: [...parsedGraph.nodes],
				edges: [...parsedGraph.edges],
			};

			this.postMessage({
				type: "code/data",
				data: {
					nodes: parsedGraph.nodes,
					edges: parsedGraph.edges,
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

	
	// Handles replace diagram from source.
	private async replaceDiagramFromSource(sourceText: string, sourceFile?: string) {
		const normalizedSource = this.extractFunctionBodyIfWrapped(sourceText);
		await this.parseAndSendDiagram(normalizedSource, sourceFile);
	}

	
	// Handles publish current document.
	private async publishCurrentDocument() {
		const document = this.getCurrentDocument();
		if (!document) return;

		this.diagramSource = { kind: "document", uri: document.uri };
		await this.parseAndSendDiagram(document.getText(), document.uri.fsPath);
	}

	
	// Generates code from current diagram.
	public static async generateCodeFromCurrentDiagram(): Promise<string> {
		const panel = ComponentActivityPanel.currentPanel;
		if (!panel) throw new Error("Activity panel is not open.");

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

	
	// Generates and enrich skeleton from diagram.
	private async generateAndEnrichSkeletonFromDiagram(
		nodes: Node[],
		edges: Edge[],
		activeFilePath?: string
	): Promise<string> {
		if (!nodes.length) {
			void window.showWarningMessage("Cannot generate skeleton: the activity diagram has no nodes.");
			return "";
		}

		try {
			checkStructure(nodes, edges);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Unknown diagram structure error.";
			void window.showErrorMessage(`Cannot generate skeleton: ${message}`);
			return "";
		}

		const generatedCode = convertDiagramToCode(nodes, edges);

		const generatedDocument = await workspace.openTextDocument({
			language: "typescript",
			content: generatedCode,
		});

		await window.showTextDocument(generatedDocument, ViewColumn.Beside, true);
		return generatedCode;
	}

	
	// Builds diagram context.
	private buildDiagramContext(
		availability: DiagramContext["availability"],
		nodes: unknown[],
		edges: unknown[]
	): DiagramContext {
		const nodeTypes = Array.from(
			new Set(
				nodes
					.map((node) => {
						if (!node || typeof node !== "object") return "unknown";
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

	
	
	// Handles extract function body if wrapped.
	private extractFunctionBodyIfWrapped(sourceText: string): string {
		const trimmed = sourceText.trim();
		if (!trimmed) return trimmed;

		const sourceFile = ts.createSourceFile(
			"inline.tsx",
			trimmed,
			ts.ScriptTarget.Latest,
			true,
			ts.ScriptKind.TSX
		);

		const first = sourceFile.statements[0];
		if (!first) return trimmed;

		// Narrow to function-like nodes whose body can be extracted.
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

		// Best-effort display name for extracted function-like nodes.
		const getNodeName = (node: ts.Node): string => {
			if (ts.isConstructorDeclaration(node)) return "constructor";
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

		// Normalize function body into statement strings.
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
			if (!body) return null;
			if (ts.isBlock(body)) {
				return body.statements.map((s) => s.getText(sourceFile));
			}
			return [`return ${body.getText(sourceFile)};`];
		};

		// Recognize hook calls where first argument is a callback.
		const getHookCallName = (call: ts.CallExpression): string | undefined => {
			const callee = call.expression;
			if (ts.isIdentifier(callee)) {
				const name = callee.text;
				return HOOK_NAMES.has(name) ? name : undefined;
			}
			if (ts.isPropertyAccessExpression(callee)) {
				const name = callee.name.text;
				return HOOK_NAMES.has(name) ? name : undefined;
			}
			return undefined;
		};

		// Extract callback body from known hooks like useEffect/useMemo.
		const extractHookCallbackBody = (call: ts.CallExpression): string | null => {
			if (!getHookCallName(call)) return null;

			const firstArg = call.arguments[0];
			if (!firstArg) return null;

			let candidate: ts.Node = firstArg;
			while (ts.isParenthesizedExpression(candidate)) {
				candidate = candidate.expression;
			}

			if (!isSupportedFunctionLike(candidate)) return null;

			const statements = getBlockStatements(candidate);
			return statements ? statements.join("\n") : null;
		};

		interface ExtractedFn {
			name: string;
			statements: string[];
		}

		// Collect function-like bodies from many syntactic wrapper forms.
		const collectFunctions = (node: ts.Node): ExtractedFn[] => {
			
			if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)) {
				const body = extractHookCallbackBody(node.expression);
				if (body !== null) {
					return [{ name: "callback", statements: [body] }];
				}
			}

			
			
			
			if (ts.isVariableStatement(node)) {
				for (const decl of node.declarationList.declarations) {
					if (decl.initializer && ts.isCallExpression(decl.initializer)) {
						const body = extractHookCallbackBody(decl.initializer);
						if (body !== null) {
							return [{ name: "callback", statements: [body] }];
						}
					}
				}
			}

			
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

			
			if (ts.isReturnStatement(node) && node.expression) {
				return collectFunctions(node.expression);
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

		if (extracted.length === 0) return trimmed;
		if (extracted.length === 1) return extracted[0].statements.join("\n");
		return extracted
			.map(({ name, statements }) => `function ${name}() {\n${statements.join("\n")}\n}`)
			.join("\n\n");
	}

	
	// Returns webview content.
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

		return  `
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

	
	// Handles webview message listener.
	private webviewMessageListener(message: unknown) {
		if (!!message && typeof message === "object") {
			const type = (message as { type?: unknown }).type;

			if (type === "settings/get") {
				void this.panel.webview.postMessage({
					type: "settings/config",
					data: getConfig(),
				});
				return;
			}

			if (type === "settings/update") {
				const data = (message as { data?: unknown }).data;
				void updateConfig(data)
					.then((next) => this.panel.webview.postMessage({ type: "settings/config", data: next }))
					.catch((error) => console.error("Failed to update chat settings:", error));
				return;
			}
		}

		if (isWebviewReadyMessage(message)) {
			void this.onWebviewReady();
			return;
		}

		if (isDiagramImageMessage(message)) {
			const dataUrl =
				typeof message.data?.dataUrl === "string" ? message.data.dataUrl : undefined;

			if (dataUrl) {
				this.lastDiagramImageDataUrl = dataUrl;
			}

			if (this.pendingImageRequest) {
				const pending = this.pendingImageRequest;
				this.pendingImageRequest = undefined;
				clearTimeout(pending.timeout);
				pending.resolve(dataUrl ?? this.lastDiagramImageDataUrl);
			}

			if (message.data?.error) {
				console.warn("Diagram image capture failed:", message.data.error);
			}
			return;
		}

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

		if (isVisibleGraphMessage(message)) {
			const payload = message.data;
			const nodes = Array.isArray(payload?.nodes) ? (payload.nodes as Node[]) : [];
			const edges = Array.isArray(payload?.edges) ? (payload.edges as Edge[]) : [];
			this.lastVisibleActivityGraph = { nodes, edges };
			return;
		}

		if (!isActivityWebviewToExtensionMessage(message)) return;

		switch (message.type) {
			case "diagram/requestType":
				this.postDiagramType();
				return;

			case "diagram/openSourceFile":
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

				if (!sourceText.trim()) return;

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