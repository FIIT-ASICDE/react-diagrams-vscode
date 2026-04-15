import crypto from "crypto";
import { normalize } from "path";
import vscode, { Position, Selection, TextDocumentShowOptions, TextEditorRevealType, Uri, Webview } from "vscode";

export function getNonce(size = 11) {
	return crypto.randomBytes(size).toString("hex");
}

export function getUri(webview: Webview, extensionUri: Uri, pathList: string[]) {
	return webview.asWebviewUri(Uri.joinPath(extensionUri, ...pathList));
}

export function normalizeFilePath(filePath: string) {
	const normalizedPath = normalize(filePath);
	return process.platform == "win32" ? normalizedPath.toLowerCase() : normalizedPath;
}

export async function jumpToPosition(file: Uri | string, line: number, col: number, selectCount = 1, options: TextDocumentShowOptions = {}) {
	const uri = typeof file == "string" ? Uri.file(file) : file;

	const pos = new Position(line, col);
	const selection = new Selection(pos, pos);

	let existingEditor = vscode.window.visibleTextEditors.find(editor => editor.document.uri.fsPath == uri.fsPath);

	if (existingEditor)
		existingEditor.selection = new vscode.Selection(pos, pos.translate(0, selectCount));
	else {
		existingEditor = await vscode.window.showTextDocument(uri, {
			selection: selection,
			...options
		});
	}
	
	existingEditor.revealRange(selection, TextEditorRevealType.InCenter);
}