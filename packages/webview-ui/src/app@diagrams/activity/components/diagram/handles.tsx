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


type HandlesConfig = {
	flow: boolean;
	sides: boolean;
	sideInset?: number;
	flowInset?: number;
};



// Handles node handles.
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
			{}
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

			{}
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


export const HANDLE_CONFIGS = {
	
	flowOnly: { flow: true, sides: false } satisfies HandlesConfig,

	
	decision: { flow: true, sides: true, sideInset: 25 } satisfies HandlesConfig,

	
	mergeSmallShape: {
		flow: true,
		sides: true,
		sideInset: (NODE_WRAPPER_WIDTH - MERGE_DIAMOND_SIZE) / 2,
		flowInset: (SMALL_SHAPE_WRAPPER_HEIGHT - MERGE_DIAMOND_SIZE) / 2,
	} satisfies HandlesConfig,

	
	initialSmallShape: {
		flow: true,
		sides: true,
		sideInset: (NODE_WRAPPER_WIDTH - INITIAL_DOT_SIZE) / 2,
		flowInset: (SMALL_SHAPE_WRAPPER_HEIGHT - INITIAL_DOT_SIZE) / 2,
	} satisfies HandlesConfig,

	
	finalSmallShape: {
		flow: true,
		sides: true,
		sideInset: (NODE_WRAPPER_WIDTH - FINAL_RING_SIZE) / 2,
		flowInset: (SMALL_SHAPE_WRAPPER_HEIGHT - FINAL_RING_SIZE) / 2,
	} satisfies HandlesConfig,
} as const;