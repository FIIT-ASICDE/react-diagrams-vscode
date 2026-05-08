
export type Outcome =
	| { kind: "fall" }
	| { kind: "return" }
	| { kind: "break"; label?: string }
	| { kind: "continue"; label?: string };

export type EmitResult = { outcome: Outcome; next: string | undefined };

export type DoWhileRegion = {
	loopId: string;
	bodyEntryId: string;
	conditionText: string;
	exitId?: string;
};

export type AnyNodeData = {
	label?: unknown;
	sourceText?: unknown;
	construct?: unknown;
	tryOwner?: unknown;
	switchOwner?: unknown;
	role?: unknown;
	loopLabel?: unknown;
	loopKind?: unknown;
	forHeader?: unknown;
	forOfBinding?: unknown;
	forEachIterable?: unknown;
	forEachCallee?: unknown;
	forEachParams?: unknown;
	pendingReturnSourceText?: unknown;
};

export const FALL: Outcome = { kind: "fall" };
export const RETURN: Outcome = { kind: "return" };


// Handles choose dominant.
export function chooseDominant(a: Outcome, b: Outcome): Outcome {
	if (a.kind === "return" || b.kind === "return") return RETURN;
	if (a.kind === "fall") return b;
	if (b.kind === "fall") return a;
	if (a.kind === "break" && b.kind === "continue") return a;
	if (a.kind === "continue" && b.kind === "break") return b;
	if (a.label && !b.label) return a;
	return b;
}