import { CodePos } from "./parser/types";

export type FunctionDeclarationKind = 'function' | 'arrow-function' | 'function-expression';

export type StateHookKind = 'useState';

export type Id = string /*| number*/;

export interface StateDiagramComponent {
	name: string;
	pos: CodePos;
	exportName: 'default';
	declarationKind: FunctionDeclarationKind;
}

export interface StateVariable {
	id: Id;
	hook: StateHookKind;
	name: string;
	setterName: string;
	initializerText?: string;
	typeText?: string;
	pos: CodePos;

	inlineMutator?: StateMutatingFunction; // Setter calls in component render-body (outside nested function declarations).

	states?: StateUpdate[]; // This will be populated later with the updates related to all the states this variable can reach in all functions that mut it.
	mutators?: StateMutatingFunction[]; // All the functions that mutate this state variable.
}

export interface StateMutatingFunction { // A function that mutates a specific StateVariable.
	id: Id;
	name: string;
	pos: CodePos;
	type: FunctionDeclarationKind;
	// Add more info if needed, like parameters, etc. 

	//states: StateUpdate[]; // All the states reachable in this function for a specific state variable. Same objects will be shared with StateVariable.states.
	nodes: StateGraphNode[]; // Ordered list of graph nodes (state updates and control-flow structure) in this function.
	transitions: StateTransition[]; // Directed edges connecting the graph nodes.
}

export type StateUpdateKind = 
	'direct' |
	'expression' |
	'updater';


export type ControlFlowNodeKind = 
	'entry' |
	'decision' |
	'try-decision' |
	'merge' |
	'exit' |
	'throw';

export type StateGraphNodeType = 
	'state-update' |
	'control-flow';

export type StateGraphNode = StateUpdate | ControlFlowNode;

export interface ControlFlowNode {
	id: Id;
	nodeType: 'control-flow';
	kind: ControlFlowNodeKind;
	label?: string; // txt for decision nodes
	pos: CodePos;
}

export interface StateUpdate {
	id: Id;
	nodeType: 'state-update';
	stateVariableId: Id;
	setterName: string;
	kind: StateUpdateKind;
	pos: CodePos;
	label?: string; // expression txt
}

export enum StateTransitionKind {
	Normal = 'normal',
	Then = 'then',
	Else = 'else',
	Catch = 'catch',
	Finally = 'finally',
	Return = 'return',
	Throw = 'throw',
}

// export type StateTransitionKind = 
// 	'normal' |
// 	'then' |
// 	'else' |
// 	'catch' |
// 	'finally' |
// 	'return' |
// 	'throw';

export interface StateTransition {
	id: Id;
	fromNodeId: Id;
	toNodeId: Id;
	kind: StateTransitionKind;
	label: string;
	rawConditionText?: string;
}

export interface StateDiagram {
	component?: StateDiagramComponent;
	stateVariables: StateVariable[];
	source?: string; // Orig component source code or path to source file
}
