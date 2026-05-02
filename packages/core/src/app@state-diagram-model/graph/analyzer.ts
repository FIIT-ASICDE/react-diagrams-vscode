import type { Id, StateDiagram, StateMutatingFunction, StateUpdate, StateVariable } from '../types';

export interface StateDiagramGlobalMetrics {
	componentName?: string;
	stateVariableCount: number;
	mutatorCount: number;
	nodeCount: number;
	transitionCount: number;
}

export interface StateMutatorAnalytics {
	id: Id;
	name: string;
	args?: string;
	type: StateMutatingFunction['type'];
	nodeCount: number;
	transitionCount: number;
	reachedStates: StateUpdate[];
}

export interface StateVariableAnalytics {
	id: Id;
	name: string;
	hook: string;
	setterName: string;
	initializerText?: string;
	mutatorCount: number;
	nodeCount: number;
	transitionCount: number;
	reachedStates: StateUpdate[];
	mutators: StateMutatorAnalytics[];
}

export interface StateDiagramAnalytics {
	metrics: StateDiagramGlobalMetrics;
	stateVariables: StateVariableAnalytics[];
	source?: string;
}

const emptyAnalytics: StateDiagramAnalytics = {
	metrics: {
		stateVariableCount: 0,
		mutatorCount: 0,
		nodeCount: 0,
		transitionCount: 0,
	},
	stateVariables: [],
};

export function getMutatorAnalytics({id, name, args, type, ...mutator}: StateMutatingFunction): StateMutatorAnalytics {
	const stateDedup = new Set();
	const reachedStates = mutator.nodes.filter(n => {
		if (n.nodeType != 'state-update' || stateDedup.has(n.label)) 
			return false;
		stateDedup.add(n.label);
		return true;
	}) as StateUpdate[]

	return { id, name, args, type, nodeCount: mutator.nodes.length, transitionCount: mutator.transitions.length, reachedStates };
}

export function getStateVariableAnalytics({ id, name, hook, setterName, initializerText, ...stateVariable }: StateVariable): StateVariableAnalytics {
	const mutators = stateVariable.mutators ?? [];
	const mutatorAnalytics = mutators.map(getMutatorAnalytics);

	const nodeCount = mutatorAnalytics.reduce((sum, mutator) => sum + mutator.nodeCount, 0);
	const transitionCount = mutatorAnalytics.reduce((sum, mutator) => sum + mutator.transitionCount, 0);

	return { id, name, hook, setterName, initializerText, mutatorCount: mutatorAnalytics.length, nodeCount, transitionCount, reachedStates: stateVariable.states ?? [], mutators: mutatorAnalytics };
}

export function analyzeStateDiagram(diagram?: StateDiagram): StateDiagramAnalytics {
	if (!diagram)
		return emptyAnalytics;

	const stateVariables = diagram.stateVariables.map(getStateVariableAnalytics);

	return {
		metrics: {
			componentName: diagram.component?.name,
			stateVariableCount: stateVariables.length,
			mutatorCount: stateVariables.reduce((sum, stateVariable) => sum + stateVariable.mutatorCount, 0),
			nodeCount: stateVariables.reduce((sum, stateVariable) => sum + stateVariable.nodeCount, 0),
			transitionCount: stateVariables.reduce((sum, stateVariable) => sum + stateVariable.transitionCount, 0),
		},
		stateVariables,
		source: diagram.source,
	};
}