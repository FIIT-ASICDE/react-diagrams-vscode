import { Project, Node, SyntaxKind } from 'ts-morph';
import * as path from 'node:path';
import * as fs from 'node:fs';

// Parse a React project

// export function analyzeReactComponent(relativePathToComponent: string) {
// 	// Get workspace folder
// 	const workspaceFolders = vscode.workspace.workspaceFolders;
// 	if (!workspaceFolders?.length) {
// 		vscode.window.showErrorMessage("No workspace folder found. Open a project first.");
// 		return null;
// 	}

// 	const rootPath = workspaceFolders[0].uri.fsPath;

// 	try {
// 		const parser = new ReactParser({
// 			rootDir: rootPath,
// 			include: [relativePathToComponent]
// 		});

// 	 	const result = parser.parse();
// 		// const graph = serializeGraph(result.graph);
// 		// const analyzer = new GraphAnalyzer(result.graph);
// 		return result.graph.components;
// 	} catch (error) {
// 		vscode.window.showErrorMessage("Error parsing React component: " + error);
// 		return null;
// 	}
// }


function findTsConfig(rootDir: string) {
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

function createProject(rootDir: string) {
	const tsConfigPath = findTsConfig(rootDir);
	return new Project({
		tsConfigFilePath: tsConfigPath,
		skipAddingFilesFromTsConfig: true,
	});
}

function truncateSingleLine(text: string, maxLength = 80) {
	const normalized = text.replace(/\s+/g, ' ').trim();
	if (normalized.length <= maxLength) {
		return normalized;
	}

	return `${normalized.slice(0, maxLength - 3)}...`;
}

function getNodeLabel(node: Node) {
	if (Node.isIdentifier(node)) {
		return ` (${node.getText()})`;
	}

	if (Node.isStringLiteral(node) || Node.isNumericLiteral(node)) {
		return ` (${truncateSingleLine(node.getText(), 40)})`;
	}

	if (Node.isFunctionDeclaration(node)) {
		return node.getName() ? ` (${node.getName()})` : '';
	}

	if (Node.isVariableDeclaration(node)) {
		return ` (${truncateSingleLine(node.getName())})`;
	}

	if (Node.isCallExpression(node)) {
		return ` (${truncateSingleLine(node.getExpression().getText(), 50)})`;
	}

	if (Node.isPropertyAccessExpression(node)) {
		return ` (${truncateSingleLine(node.getText(), 50)})`;
	}

	if (Node.isJsxOpeningElement(node) || Node.isJsxSelfClosingElement(node)) {
		return ` (<${node.getTagNameNode().getText()}>)`;
	}

	return '';
}

function formatAstTree(node: Node, depth = 0) {
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

export function parseReactComponent(reactComponentTxt: string, rootDir = '.') {
	const project = createProject(rootDir);
	const sourceFile = project.createSourceFile('__tempComponent__.tsx', reactComponentTxt);

	try {
		return formatAstTree(sourceFile);
	}
	finally {
		sourceFile.delete();
	}
}