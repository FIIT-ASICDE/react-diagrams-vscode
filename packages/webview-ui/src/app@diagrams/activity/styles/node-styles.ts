import { tokens, NODE_WRAPPER_WIDTH, SMALL_SHAPE_WRAPPER_HEIGHT, DECISION_HEIGHT, ACTION_HEIGHT } from './design-tokens';

export const nodeStyles = {
	shell: {
		width: NODE_WRAPPER_WIDTH,
		position: 'relative' as const,
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		textAlign: 'center' as const,
		boxSizing: 'border-box' as const,
		fontFamily: tokens.font,
	},

	action: {
		width: NODE_WRAPPER_WIDTH,
		height: ACTION_HEIGHT,
		padding: '10px 16px',
		background: tokens.semanticNeutralTint,
		border: `1.5px solid ${tokens.semanticNeutralBorder}`,
		color: tokens.ink,
		textAlign: 'center' as const,
		boxSizing: 'border-box' as const,
		fontSize: 13,
		fontWeight: 600,
		boxShadow: tokens.shadow,
		lineHeight: 1.3,
	},

	actionDanger: {
		background: tokens.semanticDangerTint,
		border: `1.5px solid ${tokens.semanticDangerBorder}`,
		boxShadow: tokens.shadowStrong,
	},

	expandable: {
		width: NODE_WRAPPER_WIDTH,
		height: ACTION_HEIGHT,
		padding: '10px 16px',
		background: tokens.expandableTint,
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
		fontWeight: 700,
	},

	expandableDeps: {
		display: 'block',
		marginTop: 6,
		padding: '2px 5px',
		background: 'rgba(255,255,255,0.55)',
		border: '1px solid rgba(9,105,218,0.20)',
		fontSize: 11,
		color: tokens.inkSoft,
		fontFamily: tokens.mono,
		whiteSpace: 'normal' as const,
		overflowWrap: 'anywhere' as const,
		lineHeight: 1.2,
	},

	decisionWrap: {
		width: NODE_WRAPPER_WIDTH,
		height: DECISION_HEIGHT,
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		position: 'relative' as const,
		filter: 'drop-shadow(0 7px 10px rgba(31, 35, 40, 0.18))',
	},

	decisionLabel: {
		position: 'absolute' as const,
		inset: 0,
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		fontSize: 12,
		color: tokens.ink,
		fontWeight: 650,
		pointerEvents: 'none' as const,
		padding: '0 28px',
		textAlign: 'center' as const,
		lineHeight: 1.2,
	},

	decisionDiamond: {
		fill: tokens.semanticInfoTint,
		stroke: tokens.semanticInfoBorder,
		strokeWidth: 1.7,
	},

	loopDiamond: {
		fill: tokens.semanticLoopTint,
		stroke: tokens.semanticLoopBorder,
		strokeWidth: 1.7,
	},

	mergeDiamond: {
		fill: tokens.semanticSuccessTint,
		stroke: tokens.semanticSuccessBorder,
		strokeWidth: 1.7,
	},

	smallShapeWrap: {
		width: NODE_WRAPPER_WIDTH,
		height: SMALL_SHAPE_WRAPPER_HEIGHT,
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
	},

	initialDot: {
		width: 40,
		height: 40,
		background: tokens.ink,
		borderRadius: '50%',
		boxShadow: tokens.shadowStrong,
	},

	finalRing: {
		width: 40,
		height: 40,
		background: tokens.paper,
		borderRadius: '50%',
		border: `2.5px solid ${tokens.ink}`,
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		boxShadow: tokens.shadowStrong,
	},

	finalDot: {
		width: 25,
		height: 25,
		background: tokens.ink,
		borderRadius: '50%',
	},

	textPreview: {
		width: 700,
		minHeight: 220,
		padding: '14px 16px',
		background: tokens.paper,
		border: `1px solid ${tokens.borderSoft}`,
		color: tokens.ink,
		textAlign: 'left' as const,
		boxSizing: 'border-box' as const,
		whiteSpace: 'pre-wrap' as const,
		overflowWrap: 'anywhere' as const,
		lineHeight: 1.4,
		fontSize: 12,
		boxShadow: tokens.shadowStrong,
	},
} as const;