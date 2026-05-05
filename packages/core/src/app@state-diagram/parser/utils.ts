import { Project, Node, SyntaxKind, SourceFile, VariableDeclaration, CallExpression, Statement, BinaryExpression } from 'ts-morph';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { CodePos, StateVariable } from '../../app@state-diagram-model/types';
import { SupportedDeclaration  } from './types';
import { FunctionDeclarationKind } from '../../app@state-diagram-model/types';
import murmurHash3 from 'imurmurhash';

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
		compilerOptions: {
			allowJs: true,
		},
	});
}

export function asSrcFile(pathOrTxt: string, rootDir: Project | string = '.') {
	const project = typeof rootDir == 'string' ? createProject(rootDir) : rootDir;
	var sourceFile = project.addSourceFileAtPathIfExists(pathOrTxt);
	if (!sourceFile)
		sourceFile = project.createSourceFile('__temp__.tsx', pathOrTxt);
	return { project, sourceFile };
}

export function getCodePos(node: Node, sourceFile?: SourceFile): CodePos {
	const {line, column} = (sourceFile ?? node.getSourceFile()).getLineAndColumnAtPos(node.getStart());
	return { line, col: column };
}

export const codePosStr = ({line, col}: CodePos) => `${line}:${col}`;

export function createId(what, name: string, {line, col}: CodePos) {
	// return `${what?.toString()}-${name}:${codePosStr(pos)}`; // wasteful and almost 2x longer
	return murmurHash3(what?.toString() || '').hash(name).hash(line.toString()).hash(col.toString()).result().toString();
}

export function getBindingElementName(node?: Node) {
	if (!node || !Node.isBindingElement(node))
		return;
	return node.getNameNode().getText().trim();
}

export function getDeclarationKind(decl: SupportedDeclaration): FunctionDeclarationKind {
	if (Node.isArrowFunction(decl))
		return 'arrow-function';

	if (Node.isFunctionExpression(decl))
		return 'function-expression';

	return 'function';
}

export function getFuncName(fn: SupportedDeclaration | CallExpression) {
	if (Node.isCallExpression(fn)) {
		const expression = fn.getExpression();
		if (Node.isIdentifier(expression))
			return expression.getText();

		if (Node.isPropertyAccessExpression(expression))
			return expression.getName();
		return;
	}

	if (Node.isFunctionDeclaration(fn) || Node.isFunctionExpression(fn))
		return fn.getName();

	const parent = fn.getParent();

	if (Node.isVariableDeclaration(parent))
		return parent.getName();

	if (Node.isPropertyAssignment(parent) || Node.isShorthandPropertyAssignment(parent) || Node.isMethodDeclaration(parent))
		return parent.getName();

	if (Node.isJsxExpression(parent)) {
		const attr = parent.getParentIfKind(SyntaxKind.JsxAttribute);
		if (attr)
			return attr.getNameNode().getText();
	}

	return fn.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)?.getName();
}

export function getAllCalls(node: Node, funcName: string, filterType: "filter" | "some" = "filter") {
	const calls = node.getDescendantsOfKind(SyntaxKind.CallExpression);
	if (filterType == "some")
		return calls.some(cl => getFuncName(cl) == funcName);
	return calls.filter(cl => getFuncName(cl) == funcName);
}

export function isAssignmentOperator(kind: SyntaxKind) {
	return kind >= SyntaxKind.EqualsToken && kind <= SyntaxKind.CaretEqualsToken; // this works... see @ts-morph\common\lib\typescript.d.ts
}

export function isDirectPropertyAccess(node: Node | undefined, ownerName: string, propName: string) {
	if (!node || !Node.isPropertyAccessExpression(node))
		return false;

	const owner = node.getExpression();
	return Node.isIdentifier(owner) && owner.getText() == ownerName && node.getName() == propName;
}

export function getStateMutationNodes(node: Node, stateVariable: StateVariable, filterType: 'filter' | 'some' = 'filter') {
	if (!stateVariable.mutPattern || stateVariable.mutPattern == 'setter-call')
		return getAllCalls(node, stateVariable.setterName, filterType);
	// mutPattern == 'ref-current'

	const { name: ownerName, setterName } = stateVariable;
	const result: Node[] = [];
	/* Not really optimal but anything else I tried was even worse or it broke funcionality */
	for (const binaryExpression of node.getDescendantsOfKind(SyntaxKind.BinaryExpression)) {
		if (!isAssignmentOperator(binaryExpression.getOperatorToken().getKind()))
			continue;
		if (!isDirectPropertyAccess(binaryExpression.getLeft(), ownerName, setterName))
			continue;
		
		if (filterType == 'some')
			return true;
		result.push(binaryExpression);
	}

	for (const prefixExpression of node.getDescendantsOfKind(SyntaxKind.PrefixUnaryExpression)) {
		const kind = prefixExpression.getOperatorToken();
		if (kind != SyntaxKind.PlusPlusToken && kind != SyntaxKind.MinusMinusToken)
			continue;
		if (!isDirectPropertyAccess(prefixExpression.getOperand(), ownerName, setterName))
			continue;

		if (filterType == 'some')
			return true;
		result.push(prefixExpression);
	}

	for (const postfixExpression of node.getDescendantsOfKind(SyntaxKind.PostfixUnaryExpression)) {
		const kind = postfixExpression.getOperatorToken();
		if (kind != SyntaxKind.PlusPlusToken && kind != SyntaxKind.MinusMinusToken)
			continue;
		if (!isDirectPropertyAccess(postfixExpression.getOperand(), ownerName, setterName))
			continue;

		if (filterType == 'some')
			return true;
		result.push(postfixExpression);
	}

	return filterType == 'some' ? false : result.sort((a, b) => a.getStart() - b.getStart()); // sort handles un, bin, op precedence edge case
}

export function normText(text?: string | Node) {
	if (text instanceof Node) 
		return normText(text.getText());
	return text?.replace(/\s+/g, ' ').trim() || "";
}

export function getFirstAncestorOfKinds<T extends Node>(node: Node, kinds: ((Node) => boolean)[], ignore?: Node): T | undefined {
	const ancestor = node.getFirstAncestor(ancestor => kinds.some(kind => kind(ancestor)));
	return ancestor == ignore ? undefined : ancestor as T;
}


// export function getNodeLabel(node: Node) {
// 	if (Node.isIdentifier(node)) {
// 		return ` (${node.getText()})`;
// 	}

// 	if (Node.isStringLiteral(node) || Node.isNumericLiteral(node)) {
// 		return ` (${truncate(node.getText(), 40)})`;
// 	}

// 	if (Node.isFunctionDeclaration(node)) {
// 		return node.getName() ? ` (${node.getName()})` : '';
// 	}

// 	if (Node.isVariableDeclaration(node)) {
// 		return ` (${truncate(node.getName())})`;
// 	}

// 	if (Node.isCallExpression(node)) {
// 		return ` (${truncate(node.getExpression().getText(), 50)})`;
// 	}

// 	if (Node.isPropertyAccessExpression(node)) {
// 		return ` (${truncate(node.getText(), 50)})`;
// 	}

// 	if (Node.isJsxOpeningElement(node) || Node.isJsxSelfClosingElement(node)) {
// 		return ` (<${node.getTagNameNode().getText()}>)`;
// 	}

// 	return '';
// }

// export function formatAstTree(node: Node, depth = 0) {
// 	const indent = '  '.repeat(depth);
// 	const kind = SyntaxKind[node.getKind()];
// 	const line = node.getStartLineNumber();
// 	const label = getNodeLabel(node);

// 	const lines: string[] = [`${indent}${kind}${label} [L${line}]`];
// 	for (const child of node.getChildren()) {
// 		lines.push(formatAstTree(child, depth + 1));
// 	}

// 	return lines.join('\n');
// }