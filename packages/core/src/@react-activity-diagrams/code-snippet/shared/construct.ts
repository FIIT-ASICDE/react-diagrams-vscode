/**
 * Single source of truth for what a graph node represents in source code.
 *
 * Every node that has a non-trivial CodeGen behavior carries a
 * `data.construct` matching one of these values. The CodeGen looks at
 * `construct` first to decide what to emit; node.type is only the visual
 * shape (action / decision / loop / expandable / merge / start / end).
 *
 * Replaces the previous `loopKind` and `nodeKind` fields, which tangled
 * together "what is this node" with "what does it look like" and led to
 * detection by edge-label sniffing. With a single tag the parser sets it
 * explicitly and the CodeGen reads it explicitly — no heuristics in either
 * direction.
 *
 * UI angle: in the playground, the rename dialog exposes `construct` as a
 * dropdown when the user edits a decision / loop / expandable. That way
 * a user-built diagram round-trips the same way a parsed one does.
 */
export type Construct =
	// ── Decisions ─────────────────────────────────────────────────────────
	/** Plain `if` / `else`. Edges: yes / no. */
	| 'if'
	/** `switch` statement. Edges carry comma-separated case labels. */
	| 'switch'
	/**
	 * DEPRECATED: `try` / `catch` as a decision node construct.
	 * New diagrams use edge-labeled try: the incoming edge to the try body
	 * is labeled 'try'. Kept for backward compatibility only.
	 */
	| 'try'

	// ── Loops ─────────────────────────────────────────────────────────────
	| 'while'
	| 'do-while'
	/** Classical `for (init; cond; inc)`. Header is in `data.forHeader`. */
	| 'for'
	/** `for (binding of iterable)`. Binding in `data.forOfBinding`, iterable in `data.sourceText`. */
	| 'for-of'
	/** `for (binding in iterable)`. */
	| 'for-in'
	/**
	 * `arr.forEach(callback)` and similar (map / filter / reduce / find /
	 * lodash forOwn / forIn / etc.). Reconstructed in CodeGen from
	 * `forEachIterable`, `forEachCallee`, `forEachParams`.
	 */
	| 'foreach'

	// ── Expandables ───────────────────────────────────────────────────────
	/** Function declaration / arrow / function expression. */
	| 'function'
	/** React hook (useEffect / useCallback / useMemo / useState / ...). */
	| 'hook'

	// ── Terminating actions ───────────────────────────────────────────────
	/**
	 * Helps CodeGen know to STOP traversal after this node without having
	 * to regex-sniff the sourceText. Plain actions don't carry a construct.
	 */
	| 'return'
	| 'throw'
	| 'break'
	| 'continue'
	/** Placeholder metadata node for deferred try/catch return through finally. */
	| 'pending-return'
	/** Fallback when a node type has no known semantic construct mapping yet. */
	| 'unknown';

/**
 * The list of constructs the user can pick when editing a decision in the
 * playground. Loops and expandables have their own dropdowns elsewhere.
 *
 * NOTE: 'try' is no longer offered here. New diagrams use edge-labeled try
 * (incoming edge to try body labeled 'try'), not a try decision node.
 * Use edge labels ('try', 'exception', 'finally') instead.
 */
export const DECISION_CONSTRUCTS = ['if', 'switch'] as const;

/**
 * The list of constructs the user can pick when editing a loop.
 */
export const LOOP_CONSTRUCTS = [
	'while',
	'do-while',
	'for',
	'for-of',
	'for-in',
	'foreach',
] as const;

/**
 * The list of constructs the user can pick when editing an expandable.
 */
export const EXPANDABLE_CONSTRUCTS = ['function', 'hook'] as const;

/**
 * The list of action constructs that terminate local flow.
 */
export const TERMINATOR_CONSTRUCTS = ['return', 'throw', 'break', 'continue'] as const;

const DECISION_CONSTRUCT_SET = new Set<string>(DECISION_CONSTRUCTS);
const LOOP_CONSTRUCT_SET = new Set<string>(LOOP_CONSTRUCTS);
const TERMINATOR_CONSTRUCT_SET = new Set<string>(TERMINATOR_CONSTRUCTS);

export function isDecisionConstruct(construct: string): construct is (typeof DECISION_CONSTRUCTS)[number] {
	return DECISION_CONSTRUCT_SET.has(construct);
}

export function isLoopConstruct(construct: string): construct is (typeof LOOP_CONSTRUCTS)[number] {
	return LOOP_CONSTRUCT_SET.has(construct);
}

export function isTerminatorConstruct(
	construct: string,
): construct is (typeof TERMINATOR_CONSTRUCTS)[number] {
	return TERMINATOR_CONSTRUCT_SET.has(construct);
}

/**
 * Shared default construct mapping for editable node types.
 *
 * Fallback is configurable so existing callsites can preserve behavior for
 * non-semantic node kinds (action/start/end/merge).
 */
export function getDefaultConstructForNodeType(
	nodeType: string,
	fallbackForOther: Construct | 'action' = 'unknown',
): Construct | 'action' {
	switch (nodeType) {
		case 'decision':
			return 'if';
		case 'loop':
			return 'while';
		case 'expandable':
			return 'function';
		default:
			return fallbackForOther;
	}
}