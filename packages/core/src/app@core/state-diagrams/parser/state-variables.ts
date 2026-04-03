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
import { StateVariable } from '../types';
import { createId, getBindingElementName, getCodePos,  getFirstAncestorOfKinds } from './utils';
import { SupportedComponentDeclaration } from './types';
import { truncate } from '../../utils';

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
	const identifiers = new Set(['useState']);

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

export function collectStateVariables(sourceFile: SourceFile, component: SupportedComponentDeclaration) {
	const body = component.getBody();
	if (!body || !Node.isBlock(body))
		return [];

	const useStateIdentifiers = collectUseStateIdentifiers(sourceFile);
	const declarations = body.getDescendantsOfKind(SyntaxKind.VariableDeclaration);;
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

		// console.log(stateElement, setterElement, useStateCall, initializer);
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