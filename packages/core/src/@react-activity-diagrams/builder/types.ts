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
	 * For loop nodes only. Tells CodeGen which loop syntax to emit so that
	 * round-trip code → diagram → code preserves the original loop shape.
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
	 * For "try" action nodes only. Verbatim original try/catch/finally
	 * source so CodeGen can emit it as-is instead of reconstructing it
	 * from the graph.
	 */
	originalSource?: string;

	/**
	 * Legacy — kept for compatibility with diagrams that still encode
	 * for-of / for-in via separate sourceText (iterable) and loopBinding
	 * fields. New parser puts everything into forHeader.
	 */
	loopBinding?: string;
};

export type FlowGraph = {
	nodes: import('@xyflow/react').Node[];
	edges: import('@xyflow/react').Edge[];
};