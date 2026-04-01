import {
	Block,
	CallExpression,
	IfStatement,
	Node,
	ReturnStatement,
	SourceFile,
	SyntaxKind,
	ThrowStatement,
	TryStatement,
	VariableDeclaration,
} from 'ts-morph';
import {
	StateMutatingFunction,
	StateUpdate,
	StateUpdateKind,
	StateVariable,
} from '../types';
import { createId, getBindingElementName, getCodePos, getDeclarationKind, getFirstAncestorOfKinds, getFuncName, normText } from './utils';
import { SupportedComponentDeclaration, SupportedDeclaration } from './types';

export function classifyStateUpdateKind(argument?: Node): StateUpdateKind {
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

export function createStateUpdate(stateVariable: StateVariable, callExpression: CallExpression, sourceFile: SourceFile) {
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
		nodes: [],
		transitions: [],
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
		nodes: [],
		transitions: [],
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

/** Adds a deduplicated update reference to a mutator reachable states list. */
function addUniqueUpdateToMutator(mutator: StateMutatingFunction, update: StateUpdate) {
	const key = `${update.kind}:${normText(update.expressionText)}`;
	const existing = mutator.states.find((current) => `${current.kind}:${normText(current.expressionText)}` == key);
	if (!existing)
		mutator.states.push(update);
}

export function populateStateUpdatesAndMutators(sourceFile: SourceFile, component: SupportedComponentDeclaration, stateVariables: StateVariable[]) {
	const mutatorBodies = new Map<string, Block>(); // mutator id - func body block map
	if (!stateVariables.length)
		return mutatorBodies;

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

		if (!mutatorBodies.has(mutator.id)) {
			const body = (fn ?? component as SupportedDeclaration).getBody();
			// console.log(body);
			if (body && Node.isBlock(body))
				mutatorBodies.set(mutator.id, body);
		}
	}

	// console.log(mutatorBodies);
	return mutatorBodies;
}