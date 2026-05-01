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
	Id,
	StateGraphNodeType,
	StateMutatingFunction,
	StateUpdate,
	StateUpdateKind,
	StateVariable,
} from '../../../app@state-diagram-model/types';
import { createId, getCodePos, getDeclarationKind, getFirstAncestorOfKinds, getFuncName, getStateMutationNodes, normText } from '../utils';
import { SupportedComponentDeclaration, SupportedDeclaration } from '../types';

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

export function getStateUpdateLabel(mutationNode: Node, stateVariable: StateVariable, arg?: Node) {
	if (stateVariable.mutPattern == 'ref-current' && Node.isBinaryExpression(mutationNode) && mutationNode.getOperatorToken().getKind() != SyntaxKind.EqualsToken)
		return `${mutationNode.getOperatorToken().getText().trim()} ${normText(arg)}`;

	if (arg)
		return normText(arg);

	if (Node.isPrefixUnaryExpression(mutationNode) || Node.isPostfixUnaryExpression(mutationNode))
		return mutationNode.getOperatorToken() == SyntaxKind.PlusPlusToken ? '++' : '--';
	return normText(mutationNode);
}

export function createStateUpdate(stateVariable: StateVariable, mutationNode: Node/*, sourceFile: SourceFile*/) {
	const arg = Node.isCallExpression(mutationNode) ? mutationNode.getArguments()[0] : Node.isBinaryExpression(mutationNode) ? mutationNode.getRight() : undefined;
	const label = getStateUpdateLabel(mutationNode, stateVariable, arg);
	const kind = classifyStateUpdateKind(arg);
	const pos = getCodePos(mutationNode);

	const update: StateUpdate = {
		id: createId('update', `${stateVariable.name}:${kind}`, pos),
		nodeType: 'state-update',
		stateVariableId: stateVariable.id,
		setterName: stateVariable.setterName,
		mutPattern: stateVariable.mutPattern,
		kind,
		pos,
		label,
	};

	return update;
}

/** Gets or creates the dedicated render-body mutator for top-level setter calls. */
function getOrCreateInlineMutator(stateVariable: StateVariable, component: SupportedComponentDeclaration/*, sourceFile: SourceFile*/) {
	const inlineName = '<render-body>';
	if (stateVariable.mutators?.[0]?.name == inlineName)
		return stateVariable.mutators[0];

	const pos = getCodePos(component);
	const mutator: StateMutatingFunction = {
		id: createId('mutator', `${stateVariable.name}:${inlineName}`, pos),
		name: inlineName,
		pos,
		type: getDeclarationKind(component),
		// states: [],
		nodes: [],
		transitions: [],
	};

	stateVariable.mutators?.unshift(mutator);
	return mutator;
}

/** Gets or creates a mutator model for a specific state variable and function scope. */
function getOrCreateMutator(stateVariable: StateVariable, component: SupportedComponentDeclaration, funcLike?: SupportedDeclaration/*, sourceFile: SourceFile*/) {
	stateVariable.mutators ??= [];

	if (!funcLike)
		return getOrCreateInlineMutator(stateVariable, component);
	const pos = getCodePos(funcLike);
	const type = getDeclarationKind(funcLike);
	const existing = stateVariable.mutators.find((mutator) => mutator.pos.line == pos.line && mutator.pos.col == pos.col && mutator.type == type);
	if (existing)
		return existing;
	
	let name = getFuncName(funcLike);
	name ??= funcLike.getFirstAncestorByKind(SyntaxKind.CallExpression)?.getExpression().getText();
	name ??= `<anonymous>`;
	const mutator: StateMutatingFunction = {
		id: createId('mutator', `${stateVariable.name}:${name}`, pos),
		name,
		pos,
		type,
		args: funcLike.getText()?.match(/\(([^)]*)\)/)?.[1],
		// states: [],
		nodes: [],
		transitions: [],
	};

	stateVariable.mutators.push(mutator);
	return mutator;
}

/** Adds a deduplicated update to the state variable and returns the shared stored instance. */
function addUniqueUpdateToStateVariable(stateVariable: StateVariable, update: StateUpdate) {
	stateVariable.states ??= [];

	const key = `${update.kind}:${normText(update.label)}`;
	const existing = stateVariable.states.find((current) => `${current.kind}:${normText(current.label)}` == key);
	if (existing)
		return existing;

	stateVariable.states.push(update);
	return update;
}

/** Adds a setter call-site update node to mutator graph nodes without duplicate positions. */
function addUpdateNodeToMutator(mutator: StateMutatingFunction, update: StateUpdate) {
	const existing = mutator.nodes.find((node) =>
		node.nodeType == 'state-update' &&
		node.pos.line == update.pos.line &&
		node.pos.col == update.pos.col
	);
	if (!existing)
		mutator.nodes.push(update);
}

export function populateStateUpdatesAndMutators(component: SupportedComponentDeclaration, stateVariables: StateVariable[]/*, sourceFile: SourceFile*/) {
	const mutatorBodies = new Map<Id, Block>(); // mutator id - func body block map
	if (!stateVariables.length)
		return mutatorBodies;

	for (const stateVariable of stateVariables) {
		const mutationNodes = getStateMutationNodes(component, stateVariable) as Node[];
		for (const mutationNode of mutationNodes) {
			const fn = getFirstAncestorOfKinds<SupportedDeclaration>(mutationNode, [
				Node.isFunctionDeclaration,
				Node.isFunctionExpression,
				Node.isArrowFunction
			], component);

			const update = createStateUpdate(stateVariable, mutationNode);
			addUniqueUpdateToStateVariable(stateVariable, update);

			const mutator = getOrCreateMutator(stateVariable, component, fn);
			addUpdateNodeToMutator(mutator, update);

			if (!mutatorBodies.has(mutator.id)) {
				const body = (fn ?? component as SupportedDeclaration).getBody();
				// console.log(body);
				if (body && Node.isBlock(body))
					mutatorBodies.set(mutator.id, body);
			}
		}
	}

	// console.log(mutatorBodies);
	return mutatorBodies;
}