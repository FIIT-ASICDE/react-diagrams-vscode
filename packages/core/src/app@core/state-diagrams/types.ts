export type StateHookKind = 'useState';

export interface StateDiagramComponent {
	name: string;
	line: number;
	column: number;
	exportName: 'default';
	declarationKind: 'function' | 'arrow-function' | 'function-expression';
}

export interface StateVariable {
	id: string;
	hook: StateHookKind;
	name: string;
	setterName: string;
	initializerText?: string;
	typeText?: string;
	line: number;
	column: number;
}

export type StateUpdateKind = 'direct' | 'expression' | 'updater';

export interface StateUpdate {
	id: string;
	stateVariableId: string;
	setterName: string;
	kind: StateUpdateKind;
	line: number;
	column: number;
	enclosingFunctionName?: string;
	expressionText?: string;
}

export interface StateDiagram {
	component: StateDiagramComponent | null;
	stateVariables: StateVariable[];
	updates: StateUpdate[];
}
