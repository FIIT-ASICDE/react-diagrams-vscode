import { tokens, NODE_WRAPPER_WIDTH, SMALL_SHAPE_WRAPPER_HEIGHT } from './design-tokens';

/**
 * Shared inline styles for activity diagram node components.
 * Each node's visual is a child of a 200-px-wide shell so ELK can predict
 * its bounding box; the visible shape inside can be smaller.
 */
export const nodeStyles = {
	shell: {
		width: NODE_WRAPPER_WIDTH,
		position: 'relative' as const,
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		boxSizing: 'border-box' as const,
		fontFamily: tokens.font,
	},

	// Stadium shape (rounded pill) — classic UML activity action.
	action: {
		width: NODE_WRAPPER_WIDTH,
		minHeight: 44,
		padding: '10px 16px',
		background: tokens.paper,
		borderRadius: 22,
		border: `1.5px solid ${tokens.border}`,
		color: tokens.ink,
		textAlign: 'center' as const,
		boxSizing: 'border-box' as const,
		fontSize: 13,
		fontWeight: 500,
		boxShadow: tokens.shadow,
		lineHeight: 1.3,
	},

	// Same stadium, tinted to mark it as drillable.
	expandable: {
		width: NODE_WRAPPER_WIDTH,
		minHeight: 44,
		padding: '10px 16px',
		background: tokens.expandableTint,
		borderRadius: 22,
		border: `1.5px solid ${tokens.expandableBorder}`,
		color: tokens.ink,
		textAlign: 'center' as const,
		boxSizing: 'border-box' as const,
		fontSize: 13,
		boxShadow: tokens.shadow,
		lineHeight: 1.3,
	},

	expandableLabel: {
		display: 'block',
		fontWeight: 600,
	},

	expandableDeps: {
		display: 'block',
		marginTop: 6,
		fontSize: 11,
		color: tokens.inkSoft,
		fontFamily: tokens.mono,
		whiteSpace: 'normal' as const,
		overflowWrap: 'anywhere' as const,
		lineHeight: 1.2,
	},

	// Wrapper for the diamond-shaped decision/loop node.
	decisionWrap: {
		width: NODE_WRAPPER_WIDTH,
		height: 90,
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		position: 'relative' as const,
	},

	decisionLabel: {
		position: 'absolute' as const,
		inset: 0,
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		fontSize: 12,
		color: tokens.ink,
		fontWeight: 500,
		pointerEvents: 'none' as const,
		padding: '0 28px',
		textAlign: 'center' as const,
		lineHeight: 1.2,
	},

	// Centered wrapper for small-shape nodes (merge / initial / final).
	smallShapeWrap: {
		width: NODE_WRAPPER_WIDTH,
		height: SMALL_SHAPE_WRAPPER_HEIGHT,
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
	},

	initialDot: {
		width: 28,
		height: 28,
		background: tokens.ink,
		borderRadius: '50%',
	},

	finalRing: {
		width: 32,
		height: 32,
		background: tokens.paper,
		borderRadius: '50%',
		border: `2px solid ${tokens.ink}`,
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
	},

	finalDot: {
		width: 18,
		height: 18,
		background: tokens.ink,
		borderRadius: '50%',
	},

	textPreview: {
		width: 700,
		minHeight: 220,
		padding: '14px 16px',
		background: tokens.paper,
		borderRadius: 8,
		border: `1px solid ${tokens.borderSoft}`,
		color: tokens.ink,
		textAlign: 'left' as const,
		boxSizing: 'border-box' as const,
		whiteSpace: 'pre-wrap' as const,
		overflowWrap: 'anywhere' as const,
		lineHeight: 1.4,
		fontSize: 12,
		boxShadow: tokens.shadow,
	},
} as const;