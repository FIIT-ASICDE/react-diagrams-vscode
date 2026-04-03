import * as fs from "node:fs";
import * as path from "node:path";
import { Node, Project, SyntaxKind } from "ts-morph";

/**
 * Resolve a tsconfig/jsconfig near the provided root so ts-morph can parse with
 * project-aware compiler settings when available.
 */
function findConfigFile(rootDir: string): string | undefined {
	const candidates = [
		path.join(rootDir, "tsconfig.json"),
		path.join(rootDir, "jsconfig.json"),
	];

	for (const candidate of candidates) {
		if (fs.existsSync(candidate)) {
			return candidate;
		}
	}

	return undefined;
}

/**
 * Create a ts-morph project instance. If there is no config file, we still
 * create a project with default settings so parsing can proceed.
 */
function createProject(rootDir: string): Project {
	const configFile = findConfigFile(rootDir);

	if (configFile) {
		return new Project({
			tsConfigFilePath: configFile,
			skipAddingFilesFromTsConfig: true,
		});
	}

	return new Project({
		compilerOptions: {
			allowJs: true,
		},
	});
}

/**
 * Keep labels compact so AST lines stay readable.
 */
function truncateSingleLine(text: string, maxLength = 80): string {
	const normalized = text.replace(/\s+/g, " ").trim();
	if (normalized.length <= maxLength) {
		return normalized;
	}

	return `${normalized.slice(0, maxLength - 3)}...`;
}

/**
 * Add short labels for commonly useful node kinds.
 */
function getNodeLabel(node: Node): string {
	if (Node.isIdentifier(node)) {
		return ` (${node.getText()})`;
	}

	if (Node.isStringLiteral(node) || Node.isNumericLiteral(node)) {
		return ` (${truncateSingleLine(node.getText(), 40)})`;
	}

	if (Node.isFunctionDeclaration(node)) {
		return node.getName() ? ` (${node.getName()})` : "";
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

	if (Node.isIfStatement(node)) {
		return ` (if ${truncateSingleLine(node.getExpression().getText(), 50)})`;
	}

	if (Node.isForStatement(node) || Node.isForInStatement(node) || Node.isForOfStatement(node) || Node.isWhileStatement(node) || Node.isDoStatement(node)) {
		return ` (loop ${truncateSingleLine(node.getText(), 50)})`;
	}

	if (Node.isReturnStatement(node)) {
		return ` (${truncateSingleLine(node.getText(), 50)})`;
	}

	if (Node.isJsxOpeningElement(node) || Node.isJsxSelfClosingElement(node)) {
		return ` (<${node.getTagNameNode().getText()}>)`;
	}

	return "";
}

/**
 * Format a source tree into a readable multi-line AST listing.
 */
function formatAstTree(node: Node, depth = 0): string {
	const indent = "  ".repeat(depth);
	const kind = SyntaxKind[node.getKind()];
	const line = node.getStartLineNumber();
	const label = getNodeLabel(node);

	const lines: string[] = [`${indent}${kind}${label} [L${line}]`];
	for (const child of node.getChildren()) {
		lines.push(formatAstTree(child, depth + 1));
	}
    console.log(lines.join("\n"));
	return lines.join("\n");
}

/**
 * Parse source text and return an AST-like textual tree.
 *
 * This intentionally mirrors the current state-diagram parser approach:
 * no diagram nodes/edges yet, only AST data for inspection and iteration.
 */
export function parseActivityComponent(sourceText: string, rootDir = ".", tempFileName = "__activity_temp__.tsx"): string {
	const project = createProject(rootDir);
	const sourceFile = project.createSourceFile(tempFileName, sourceText, { overwrite: true });

	try {
		return formatAstTree(sourceFile);
	}
	finally {
		// Ensure temporary in-memory file is removed from the project graph.
		sourceFile.delete();
	}
}
