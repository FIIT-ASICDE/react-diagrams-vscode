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
	 * `try` / `catch`. The decision's "no-label" branch is the try body,
	 * the `exception`-labeled branch is the catch body. Note: try is a
	 * decision in our graph (two branches) even though syntactically it
	 * isn't an `if`.
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
	/** Fallback when a node type has no known semantic construct mapping yet. */
	| 'unknown';

/**
 * The list of constructs the user can pick when editing a decision in the
 * playground. Loops and expandables have their own dropdowns elsewhere.
 */
export const DECISION_CONSTRUCTS = ['if', 'switch', 'try'] as const;

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