import * as vscode from "vscode";
import { ComponentActivityPanel } from "../app@panels/ComponentActivityPanel";

type CreateActivityDiagramInput = {
	sourceText?: string;
	title?: string;
};

type CreateCodeInput = {
	title?: string;
};

function getBestEditorCode(): {
	code: string;
	filePath?: string;
	codeContextKind: "selected" | "full-file" | "none";
} {
	const editor =
		vscode.window.activeTextEditor ??
		vscode.window.visibleTextEditors.find((e) => e.document.uri.scheme === "file");

	if (!editor) {
		return {
			code: "",
			filePath: undefined,
			codeContextKind: "none",
		};
	}

	const hasSelection = !editor.selection.isEmpty;
	const code = hasSelection
		? editor.document.getText(editor.selection)
		: editor.document.getText();

	return {
		code,
		filePath: editor.document.uri.fsPath,
		codeContextKind: hasSelection ? "selected" : "full-file",
	};
}

export function registerCreateActivityDiagramTool(
	context: vscode.ExtensionContext
): vscode.Disposable {
	const disposable = vscode.lm.registerTool<CreateActivityDiagramInput>(
		"create_activity_diagram",
		{
			async invoke(options, _token) {
				const input = options.input ?? {};
				const editorState = getBestEditorCode();

				const hasSnippet =
					typeof input.sourceText === "string" &&
					input.sourceText.trim().length > 0;

				const sourceText = hasSnippet
					? input.sourceText!.trim()
					: editorState.code;

				if (!sourceText.trim()) {
					throw new Error("No code is available. Open a file or select code first.");
				}

				await ComponentActivityPanel.showDiagramFromSourceText(
					context.extensionUri,
					sourceText,
					editorState.filePath
				);

				return new vscode.LanguageModelToolResult([
					new vscode.LanguageModelTextPart(
						JSON.stringify({
							success: true,
							usedSnippet: hasSnippet,
							codeContextKind: editorState.codeContextKind,
							filePath: editorState.filePath ?? null,
							title: input.title ?? null,
						})
					),
				]);
			},
		}
	);

	context.subscriptions.push(disposable);
	return disposable;
}

export function registerCreateCodeTool(
	context: vscode.ExtensionContext
): vscode.Disposable {
	const disposable = vscode.lm.registerTool<CreateCodeInput>(
		"create_code_from_activity_diagram",
		{
			async invoke(options, _token) {
				const code =
					await ComponentActivityPanel.generateCodeFromCurrentDiagram();

				if (!code || !code.trim()) {
					throw new Error("Diagram-to-code generation returned empty code.");
				}

				return new vscode.LanguageModelToolResult([
					new vscode.LanguageModelTextPart(
						JSON.stringify({
							success: true,
							title: options.input?.title ?? null,
							code,
						})
					),
				]);
			},
		}
	);

	context.subscriptions.push(disposable);
	return disposable;
}