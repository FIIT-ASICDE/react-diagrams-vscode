export type FlowNodeData = {
	label: string;
	sourceText?: string;
	nodeKind?: string;
	hasFalseBranch?: boolean;
};

export type FlowGraph = {
	nodes: import('@xyflow/react').Node[];
	edges: import('@xyflow/react').Edge[];
};
