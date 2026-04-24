import { TextDocument, workspace } from "vscode";
import { normalizeFilePath } from "../index";

export function getRootPath(targetDocument?: TextDocument) {
	if (!targetDocument)
		return workspace.workspaceFolders?.[0]?.uri.fsPath;
	return workspace.getWorkspaceFolder(targetDocument.uri)?.uri.fsPath ?? workspace.workspaceFolders?.[0]?.uri.fsPath;
}

export type CacheEntry<T = any, D = Promise<T>> = {
	data: D;
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

	get(filePath: TextDocument | string | undefined = this.getCurrentDocument()) {
		if (typeof filePath == "string")
			return this.entries.get(normalizeFilePath(filePath));

		if (!filePath) 
			return undefined;
		const normPath = normalizeFilePath(filePath.uri.fsPath);
		return this.entries.get(normPath) ?? this.updateEntry(filePath);
	}

	clear() {
		this.entries.clear();
	}
}

export type ImageCacheEntry = CacheEntry<Uint8Array, Uint8Array> & {
	mediaType: string;
};

export class ParsingImageCache<T = any> extends ParsingCache<T> {
	private readonly images = new Map<string, ImageCacheEntry>();

	override updateEntry(document: TextDocument, rootPath?: string, forceUpdate = false) {
		const cacheKey = normalizeFilePath(document.uri.fsPath);
		const cached = super.get(document.uri.fsPath);

		if (forceUpdate || cached?.documentVersion != document.version)
			this.images.delete(cacheKey);
		return super.updateEntry(document, rootPath, forceUpdate);
	}

	override clear() {
		super.clear();
		this.images.clear();
	}

	updateImageEntry(document: TextDocument, data: Uint8Array, mediaType = "image/png", forceUpdate = false) {
		const existing = forceUpdate && this.getImage(document);
		if (existing)
			return existing;

		const cacheKey = normalizeFilePath(document.uri.fsPath);
		const entry: ImageCacheEntry = {
			data,
			documentVersion: document.version,
			document,
			mediaType,
			updatedAt: Date.now(),
		};

		this.images.set(cacheKey, entry);
		return entry;
	}

	updateImage(document: TextDocument, data: Uint8Array, mediaType = "image/png", forceUpdate = false) {
		return this.updateImageEntry(document, data, mediaType, forceUpdate).data;
	}

	getImage(filePath: TextDocument | string | undefined = this.getCurrentDocument()) {
		if (!filePath)
			return undefined;
		if (typeof filePath == "string")
			return this.images.get(normalizeFilePath(filePath));

		const normPath = normalizeFilePath(filePath.uri.fsPath);
		const image = this.images.get(normPath);
		if (image?.documentVersion != filePath.version) {
			this.images.delete(normPath);
			return undefined;
		}
		return image;
	}
}