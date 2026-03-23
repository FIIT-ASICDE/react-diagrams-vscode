import {
	CallExpression,
	FunctionExpression,
	Node,
	SourceFile,
	SyntaxKind,
	VariableDeclaration,
} from 'ts-morph';
import {
	StateDiagram,
	StateMutatingFunction,
	StateUpdate,
	StateUpdateKind,
	StateVariable,
} from '../types';
import { createId, getBindingElementName, getCodePos, getDeclarationKind, getFirstAncestorOfKinds, getFuncName, normText, text2SrcFile, truncate } from './utils';

import { SupportedComponentDeclaration, SupportedDeclaration } from './types';
import { createComponentModel, resolveDefaultExportComponent } from './component';

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
*/

/* State variables population */

/** Returns a call expression when a node matches a tracked useState invocation. */
function getTrackedUseStateCall(node: Node | undefined, useStateIdentifiers: Set<string>): CallExpression | undefined {
	if (!node || !Node.isCallExpression(node))
		return;

	const expression = node.getExpression();
	if (Node.isIdentifier(expression))
		return useStateIdentifiers.has(expression.getText()) ? node : undefined;

	if (Node.isPropertyAccessExpression(expression))
		return expression.getName() == 'useState' ? node : undefined;
}

/** Collects local identifier names that refer to React's useState import. */
function collectUseStateIdentifiers(sourceFile: SourceFile) {
	const identifiers = new Set<string>(['useState']);

	for (const importDeclaration of sourceFile.getImportDeclarations()) {
		if (importDeclaration.getModuleSpecifierValue() != 'react')
			continue;

		for (const namedImport of importDeclaration.getNamedImports()) {
			if (namedImport.getName() == 'useState')
				identifiers.add(namedImport.getAliasNode()?.getText() ?? namedImport.getName());
		}
	}

	return identifiers;
}

/** Infers a human-readable type string from a useState call and its initializer. */
function inferStateTypeText(callExpression: Node) {
	if (!Node.isCallExpression(callExpression))
		return;

	const typeArgument = callExpression.getTypeArguments()[0];
	if (typeArgument)
		return truncate(typeArgument.getText(), 120);

	const initializer = callExpression.getArguments()[0];
	if (!initializer)
		return;

	if (
		Node.isStringLiteral(initializer) ||
		initializer.getKind() == SyntaxKind.NoSubstitutionTemplateLiteral ||
		Node.isTemplateExpression(initializer)
	) {
		return 'string';
	}

	if (Node.isNumericLiteral(initializer))
		return 'number';

	if (initializer.getKind() == SyntaxKind.TrueKeyword || initializer.getKind() == SyntaxKind.FalseKeyword)
		return 'boolean';

	if (initializer.getKind() == SyntaxKind.NullKeyword)
		return 'null';

	return truncate(initializer.getType().getText(initializer), 120);
}

/** Checks whether a declaration belongs directly to the component's top-level scope. */
function isDirectlyOwnedByComponent(declaration: Node, component: SupportedComponentDeclaration) {
	return getFirstAncestorOfKinds(declaration, [Node.isFunctionDeclaration, Node.isFunctionExpression, Node.isArrowFunction, Node.isMethodDeclaration,]) == component
}

/** Extracts component-owned useState declarations and creates initial StateVariable models. */
function collectStateVariables(sourceFile: SourceFile, component: SupportedComponentDeclaration) {
	const body = component.getBody();
	if (!body || !Node.isBlock(body))
		return [];

	const useStateIdentifiers = collectUseStateIdentifiers(sourceFile);
	const declarations = body.getDescendantsOfKind(SyntaxKind.VariableDeclaration);
	const stateVariables: StateVariable[] = [];

	for (const declaration of declarations) {
		if (!isDirectlyOwnedByComponent(declaration, component))
			continue;

		const nameNode = declaration.getNameNode();
		if (!Node.isArrayBindingPattern(nameNode))
			continue;

		const initializer = declaration.getInitializer();
		const useStateCall = getTrackedUseStateCall(initializer, useStateIdentifiers);
		if (!useStateCall)
			continue;

		const [stateElement, setterElement] = nameNode.getElements();
		const stateName = getBindingElementName(stateElement);
		const setterName = getBindingElementName(setterElement);
		if (!stateName || !setterName || !Node.isBindingElement(stateElement))
			continue;

		const pos = getCodePos(sourceFile, stateElement.getNameNode());
		const stateVariable: StateVariable = {
			id: createId('state', stateName, pos),
			hook: 'useState',
			name: stateName,
			setterName,
			initializerText: useStateCall.getArguments()[0]?.getText(),
			typeText: inferStateTypeText(useStateCall),
			pos,

			states: [],
			mutators: [],
			// inlineMutator: undefined,
		};

		stateVariables.push(stateVariable);
	}

	return stateVariables;
}

/* State updates and mutators population */

/** Classifies setter-call argument shape into direct, expression, or updater update kind. */
function classifyStateUpdateKind(argument?: Node): StateUpdateKind {
	if (!argument)
		return 'expression';

	if (Node.isArrowFunction(argument) || Node.isFunctionExpression(argument))
		return 'updater';

	if (
		Node.isStringLiteral(argument) ||
		Node.isNumericLiteral(argument) ||
		argument.getKind() == SyntaxKind.TrueKeyword ||
		argument.getKind() == SyntaxKind.FalseKeyword ||
		argument.getKind() == SyntaxKind.NullKeyword ||
		argument.getKind() == SyntaxKind.NoSubstitutionTemplateLiteral
	) {
		return 'direct';
	}

	return 'expression';
}

/** Builds a StateUpdate object from a matched setter call expression. */
function createStateUpdate(stateVariable: StateVariable, callExpression: CallExpression, sourceFile: SourceFile) {
	const arg = callExpression.getArguments()[0];
	const expressionText = arg ? normText(arg) : undefined;
	const kind = classifyStateUpdateKind(arg);
	const pos = getCodePos(sourceFile, callExpression);

	const update: StateUpdate = {
		id: createId('update', `${stateVariable.name}:${kind}:${expressionText ?? '<none>'}`, pos),
		stateVariableId: stateVariable.id,
		setterName: stateVariable.setterName,
		kind,
		pos,
		expressionText,
	};

	return update;
}

/** Gets or creates the dedicated render-body mutator for top-level setter calls. */
function getOrCreateInlineMutator(stateVariable: StateVariable, sourceFile: SourceFile, component: SupportedComponentDeclaration) {
	if (stateVariable.inlineMutator)
		return stateVariable.inlineMutator;

	const pos = getCodePos(sourceFile, component);
	const mutator: StateMutatingFunction = {
		id: createId('mutator', `${stateVariable.name}:<render-body>`, pos),
		name: '<render-body>',
		pos,
		type: getDeclarationKind(component),
		states: [],
	};

	stateVariable.inlineMutator = mutator;
	return mutator;
}

/** Gets or creates a mutator model for a specific state variable and function scope. */
function getOrCreateMutator(stateVariable: StateVariable, sourceFile: SourceFile, component: SupportedComponentDeclaration, funcLike?: SupportedDeclaration) {
	stateVariable.mutators ??= [];

	if (!funcLike)
		return getOrCreateInlineMutator(stateVariable, sourceFile, component);

	const pos = getCodePos(sourceFile, funcLike);
	const type = getDeclarationKind(funcLike);
	const existing = stateVariable.mutators.find((mutator) => mutator.pos.line == pos.line && mutator.pos.column == pos.column && mutator.type == type);
	if (existing)
		return existing;
	
	const name = getFuncName(funcLike) ?? '<anonymous>';
	const mutator: StateMutatingFunction = {
		id: createId('mutator', `${stateVariable.name}:${name}`, pos),
		name,
		pos,
		type,
		states: [],
	};

	stateVariable.mutators.push(mutator);
	return mutator;
}

/** Adds a deduplicated update to the state variable and returns the shared stored instance. */
function addUniqueUpdateToStateVariable(stateVariable: StateVariable, update: StateUpdate) {
	stateVariable.states ??= [];

	const key = `${update.kind}:${normText(update.expressionText)}`;
	const existing = stateVariable.states.find((current) => `${current.kind}:${normText(current.expressionText)}` == key);
	if (existing)
		return existing;

	stateVariable.states.push(update);
	return update;
}

/** Adds a deduplicated update reference to a mutator's reachable states list. */
function addUniqueUpdateToMutator(mutator: StateMutatingFunction, update: StateUpdate) {
	const key = `${update.kind}:${normText(update.expressionText)}`;
	const existing = mutator.states.find((current) => `${current.kind}:${normText(current.expressionText)}` == key);
	if (!existing)
		mutator.states.push(update);
}

/** Populates per-state mutators and reachable updates by scanning setter call sites. */
function populateStateUpdatesAndMutators(sourceFile: SourceFile, component: SupportedComponentDeclaration, stateVariables: StateVariable[]) {
	if (!stateVariables.length)
		return;

	const bySetter = new Map<string, StateVariable>();
	for (const stateVariable of stateVariables)
		bySetter.set(stateVariable.setterName, stateVariable);

	const callExpressions = component.getDescendantsOfKind(SyntaxKind.CallExpression);
	for (const callExpression of callExpressions) {
		const setterName = getFuncName(callExpression);
		if (!setterName)
			continue;

		const stateVariable = bySetter.get(setterName);
		if (!stateVariable)
			continue;

		const fn = getFirstAncestorOfKinds<SupportedDeclaration>(callExpression, [
			Node.isFunctionDeclaration,
			Node.isFunctionExpression,
			Node.isArrowFunction
		], component);

		const update = createStateUpdate(stateVariable, callExpression, sourceFile);
		const sharedUpdate = addUniqueUpdateToStateVariable(stateVariable, update);

		const mutator = getOrCreateMutator(stateVariable, sourceFile, component, fn);
		addUniqueUpdateToMutator(mutator, sharedUpdate);
	}
}

/** Parses a React component source text into a structured state diagram model. */
export function parseReactComponent(reactComponentTxt: string, rootDir = '.'): StateDiagram {
	const { sourceFile } = text2SrcFile(reactComponentTxt, rootDir);
	
	try {
		const component = resolveDefaultExportComponent(sourceFile);
		if (!component) {
			return {
				stateVariables: [],
			};
		}

		const stateVariables = collectStateVariables(sourceFile, component);
		populateStateUpdatesAndMutators(sourceFile, component, stateVariables);

		return {
			component: createComponentModel(sourceFile, component),
			stateVariables,
		};
	}
	finally {
		sourceFile.delete();
	}
}