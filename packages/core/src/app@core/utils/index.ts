export * from "./types";

import path from "path";

export function normalizeFilePath(filePath: string) {
	const normalizedPath = path.normalize(filePath);
	return process.platform == "win32" ? normalizedPath.toLowerCase() : normalizedPath;
}

export function truncate(str, max = 100): string {
	str = str.toString().replace(/\s+/g, ' ').trim();
	return str.length > max ? `${str.substr(0, max-1)}...` : str;
}