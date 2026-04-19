import { TextDocument, workspace } from "vscode";
import { normalizeFilePath } from "../index";

export type CacheEntry<T> = {
	data: Promise<T>;
	documentVersion: number;
	document: TextDocument;
	updatedAt: number;
};

export class ParsingCache<T = any> {
	private readonly entries = new Map<string, CacheEntry<T>>();
	private currentDocument?: TextDocument;

	constructor (
		private parseFunction: (source: string, rootPath?: string) => T,
	) 
	{}

	async parseAsync(source: string, rootPath?: string) {
		return this.parseFunction(source, rootPath);	
	}

	updateEntry(document: TextDocument, rootPath?: string, forceUpdate = false) {
		const cacheKey = normalizeFilePath(document.uri.fsPath);
		this.currentDocument = document;

		const cached = this.entries.get(cacheKey);
		if (!forceUpdate && cached && cached.documentVersion == document.version)
		{
			console.debug("Cache hit");
			return cached;
		}

		console.time(`Parsing React component {${cacheKey}}`);
		const data = this.parseAsync(document.uri.fsPath, rootPath ?? getRootPath(document));
		console.timeEnd(`Parsing React component {${cacheKey}}`);
		// console.trace();

		const entry: CacheEntry<T> = {
			data,
			documentVersion: document.version,
			document,
			updatedAt: Date.now(),
		};
		this.entries.set(cacheKey, entry);
		return entry;
	}

	async update(document: TextDocument, rootPath?: string, forceUpdate = false) {
		const { data } = this.updateEntry(document, rootPath, forceUpdate);
		return await data;
	}

	getCurrentDocument() {
		return this.currentDocument;
	}

	get(filePath?: TextDocument | string) {
		if (typeof filePath == "string")
			return this.entries.get(normalizeFilePath(filePath));

		if (!filePath)
			return undefined;

		const normPath = normalizeFilePath(filePath.uri.fsPath);
		return this.entries.get(normPath) ?? this.updateEntry(filePath);
	}
}

export function getRootPath(targetDocument?: TextDocument) {
	if (!targetDocument)
		return workspace.workspaceFolders?.[0]?.uri.fsPath;
	return workspace.getWorkspaceFolder(targetDocument.uri)?.uri.fsPath ?? workspace.workspaceFolders?.[0]?.uri.fsPath;
}