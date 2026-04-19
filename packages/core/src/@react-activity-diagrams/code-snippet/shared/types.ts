export type FuncArg = {
	name: string;
	type?: string;
};

export const START_EDGE_SOURCE_ID = "start_1";

export type NodeData = {
	label?: unknown;
	isExpanded?: unknown;
	sourceText?: unknown;
};

export type HookKind = "useEffect" | "useMemo" | "useCallback";

export type HookSpec = {
	kind: HookKind;
	deps: string;
};
