/**
 * Design tokens for activity diagram nodes.
 *
 * All node components consume these instead of hard-coding colors / sizes.
 * Numeric tokens stay in sync with elk-layout.ts node-size estimates so
 * the rendered shape doesn't overflow its layouted bounding box.
 */
export const tokens = {
	ink: '#1f2328',
	inkSoft: '#57606a',
	paper: '#ffffff',
	border: '#1f2328',
	borderSoft: '#8c959f',
	expandableTint: '#eef6ee',
	expandableBorder: '#2da44e',
	shadow: '0 1px 2px rgba(0,0,0,0.06)',
	font:
		"ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
	mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
} as const;

/** All node wrappers share this width so ELK can predict layout sizes. */
export const NODE_WRAPPER_WIDTH = 200;

/** Visible diamond size for decision/loop nodes. */
export const DECISION_HEIGHT = 90;

/** Visible diamond size for merge nodes. */
export const MERGE_DIAMOND_SIZE = 40;

/** Wrapper height used by small-shape nodes (merge / initial / final). */
export const SMALL_SHAPE_WRAPPER_HEIGHT = 50;

/** Initial ("start") node circle diameter. */
export const INITIAL_DOT_SIZE = 28;

/** Final ("end") bull's-eye outer / inner sizes. */
export const FINAL_RING_SIZE = 32;
export const FINAL_DOT_SIZE = 18;