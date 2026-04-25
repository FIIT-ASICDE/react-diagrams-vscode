import crypto from "crypto";
import { basename, dirname, extname, normalize } from "path";
import vscode, { Position, Selection, TextDocumentShowOptions, TextEditorRevealType, Uri, Webview, window, workspace } from "vscode";
import { ParsingImageCache } from "./cache";
import decodeDataUrl from "data-urls";

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

	let existingEditor = window.visibleTextEditors.find(editor => editor.document.uri.fsPath == uri.fsPath);

	if (existingEditor)
		existingEditor.selection = new Selection(pos, pos.translate(0, selectCount));
	else {
		existingEditor = await window.showTextDocument(uri, {
			selection: selection,
			...options
		});
	}
	
	existingEditor.revealRange(selection, TextEditorRevealType.InCenter);
}

export function getConfigOption<T>(section: string, key: string) {
	return workspace.getConfiguration(section).get<T>(key);
}

export async function saveDiagramImage(data: { dataUrl?: string; }, cache: ParsingImageCache) {
	const document = cache.getCurrentDocument();
	if (!document) {
		window.showWarningMessage("No active React component file found for this diagram image.");
		return;
	}
	
	const image = decodeDataUrl(data.dataUrl ?? "");
	if (!image) {
		window.showWarningMessage("Could not create the diagram image.");
		return;
	}

	const cachedImage = cache.updateImage(document, image.body, image.mimeType.toString());
	const fileName = `${basename(document.uri.fsPath, extname(document.uri.fsPath))}.state-diagram.png`;
	const defaultUri = Uri.joinPath(Uri.file(dirname(document.uri.fsPath)), fileName);
	const targetUri = await window.showSaveDialog({
		defaultUri,
		filters: { "PNG Image": ["png"] },
		saveLabel: "Save Diagram Image",
		title: "Save State Diagram Image",
	});

	if (!targetUri)
		return;

	await workspace.fs.writeFile(targetUri, cachedImage);
	window.showInformationMessage(`Diagram image saved to ${targetUri.fsPath}`);
}