import React from 'react';
import { Handle, Position } from '@xyflow/react';
import {
	FINAL_RING_SIZE,
	INITIAL_DOT_SIZE,
	MERGE_DIAMOND_SIZE,
	NODE_WRAPPER_WIDTH,
	SMALL_SHAPE_WRAPPER_HEIGHT,
} from '../../styles/design-tokens';

const VISIBLE_HANDLE_STYLE: React.CSSProperties = {
	opacity: 1,
	width: 2,
	height: 2,
	background: 'black',
	border: 'transparent',
};

const HIDDEN_HANDLE_STYLE: React.CSSProperties = {
	opacity: 0,
	width: 0,
	height: 0,
	minWidth: 0,
	minHeight: 0,
	background: 'transparent',
	border: 'transparent',
	pointerEvents: 'none',
};

/**
 * Configuration for one node's hidden handles.
 *
 *   - `flow`: vertical (top in / bottom out) — used by all nodes
 *   - `sides`: horizontal (left/right both in and out) — used by decision /
 *     loop / merge / initial / final, where the layouter routes branches
 *     and back-edges through the sides
 *   - `sideInset`: visual offset for the side handles. Decision/loop diamonds
 *     are 200px wide but the visible shape is narrower, so the handles need
 *     to sit closer to the centerline (~25). Merge/initial/final diamonds
 *     are tiny (~40px) inside a 200px wrapper, so the handles sit far from
 *     the wrapper edges (~75).
 */
type HandlesConfig = {
	flow: boolean;
	sides: boolean;
	sideInset?: number;
	flowInset?: number;
};

/**
 * Render the full set of target+source handles for a node according to its
 * config. Replaces four near-duplicate helper functions in the legacy code.
 */
export function NodeHandles({
	isConnectable,
	config,
}: {
	isConnectable: boolean;
	config: HandlesConfig;
}) {
	const sideInset = config.sideInset ?? 0;
	const flowInset = config.flowInset ?? 0;
	const handleStyle = isConnectable ? VISIBLE_HANDLE_STYLE : HIDDEN_HANDLE_STYLE;

	return (
		<>
			{/* Targets */}
			{config.flow && (
				<Handle
					id="target-top"
					type="target"
					position={Position.Top}
					isConnectable={isConnectable}
					style={{ ...handleStyle, top: flowInset }}
				/>
			)}
			{config.sides && (
				<>
					<Handle
						id="target-left"
						type="target"
						position={Position.Left}
						isConnectable={isConnectable}
						style={{ ...handleStyle, left: sideInset }}
					/>
					<Handle
						id="target-right"
						type="target"
						position={Position.Right}
						isConnectable={isConnectable}
						style={{ ...handleStyle, right: sideInset }}
					/>
				</>
			)}

			{/* Sources */}
			{config.flow && (
				<Handle
					id="source-bottom"
					type="source"
					position={Position.Bottom}
					isConnectable={isConnectable}
					style={{ ...handleStyle, bottom: flowInset }}
				/>
			)}
			{config.sides && (
				<>
					<Handle
						id="source-left"
						type="source"
						position={Position.Left}
						isConnectable={isConnectable}
						style={{ ...handleStyle, left: sideInset }}
					/>
					<Handle
						id="source-right"
						type="source"
						position={Position.Right}
						isConnectable={isConnectable}
						style={{ ...handleStyle, right: sideInset }}
					/>
				</>
			)}
		</>
	);
}

/** Predefined configs used by the node components. */
export const HANDLE_CONFIGS = {
	/** Action / expandable / textPreview — only flow handles, no sides. */
	flowOnly: { flow: true, sides: false } satisfies HandlesConfig,

	/** Decision / loop — narrow diamond, side handles close to centerline. */
	decision: { flow: true, sides: true, sideInset: 25 } satisfies HandlesConfig,

	/** Merge diamond (40x40 inside 200x50 wrapper). */
	mergeSmallShape: {
		flow: true,
		sides: true,
		sideInset: (NODE_WRAPPER_WIDTH - MERGE_DIAMOND_SIZE) / 2,
		flowInset: (SMALL_SHAPE_WRAPPER_HEIGHT - MERGE_DIAMOND_SIZE) / 2,
	} satisfies HandlesConfig,

	/** Initial node dot (28x28 inside 200x50 wrapper). */
	initialSmallShape: {
		flow: true,
		sides: true,
		sideInset: (NODE_WRAPPER_WIDTH - INITIAL_DOT_SIZE) / 2,
		flowInset: (SMALL_SHAPE_WRAPPER_HEIGHT - INITIAL_DOT_SIZE) / 2,
	} satisfies HandlesConfig,

	/** Final node ring (32x32 inside 200x50 wrapper). */
	finalSmallShape: {
		flow: true,
		sides: true,
		sideInset: (NODE_WRAPPER_WIDTH - FINAL_RING_SIZE) / 2,
		flowInset: (SMALL_SHAPE_WRAPPER_HEIGHT - FINAL_RING_SIZE) / 2,
	} satisfies HandlesConfig,
} as const;