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
import { StateVariable } from '../../../app@state-diagram-model/types';
import { createId, getBindingElementName, getCodePos,  getFirstAncestorOfKinds } from '../utils';
import { SupportedComponentDeclaration } from '../types';
import { truncate } from '../../../app@core/utils';

/** Returns the matched hook call and its canonical hook name. */
function getTrackedStateHookCall(node: Node | undefined, identifiers: Map<string, string>, hookNames: Set<string>) {
	if (!node || !Node.isCallExpression(node))
		return;

	const expression = node.getExpression();
	if (Node.isIdentifier(expression)) {
		const hookName = identifiers.get(expression.getText());
		return hookName ? { call: node, hookName } : undefined;
	}

	if (Node.isPropertyAccessExpression(expression)) {
		const name = expression.getName();
		return hookNames.has(name) ? { call: node, hookName: name } : undefined;
	}
}

/** Builds a map from local identifiers to canonical hook names, scanning all imports for aliases. */
function collectStateHookIdentifiers(sourceFile: SourceFile, hookNames: string[]) {
	const hookNamesSet = new Set(hookNames);
	// identity mapping: every hook name is also its own local name (handles bare usage)
	const identifiers = new Map<string, string>(hookNames.map(n => [n, n]));

	for (const importDeclaration of sourceFile.getImportDeclarations()) {
		for (const namedImport of importDeclaration.getNamedImports()) {
			if (!hookNamesSet.has(namedImport.getName()))
				continue;

			const localName = namedImport.getAliasNode()?.getText() ?? namedImport.getName();
			identifiers.set(localName, namedImport.getName());
		}
	}

	return { identifiers, hookNamesSet };
}

export function inferStateTypeText(callExpression: Node) {
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

export function isDirectlyOwnedByComponent(declaration: Node, component: SupportedComponentDeclaration) {
	return getFirstAncestorOfKinds(declaration, [Node.isFunctionDeclaration, Node.isFunctionExpression, Node.isArrowFunction, Node.isMethodDeclaration,]) == component
}

function collectTupleStateVariable(declaration: VariableDeclaration, sourceFile: SourceFile, hookName: string, stateHookCall: CallExpression): StateVariable | undefined {
	const nameNode = declaration.getNameNode();
	if (!Node.isArrayBindingPattern(nameNode) || nameNode.getElements().length < 2)
		return;

	const [stateElement, setterElement] = nameNode.getElements();
	const stateName = getBindingElementName(stateElement);
	const setterName = getBindingElementName(setterElement);
	if (!stateName || !setterName || !Node.isBindingElement(stateElement))
		return;

	const pos = getCodePos(stateElement.getNameNode(), sourceFile);
	return {
		id: createId('state', stateName, pos),
		hook: hookName,
		name: stateName,
		setterName,
		mutPattern: 'setter-call',
		initializerText: stateHookCall.getArguments()[0]?.getText(),
		typeText: inferStateTypeText(stateHookCall),
		pos,
		states: [],
		mutators: [],
	};
}

function collectRefStateVariable(declaration: VariableDeclaration, sourceFile: SourceFile, hookName: string, stateHookCall: CallExpression): StateVariable | undefined {
	const nameNode = declaration.getNameNode();
	if (!Node.isIdentifier(nameNode))
		return;

	const stateName = nameNode.getText().trim();
	if (!stateName)
		return;

	const pos = getCodePos(nameNode, sourceFile);
	return {
		id: createId('state', stateName, pos),
		hook: hookName,
		name: stateName,
		setterName: 'current',
		mutPattern: 'ref-current',
		initializerText: stateHookCall.getArguments()[0]?.getText(),
		typeText: inferStateTypeText(stateHookCall),
		pos,
		states: [],
		mutators: [],
	};
}

export function collectStateVariables(component: SupportedComponentDeclaration, sourceFile: SourceFile, hookNames = ['useState'], refHookNames = ['useRef']) {
	const body = component.getBody();
	if (!body || !Node.isBlock(body))
		return [];

	const { identifiers, hookNamesSet } = collectStateHookIdentifiers(sourceFile, hookNames);
	const { identifiers: refIdentifiers, hookNamesSet: refHookNamesSet } = collectStateHookIdentifiers(sourceFile, refHookNames);
	const declarations = body.getDescendantsOfKind(SyntaxKind.VariableDeclaration);;
	const stateVariables: StateVariable[] = [];

	for (const declaration of declarations) {
		if (!isDirectlyOwnedByComponent(declaration, component))
			continue;

		const initializer = declaration.getInitializer();
		const tracked = getTrackedStateHookCall(initializer, identifiers, hookNamesSet);
		if (tracked) {
			const { call: stateHookCall, hookName } = tracked;
			const tupleStateVariable = collectTupleStateVariable(declaration, sourceFile, hookName, stateHookCall);
			if (tupleStateVariable)
				stateVariables.push(tupleStateVariable);
			continue;
		}

		const trackedRef = getTrackedStateHookCall(initializer, refIdentifiers, refHookNamesSet);
		if (!trackedRef)
			continue;
	
		const { call: stateHookCall, hookName } = trackedRef;
		const refStateVariable = collectRefStateVariable(declaration, sourceFile, hookName, stateHookCall);
		if (refStateVariable)
			stateVariables.push(refStateVariable);
	}

	return stateVariables;
}