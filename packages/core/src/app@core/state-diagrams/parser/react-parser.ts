import {
	CallExpression,
	Node,
	SourceFile,
	SyntaxKind,
	VariableDeclaration,
} from 'ts-morph';
import {
	StateDiagram,
	StateDiagramComponent,
	StateVariable,
} from '../types';
import { createStateId, getBindingElementName, getCodePos, text2SrcFile, truncate } from './utils';

import { CodePos, SupportedComponentDeclaration } from './types';
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

function getTrackedUseStateCall(node: Node | undefined, useStateIdentifiers: Set<string>): CallExpression | undefined {
	if (!node || !Node.isCallExpression(node))
		return;

	const expression = node.getExpression();
	if (Node.isIdentifier(expression))
		return useStateIdentifiers.has(expression.getText()) ? node : undefined;

	if (Node.isPropertyAccessExpression(expression))
		return expression.getName() == 'useState' ? node : undefined;
}

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

function isDirectlyOwnedByComponent(declaration: VariableDeclaration, component: SupportedComponentDeclaration) {
	const nearestFunction = declaration.getFirstAncestor((ancestor) => 
		Node.isFunctionDeclaration(ancestor) ||
		Node.isFunctionExpression(ancestor) ||
		Node.isArrowFunction(ancestor) ||
		Node.isMethodDeclaration(ancestor)
	);

	return nearestFunction == component;
}

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
		stateVariables.push({
			id: createStateId('state', stateName, pos),
			hook: 'useState',
			name: stateName,
			setterName,
			initializerText: useStateCall.getArguments()[0]?.getText(),
			typeText: inferStateTypeText(useStateCall),
			pos,
		});
	}

	return stateVariables;
}

export function parseReactComponent(reactComponentTxt: string, rootDir = '.'): StateDiagram {
	const { sourceFile } = text2SrcFile(reactComponentTxt, rootDir);
	
	try {
		const component = resolveDefaultExportComponent(sourceFile);
		if (!component) {
			return {
				stateVariables: [],
			};
		}

		return {
			component: createComponentModel(sourceFile, component),
			stateVariables: collectStateVariables(sourceFile, component),
			// updates: [],
		};
	}
	finally {
		sourceFile.delete();
	}
}