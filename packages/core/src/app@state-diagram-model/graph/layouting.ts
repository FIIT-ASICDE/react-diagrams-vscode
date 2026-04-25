import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkNode } from 'elkjs/lib/elk-api';
import type { StateGraphNode, StateMutatingFunction, StateVariable } from '../types';
import { LayoutOptions } from './ElkLayoutOptions';

const elk = new ELK();

export const elkPadd = (top: number, horizontal: number, bottom = horizontal) => `[top=${top},left=${horizontal},bottom=${bottom},right=${horizontal}]`;

const LAYOUT = {
	canvasPadding: 12,
	headerHeight: 25,
	
	state: {
		gap: 24,
		pad: 22,
		minWidth: 200,
		minHeight: 100,
	},
	mutator: {
		gap: 18,
		pad: 38,
		minWidth: 200,
		minHeight: 100,
	},

	graphNodeWidth: 165,
	graphNodeHeight: 46,
};

export const STATE_DIAGRAM_LAYOUT = LAYOUT;

export const ELK_OPTIONS: LayoutOptions = {
	'elk.algorithm': 'layered',
	'elk.direction': 'DOWN',

	'elk.layered.spacing.nodeNodeBetweenLayers': '64',
	'elk.layered.cycleBreaking.strategy': 'DEPTH_FIRST',
	'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
	'elk.layered.nodePlacement.favorStraightEdges': 'true',
	'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
	'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
	'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
	'elk.layered.feedbackEdges': 'true',

	"elk.spacing.edgeNode": "32",
	"elk.layered.spacing.edgeNodeBetweenLayers": "20",
	"elk.spacing.portConnection": "30", // dist edge goes down from node
	'elk.layered.allowNonFlowPortsToSwitchSides': 'true',
	'elk.portConstraints': 'FIXED_SIDE',
	'elk.edgeRouting': 'POLYLINE',

	'elk.spacing.nodeNode': '50',
	'elk.padding': elkPadd(LAYOUT.headerHeight + LAYOUT.mutator.pad, LAYOUT.mutator.pad),

	// 'elk.edgeLabels.placement': 'CENTER',
	// 'elk.edgeLabels.inline': 'true',
	// 'elk.edgeLabels.sideSelection': 'UNDEFINED',
	// 'elk.nodeSize.constraints': 'NODE_LABELS',
	// 'elk.layered.edgeLabels.centerLabelPlacementStrategy': 'MEDIAN_SEGMENT',
};

export const ELK_BOX_ROW_OPTIONS: LayoutOptions = {
	'elk.algorithm': 'layered',
	'elk.direction': 'DOWN',
	'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
};

export function getGraphNodeSize({ nodeType, kind, ...node }: StateGraphNode) {
	if (nodeType == 'state-update')
		return { width: LAYOUT.graphNodeWidth, height: LAYOUT.graphNodeHeight };

	if (kind == 'decision' || kind == 'try-decision' || kind == 'switch-decision' || kind == 'loop-decision' || kind == 'merge')
		return { width: 64, height: 44 };

	return { width: 38, height: 38 };
}

export async function layoutMutator(mutator: StateMutatingFunction, elkLayout: LayoutOptions = {}) {
	const layoutOptions = { ...ELK_OPTIONS, ...elkLayout };
	if (mutator.nodes.length < 4)
		layoutOptions['elk.layered.spacing.nodeNodeBetweenLayers'] = `${+(layoutOptions['elk.layered.spacing.nodeNodeBetweenLayers'] ?? 1) / 2}`;

	const graph = {
		id: `elk-${mutator.id}`,
		layoutOptions,
		children: mutator.nodes.map(node => ({ 
			...node, 
			...getGraphNodeSize(node)
		})),
		edges: mutator.transitions.map(transition => ({
			sources: [transition.fromNodeId],
			targets: [transition.toNodeId],
			// labels: transition.label ? [{ id: `elk-label-${transition.fromNodeId}-${transition.toNodeId}`, text: transition.label, width: (transition.label.length * 12*0.6), height: 21 }] : undefined,
			...transition
		})),
	};

	const { children = [], edges: transitions, width = 0, height = 0 } = await elk.layout<ElkNode & {
		children: (StateGraphNode & ElkNode)[]
		edges: typeof graph.edges;
	}>(graph);
	const layoutedNodes = children.map(node => ({x: 0, y: 0, width: 0, height: 0, ...node}));

	return {
		...mutator,
		layoutedNodes,
		transitions,
		width: Math.max(LAYOUT.mutator.minWidth, width ?? 0),
		height: Math.max(LAYOUT.mutator.minHeight, height ?? 0),
	};
}

export async function layoutBoxRow<T extends ElkNode>(items: T[], { gap, padding, minWidth = 0, minHeight = 0 }: { gap: number; padding?: string; minWidth?: number; minHeight?: number }) {
	const graph = {
		id: `elk-box-row-${items?.[0]?.id ?? 'empty'}.join('-')}`,
		layoutOptions: {
			...ELK_BOX_ROW_OPTIONS,
			'elk.spacing.componentComponent': `${gap}`,
			...(padding ? { 'elk.padding': padding } : {}),
		},
		children: items,
		edges: [],
	};

	const { children = [], width = 0, height = 0 } = await elk.layout<ElkNode & { children: T[] }>(graph);
	const layoutedItems = children.map(item => ({x: 0, y: 0, width: 0, height: 0, ...item}));

	const maxX = layoutedItems.length ? Math.max(...layoutedItems.map((item) => item.x + item.width)) : 0;
	const maxY = layoutedItems.length ? Math.max(...layoutedItems.map((item) => item.y + item.height)) : 0;

	return {
		layoutedItems,
		width: Math.max(minWidth, width ?? maxX),
		height: Math.max(minHeight, height ?? maxY),
	};
}

export async function layoutStateVariable(stateVariable: StateVariable, elkLayout: LayoutOptions = {}) {
	const mutators = stateVariable.mutators ?? [];
	const mutatorLayouts = await Promise.all(mutators.map(mut => layoutMutator(mut, elkLayout)));

	const { layoutedItems: layoutedMutators, width, height } = await layoutBoxRow(mutatorLayouts, {
		gap: LAYOUT.mutator.gap,
		padding: elkPadd(LAYOUT.headerHeight + LAYOUT.state.pad, LAYOUT.state.pad),
		minWidth: LAYOUT.state.minWidth,
		minHeight: LAYOUT.state.minHeight,
	});
	return {
		...stateVariable,
		layoutedMutators,
		width,
		height,
	};
}