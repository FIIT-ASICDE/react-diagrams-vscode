import { Node, SourceFile, SyntaxKind, VariableDeclaration } from "ts-morph";
import { getCodePos, getDeclarationKind } from "./utils";
import { StateDiagramComponent } from "../types";
import { SupportedComponentDeclaration } from "./types";

export function getComponentName(component: SupportedComponentDeclaration) {
	if (Node.isFunctionDeclaration(component) || Node.isFunctionExpression(component))
		return component.getName() ?? 'default';

	const parent = component.getParentIfKind(SyntaxKind.VariableDeclaration);
	return parent?.getName() ?? 'default';
}

export function createComponentModel(sourceFile: SourceFile, component: SupportedComponentDeclaration): StateDiagramComponent {
	return {
		name: getComponentName(component),
		pos: getCodePos(sourceFile, component),
		exportName: 'default',
		declarationKind: getDeclarationKind(component),
	};
}

function resolveComponentDeclarationFromVariable(declaration: VariableDeclaration): SupportedComponentDeclaration | undefined {
	const initializer = declaration.getInitializer();
	if (initializer && (Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer)))
		return initializer;
}

export function resolveDefaultExportComponent(sourceFile: SourceFile): SupportedComponentDeclaration | undefined {
	const defaultExportSymbol = sourceFile.getDefaultExportSymbol();

	for (const declaration of defaultExportSymbol?.getDeclarations() ?? []) {
		if (Node.isFunctionDeclaration(declaration))
			return declaration;

		if (Node.isVariableDeclaration(declaration)) {
			const component = resolveComponentDeclarationFromVariable(declaration);
			if (component)
				return component;
		}

		if (Node.isExportAssignment(declaration)) {
			const expression = declaration.getExpression();

			if (Node.isIdentifier(expression)) {
				const symbol = expression.getSymbol();
				const resolvedDeclaration = symbol?.getDeclarations().find(decl => Node.isVariableDeclaration(decl) || Node.isFunctionDeclaration(decl));
				if (resolvedDeclaration) {
					if (Node.isFunctionDeclaration(resolvedDeclaration))
						return resolvedDeclaration;

					const component = resolveComponentDeclarationFromVariable(resolvedDeclaration);
					if (component)
						return component;
				}
			}

			if (Node.isArrowFunction(expression) || Node.isFunctionExpression(expression))
				return expression;
		}
	}
}