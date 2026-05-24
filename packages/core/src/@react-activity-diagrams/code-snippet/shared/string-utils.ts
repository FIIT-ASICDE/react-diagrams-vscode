
// Handles normalize.
export function normalize(value: unknown): string {
	return String(value ?? "").trim().toLowerCase();
}


// Handles stringify label.
export function stringifyLabel(value: unknown): string {
	return String(value ?? "").trim();
}


// Handles indent.
export function indent(level: number): string {
	return "  ".repeat(Math.max(0, level));
}


// Handles sanitize statement.
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
