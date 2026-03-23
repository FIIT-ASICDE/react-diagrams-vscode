import { CodePos } from "./parser/types";

export type FunctionDeclarationKind = 'function' | 'arrow-function' | 'function-expression';

export type StateHookKind = 'useState';

export interface StateDiagramComponent {
	name: string;
	pos: CodePos;
	exportName: 'default';
	declarationKind: FunctionDeclarationKind;
}

export interface StateVariable {
	id: string;
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
	id: string;
	name: string;
	pos: CodePos;
	type: FunctionDeclarationKind;
	// Add more info if needed, like parameters, etc. 

	states: StateUpdate[]; // All the states reachable in this function for a specific state variable. Same objects will be shared with StateVariable.states.
	//graph: ? TODO // Graph representing the state diagram of transitions between states in this function for a specific state variable. 
}

export type StateUpdateKind = 'direct' | 'expression' | 'updater';

export interface StateUpdate {
	id: string;
	stateVariableId: string;
	setterName: string;
	kind: StateUpdateKind;
	pos: CodePos;
	expressionText?: string;
}

export interface StateDiagram {
	component?: StateDiagramComponent;
	stateVariables: StateVariable[];
}
