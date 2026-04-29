export const tokens = {
	// base
	ink: '#111827',
	inkSoft: '#4b5563',
	paper: '#ffffff',

	// borders
	border: '#111827',
	borderSoft: '#d1d5db',

	// neutral nodes
	semanticNeutralTint: '#f9fafb',
	semanticNeutralBorder: '#9ca3af',

	// activity / action nodes
	semanticInfoTint: '#eef6ff',
	semanticInfoBorder: '#2563eb',

	// loops
	semanticLoopTint: '#f5f0ff',
	semanticLoopBorder: '#7c3aed',

	// success / final
	semanticSuccessTint: '#ecfdf3',
	semanticSuccessBorder: '#16a34a',

	// decisions / merge
	semanticWarningTint: '#fff7db',
	semanticWarningBorder: '#ca8a04',

	// danger / error
	semanticDangerTint: '#fff1f2',
	semanticDangerBorder: '#e11d48',

	// expandable / collapsed details
	expandableTint: '#ecfeff',
	expandableBorder: '#0891b2',

	// shapes
	initialDotFill: '#111827',
	finalRingBorder: '#111827',
	finalDotFill: '#111827',
	decisionFill: '#fff7db',
	decisionBorder: '#ca8a04',
	mergeFill: '#f9fafb',
	mergeBorder: '#6b7280',

	// edges / arrows
	edge: '#64748b',
	edgeActive: '#2563eb',
	edgeMuted: '#cbd5e1',

	// shadows
	shadow: '0 4px 10px rgba(17, 24, 39, 0.08), 0 1px 3px rgba(17, 24, 39, 0.06)',
	shadowStrong: '0 8px 22px rgba(17, 24, 39, 0.14), 0 2px 6px rgba(17, 24, 39, 0.08)',

	// fonts
	font:
		"Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
	mono: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
} as const;

export const NODE_WRAPPER_WIDTH = 200;
export const DECISION_HEIGHT = 90;
export const MERGE_DIAMOND_SIZE = 40;
export const ACTION_HEIGHT = 45;
export const SMALL_SHAPE_WRAPPER_HEIGHT = 50;
export const INITIAL_DOT_SIZE = 40;
export const FINAL_RING_SIZE = 40;
export const FINAL_DOT_SIZE = 25;