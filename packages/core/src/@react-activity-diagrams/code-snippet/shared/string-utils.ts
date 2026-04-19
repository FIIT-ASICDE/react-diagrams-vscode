import type { HookKind, HookSpec } from "./types";

export function normalize(value: unknown): string {
	return String(value ?? "").trim().toLowerCase();
}

export function stringifyLabel(value: unknown): string {
	return String(value ?? "").trim();
}

export function indent(level: number): string {
	return "  ".repeat(Math.max(0, level));
}

export function sanitizeStatement(label: string): string {
	const trimmed = label.trim();

	if (!trimmed) return "// TODO: empty action";

	if (/^return\s*\(/.test(trimmed)) return trimmed;
	if (/^return\b/.test(trimmed)) return /[;}]$/.test(trimmed) ? trimmed : `${trimmed};`;
	if (/^throw\b/.test(trimmed)) return /[;}]$/.test(trimmed) ? trimmed : `${trimmed};`;

	if (/^const\s*\[[^\]]+\]\s*=\s*useState\s*\(/.test(trimmed)) {
		return /[;}]$/.test(trimmed) ? trimmed : `${trimmed};`;
	}

	if (/^set[A-Z]\w*\s*\(/.test(trimmed)) {
		return /[;}]$/.test(trimmed) ? trimmed : `${trimmed};`;
	}

	if (
		/^[a-zA-Z_$][\w$.]*\s*\(/.test(trimmed) ||
		/(=|\+\+|--|await\b|const\b|let\b|var\b)/.test(trimmed)
	) {
		return /[;{}]$/.test(trimmed) ? trimmed : `${trimmed};`;
	}

	return trimmed;
}

export function parseHookSpec(label: string): HookSpec | null {
	const trimmed = label.trim();
	const match = trimmed.match(/^(useEffect|useMemo|useCallback)\s*(?:\((.*)\))?$/);
	if (!match) return null;

	const kind = match[1] as HookKind;
	const rawDeps = (match[2] ?? "").trim();

	if (!rawDeps) return { kind, deps: "[]" };
	if (rawDeps.startsWith("[") && rawDeps.endsWith("]")) return { kind, deps: rawDeps };
	return { kind, deps: `[${rawDeps}]` };
}
