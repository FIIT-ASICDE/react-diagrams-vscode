import {
	Block
} from 'ts-morph';
import {
	StateDiagram,
} from '../../app@state-diagram-model/types';
import { asSrcFile } from './utils';
import { createComponentModel, resolveDefaultExportComponent } from './component';
import { collectStateVariables } from './state-variables';
import { classifyStateUpdateKind, populateStateUpdatesAndMutators } from './state-mutators';
import { buildTransitionFlowGraph, GraphBuilder } from './state-transitions';

/*

 Each state variable will be visualized in its
own frame, distinguished for example by color, and basic idea
behind behind the diagram generation process can summarize
this process like:
- Identify all state variables defined in the component.
- Create a dedicated frame for each variable containing its
name, type and default value.
- Generate base state diagram describing initialization behavior of the state variable, if any.
- Analyze each function in the component to determine
whether it modifies the given state variable.
- If so, extract the relevant logic and generate a state
diagram describing the transition. If it does not, ignore
it.
- Place the resulting diagram inside variables frame as a
sub-diagram, enclosed in a box representing the function
with its signature.
The states themselves will be represented as nodes with
their names being the values that the that the state variable can
take while transitions between the states will be represented
as directed edges, ”arrows” in layman’s term. Conditional
structures (if-else, try-catch, ...) will be represented as decision
nodes with multiple outgoing edges for different branches.
Loops will be represented with edges that loop to earlier nodes.

Rough workflow:
Step 1
	Detect React component and all useState declarations:
	const [value, setValue] = useState(...)

	For each state variable:
		store state name
		store setter name
		store initializer text
		try to infer type text

Step 2
	Find all setter call sites (functions that mutate state variable):
	setValue(...)
	record enclosing function name
	record surrounding control-flow context

Step 3
	Classify update style:
	direct literal: setX("done")
	direct identifier/expression: setX(something)
	updater callback: setX(prev => ...)

Step 4:
	Identify and find the best way/type to represent the transitions between states.
	Obtain the transitions between the states by analyzing the control flow of the each mutating functions and subsequently linking the updates to the transitions:
		Identify in which branches (if elses, switch statements, try catch) the state sets occur and construct the transitions accordingly.
			If elses, try catch, should become decision branches with subsequent merges.
		Loops should be incorporated into this with the backwards transitions cyclic transitions.
*/

export function parseReactComponent(reactComponent: string, rootDir = '.'): StateDiagram {
	const { sourceFile } = asSrcFile(reactComponent, rootDir);
	try {
		const component = resolveDefaultExportComponent(sourceFile);
		// console.debug(component);
		if (!component) {
			return {
				stateVariables: [],
				source: reactComponent
			};
		}

		const stateVariables = collectStateVariables(component, sourceFile);
		const mutatorBodies = populateStateUpdatesAndMutators(component, stateVariables);
		buildTransitionFlowGraph(mutatorBodies, stateVariables);

		return {
			component: createComponentModel(component, sourceFile),
			stateVariables,
			source: reactComponent
		};
	}
	// catch (error) {
	// 	console.error('Error parsing React component for state diagram', error);
	// 	return {
	// 		stateVariables: [],
	// 		source: reactComponent
	// 	};
	// }
	finally {
		sourceFile.delete();
	}
}