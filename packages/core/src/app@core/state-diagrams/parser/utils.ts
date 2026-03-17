import { Project, Node, SyntaxKind, SourceFile, VariableDeclaration } from 'ts-morph';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { SupportedComponentDeclaration } from './types';

export function findTsConfig(rootDir: string) {
	const candidates = [
		path.join(rootDir, 'tsconfig.json'),
		path.join(rootDir, 'jsconfig.json'),
	];

	for (const candidate of candidates) {
		if (fs.existsSync(candidate)) {
			return candidate;
		}
	}

	return undefined;
}

export function createProject(rootDir: string) {
	const tsConfigPath = findTsConfig(rootDir);
	return new Project({
		tsConfigFilePath: tsConfigPath,
		skipAddingFilesFromTsConfig: true,
	});
}

export function text2SrcFile(text: string, rootDir: Project | string = '.') {
	const project = typeof rootDir == 'string' ? createProject(rootDir) : rootDir;
	const sourceFile = project.createSourceFile('__temp__.tsx', text);
	return { project, sourceFile };
}

export function truncate(str, max = 100): string {
	str = str.toString().replace(/\s+/g, ' ').trim();
	return str.length > max ? `${str.substr(0, max-1)}...` : str;
}

export function getLineAndColumn(sourceFile: SourceFile, node: Node) {
	return sourceFile.getLineAndColumnAtPos(node.getStart());
}

export function getNodeLabel(node: Node) {
	if (Node.isIdentifier(node)) {
		return ` (${node.getText()})`;
	}

	if (Node.isStringLiteral(node) || Node.isNumericLiteral(node)) {
		return ` (${truncate(node.getText(), 40)})`;
	}

	if (Node.isFunctionDeclaration(node)) {
		return node.getName() ? ` (${node.getName()})` : '';
	}

	if (Node.isVariableDeclaration(node)) {
		return ` (${truncate(node.getName())})`;
	}

	if (Node.isCallExpression(node)) {
		return ` (${truncate(node.getExpression().getText(), 50)})`;
	}

	if (Node.isPropertyAccessExpression(node)) {
		return ` (${truncate(node.getText(), 50)})`;
	}

	if (Node.isJsxOpeningElement(node) || Node.isJsxSelfClosingElement(node)) {
		return ` (<${node.getTagNameNode().getText()}>)`;
	}

	return '';
}

export function formatAstTree(node: Node, depth = 0) {
	const indent = '  '.repeat(depth);
	const kind = SyntaxKind[node.getKind()];
	const line = node.getStartLineNumber();
	const label = getNodeLabel(node);

	const lines: string[] = [`${indent}${kind}${label} [L${line}]`];
	for (const child of node.getChildren()) {
		lines.push(formatAstTree(child, depth + 1));
	}

	return lines.join('\n');
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
				const resolvedDeclaration = symbol?.getDeclarations().find(Node.isVariableDeclaration);
				if (resolvedDeclaration) {
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