export type LoopKind = 'while' | 'do-while' | 'for' | 'for-in' | 'for-of' | 'foreach';

import type { Construct } from '../code-snippet/shared/construct';

export type FlowNodeData = {
	label: string;
	sourceText?: string;
	/** Canonical semantic tag used by parser and CodeGen dispatch. */
	construct?: Construct;
	nodeKind?: string;
	hasFalseBranch?: boolean;
	deps?: string;

	/**
	 * Loop nodes only. Labeled-statement label (`outer:` in
	 * `outer: while (...)`). CodeGen emits `<loopLabel>:` on the line
	 * before the loop, so `break outer;` / `continue outer;` round-trip
	 * faithfully.
	 *
	 * Currently set only on loops where the loop NODE is the BuildResult
	 * entry — i.e. while / for / for-of / for-in / foreach. For do-while
	 * the entry is the body, so labels on do-while are lossy on
	 * re-emission (still honoured for break/continue lookup though).
	 */
	loopLabel?: string;

	/**
	 * Legacy — still set by the parser for now alongside `construct` so
	 * that existing diagrams continue to work. Tells CodeGen which loop
	 * syntax to emit when `construct` is missing.
	 */
	loopKind?: LoopKind;

	/**
	 * For for / for-in / for-of loop nodes. The complete header text inside
	 * the parentheses, ready to be emitted as `for (<forHeader>) { ... }`.
	 *
	 * Examples:
	 *   classical for: `let i = 0; i < n; i++`
	 *   for-of:        `const item of items`
	 *   for-in:        `const key in object`
	 *
	 * Storing the header on the loop node itself (instead of as separate
	 * action nodes for init / increment) is what makes round-trip stable —
	 * otherwise CodeGen has no reliable way to tell which surrounding
	 * action nodes "belong" to the loop, and ends up duplicating them on
	 * every parse → generate cycle.
	 */
	forHeader?: string;

	/**
	 * for-of / for-in only. Initializer text, e.g. `const item` or
	 * `let key`. CodeGen emits `for (<forOfBinding> <of|in> <sourceText>)`.
	 */
	forOfBinding?: string;

	/**
	 * forEach-like only. CodeGen reconstructs:
	 *   `${forEachIterable}.${forEachCallee}(${forEachParams} => { body })`
	 *
	 * Body lives in the graph, NOT in any sourceText.
	 */
	forEachIterable?: string;
	forEachCallee?: string;
	forEachParams?: string;

	/**
	 * For "try" action nodes only. Verbatim original try/catch/finally
	 * source so CodeGen can emit it as-is instead of reconstructing it
	 * from the graph.
	 */
	originalSource?: string;

	/**
	 * Legacy — kept for compatibility with diagrams that still encode
	 * for-of / for-in via separate sourceText (iterable) and loopBinding
	 * fields. New parser puts everything into forOfBinding.
	 */
	loopBinding?: string;
};

export type FlowGraph = {
	nodes: import('@xyflow/react').Node[];
	edges: import('@xyflow/react').Edge[];
};

