export type LoopKind = 'while' | 'do-while' | 'for' | 'for-in' | 'for-of' | 'foreach';

import type { Construct } from '../code-snippet/shared/construct';

export type FlowNodeData = {
	label: string;
	sourceText?: string;
	
	construct?: Construct;
	nodeKind?: string;
	deps?: string;
	loopLabel?: string;
	loopKind?: LoopKind;
	forHeader?: string;
	forOfBinding?: string;
	forEachIterable?: string;
	forEachCallee?: string;
	forEachParams?: string;
};

export type FlowGraph = {
	nodes: import('@xyflow/react').Node[];
	edges: import('@xyflow/react').Edge[];
};

