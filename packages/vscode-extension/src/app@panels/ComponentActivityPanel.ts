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
import { enrichSkeletonWithDiagram } from "../chat/aiService";
import type { DiagramContext } from "../chat/types";
import * as ts from "typescript";

type ActivityGraph = {
	nodes: Node[];
	edges: Edge[];
};



function isVisibleGraphMessage(
	message: unknown
): message is { type: "diagram/visibleGraph"; data: ActivityGraphPayload } {
	return !!message && typeof message === "object" && (message as { type?: unknown }).type === "diagram/visibleGraph";
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

	private currentDocument?: TextDocument;
	private lastKnownActivityGraph?: ActivityGraph;
	private lastVisibleActivityGraph?: ActivityGraph;
	private lastDiagramImageDataUrl?: string;
	private lastDiagramMessage?: ActivityExtensionToWebviewMessage;

	private pendingImageRequest?: {
		resolve: (dataUrl?: string) => void;
		timeout: ReturnType<typeof setTimeout>;
	};

	private isWebviewReady = false;
	private initResolver?: () => void;

	public static getCurrentActivityGraph(): ActivityGraph | undefined {
		const current = ComponentActivityPanel.currentPanel?.lastKnownActivityGraph;
		if (!current) {
			return undefined;
		}

		return {
			nodes: [...current.nodes],
			edges: [...current.edges],
		};
	}

	public static getCurrentVisibleActivityGraph(): ActivityGraph | undefined {
		const current = ComponentActivityPanel.currentPanel?.lastVisibleActivityGraph;
		if (!current) {
			return undefined;
		}

		return {
			nodes: [...current.nodes],
			edges: [...current.edges],
		};
	}

	public static getCurrentDiagramImageDataUrl(): string | undefined {
		return ComponentActivityPanel.currentPanel?.lastDiagramImageDataUrl;
	}

	private constructor(panel: WebviewPanel, extensionUri: Uri, initialDocument?: TextDocument) {
		this.panel = panel;
		this.currentDocument = this.toSupportedDocument(initialDocument) ?? this.getPreferredDocument();

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

		this.postDiagramType();

	}

	public static render(extensionUri: Uri) {
		const initialDocument = ComponentActivityPanel.getPreferredDocumentStatic();

		if (ComponentActivityPanel.currentPanel) {
			ComponentActivityPanel.currentPanel.currentDocument =
				ComponentActivityPanel.currentPanel.toSupportedDocument(initialDocument) ??
				ComponentActivityPanel.currentPanel.currentDocument;

			ComponentActivityPanel.currentPanel.panel.reveal(ViewColumn.One);
			ComponentActivityPanel.currentPanel.postDiagramType();
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
		if (!ComponentActivityPanel.currentPanel) {
			ComponentActivityPanel.render(extensionUri);
		}

		const panel = ComponentActivityPanel.currentPanel;
		if (!panel) {
			throw new Error("Activity panel could not be created.");
		}

		if (sourceFile) {
			const matchingDocument = workspace.textDocuments.find(
				(doc) => doc.uri.scheme === "file" && doc.uri.fsPath === sourceFile
			);
			if (matchingDocument) {
				panel.currentDocument = matchingDocument;
			}
		}

		await panel.init();
		await panel.replaceDiagramFromSource(sourceText, sourceFile);
		panel.panel.reveal(ViewColumn.One);
	}

	public dispose() {
		ComponentActivityPanel.currentPanel = undefined;
		this.isWebviewReady = false;
		this.initResolver = undefined;
		this.lastDiagramMessage = undefined;
		this.lastDiagramImageDataUrl = undefined;

		if (this.pendingImageRequest) {
			clearTimeout(this.pendingImageRequest.timeout);
			this.pendingImageRequest.resolve(undefined);
			this.pendingImageRequest = undefined;
		}

		this.panel.dispose();

		while (this.disposables.length) {
			const disposable = this.disposables.pop();
			disposable?.dispose();
		}
	}

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
		if (!this.isWebviewReady) {
			await this.init();
		}

		if (this.pendingImageRequest) {
			clearTimeout(this.pendingImageRequest.timeout);
			this.pendingImageRequest.resolve(undefined);
			this.pendingImageRequest = undefined;
		}

		this.lastDiagramImageDataUrl = undefined;

		return new Promise<string | undefined>((resolve) => {
			const timeout = setTimeout(() => {
				if (!this.pendingImageRequest) {
					resolve(this.lastDiagramImageDataUrl);
					return;
				}

				const pending = this.pendingImageRequest;
				this.pendingImageRequest = undefined;
				pending.resolve(this.lastDiagramImageDataUrl);
			}, timeoutMs);

			this.pendingImageRequest = {
				resolve,
				timeout,
			};

			this.requestDiagramImage();
		});
	}

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

		const open = workspace.textDocuments.find((doc) => this.isSupportedDocument(doc));
		return open;
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
		const document = this.toSupportedDocument(editor?.document);
		if (document) {
			this.currentDocument = document;
		}
	}

	private getCurrentDocument(): TextDocument | undefined {
		return this.currentDocument ?? this.getPreferredDocument();
	}

	private getCurrentFilePath(): string | undefined {
		return this.getCurrentDocument()?.uri.fsPath;
	}

	private sendDiagram(message: ActivityExtensionToWebviewMessage) {
		this.lastDiagramMessage = message;

		if (!this.isWebviewReady) {
			return;
		}

		void this.panel.webview.postMessage(message);
	}

	private async init(): Promise<void> {
		if (this.isWebviewReady) {
			return;
		}

		return new Promise<void>((resolve) => {
			this.initResolver = resolve;
		});
	}

	private postDiagramType() {
		this.postMessage({
			type: "diagram/type",
			data: { diagramType: "activity" },
		});
	}

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

	private handleDocumentChanged(document: TextDocument) {
		if (!this.isWebviewReady) {
			return;
		}

		if (!this.currentDocument) {
			return;
		}

		if (document.uri.toString() !== this.currentDocument.uri.toString()) {
			return;
		}

		if (!this.isSupportedDocument(document)) {
			return;
		}

		this.currentDocument = document;
		void this.publishCurrentDocument();
	}

	private async parseAndSendDiagram(sourceText: string, sourceFile?: string) {
		const resolvedSourceFile = sourceFile ?? this.getCurrentFilePath();
		const rootDir = resolvedSourceFile ? path.dirname(resolvedSourceFile) : ".";

		try {
			const parsedComponent = await parseActivityComponent(sourceText, rootDir);

			this.lastKnownActivityGraph = {
				nodes: parsedComponent.nodes,
				edges: parsedComponent.edges,
			};

			this.sendDiagram({
				type: "code/data",
				data: {
					nodes: parsedComponent.nodes,
					edges: parsedComponent.edges,
					sourceFile: resolvedSourceFile,
				},
			});
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Unable to build diagram from source.";

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

		this.currentDocument = document;
		await this.parseAndSendDiagram(document.getText(), document.uri.fsPath);
	}

	private async generateAndEnrichSkeletonFromDiagram(
		nodes: Node[],
		edges: Edge[],
		activeFilePath?: string
	) {
		if (!nodes.length) {
			void window.showWarningMessage("Cannot generate skeleton: the activity diagram has no nodes.");
			return;
		}

		const generatedCode = convertDiagramToCode(nodes, edges);
		const generatedDocument = await workspace.openTextDocument({
			language: "typescript",
			content: generatedCode,
		});
		const generatedEditor = await window.showTextDocument(
			generatedDocument,
			ViewColumn.Beside,
			true
		);

		const diagramContext = this.buildDiagramContext("available-visible", nodes, edges);
		const cts = new CancellationTokenSource();

		try {
			const enrichedCodeRaw = await enrichSkeletonWithDiagram({
				code: generatedCode,
				activeFilePath: generatedEditor.document.uri.fsPath || activeFilePath,
				diagramContext,
				token: cts.token,
			});

			const enrichedCode = this.unwrapCodeFence(enrichedCodeRaw);
			await generatedEditor.edit((builder) => {
				const fullRange = new Range(
					generatedEditor.document.positionAt(0),
					generatedEditor.document.positionAt(generatedEditor.document.getText().length)
				);
				builder.replace(fullRange, enrichedCode || generatedCode);
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			void window.showErrorMessage(`Skeleton enrichment failed: ${message}`);
		} finally {
			cts.dispose();
		}
	}

	private unwrapCodeFence(text: string): string {
		const trimmed = text.trim();
		const fenceMatch = trimmed.match(
			/^```(?:typescript|ts|tsx|javascript|js)?\s*\n([\s\S]*?)\n```\s*$/i
		);
		if (fenceMatch?.[1]) {
			return fenceMatch[1].trim();
		}

		const singleQuoteFenceMatch = trimmed.match(
			/^'''(?:typescript|ts|tsx|javascript|js)?\s*\n([\s\S]*?)\n'''\s*$/i
		);
		if (singleQuoteFenceMatch?.[1]) {
			return singleQuoteFenceMatch[1].trim();
		}

		return trimmed;
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
						return typeof maybeType === "string" && maybeType.trim()
							? maybeType
							: "unknown";
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
			this.isWebviewReady = true;

			if (this.initResolver) {
				this.initResolver();
				this.initResolver = undefined;
			}

			if (this.lastDiagramMessage) {
				void this.panel.webview.postMessage(this.lastDiagramMessage);
			}

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

		if (isVisibleGraphMessage(message)) {
			const payload = message.data as ActivityGraphPayload;
			const nodes = Array.isArray(payload.nodes) ? (payload.nodes as Node[]) : [];
			const edges = Array.isArray(payload.edges) ? (payload.edges as Edge[]) : [];
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
				void this.publishCurrentDocument();
				return;

			case "diagram/generateSkeleton": {
				const payload = message.data as ActivityGraphPayload;
				const nodes = Array.isArray(payload.nodes) ? (payload.nodes as Node[]) : [];
				const edges = Array.isArray(payload.edges) ? (payload.edges as Edge[]) : [];

				this.lastKnownActivityGraph = { nodes, edges };

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

				void this.replaceDiagramFromSource(sourceText, this.getCurrentFilePath());
				return;
			}

			default:
				return;
		}
	}
}