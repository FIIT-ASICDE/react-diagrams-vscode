export type FlowNodeData = {
	label: string;
	sourceText?: string;
	nodeKind?: string;
	hasFalseBranch?: boolean;
	deps?: string;
};

export type FlowGraph = {
	nodes: import('@xyflow/react').Node[];
	edges: import('@xyflow/react').Edge[];
};
