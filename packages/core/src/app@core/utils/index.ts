// export * from "./types";

export function truncate(str, max = 100): string {
	str = str.toString().replace(/\s+/g, ' ').trim();
	return str.length > max ? `${str.substr(0, max-1)}...` : str;
}