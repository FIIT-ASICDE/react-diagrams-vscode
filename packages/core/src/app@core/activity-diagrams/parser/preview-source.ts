import { SyntaxKind, type Statement, type SourceFile } from "ts-morph";


// Returns preview statements.
export function getPreviewStatements(sourceFile: SourceFile): Statement[] | undefined {
	const methodDeclaration = sourceFile.getDescendantsOfKind(SyntaxKind.MethodDeclaration)[0];
	if (methodDeclaration) {
		const body = methodDeclaration.getBody();
		if (body && typeof (body as { getStatements?: () => Statement[] }).getStatements === "function") {
			return ((body as unknown) as { getStatements: () => Statement[] }).getStatements();
		}
	}

	const constructorDeclaration = sourceFile.getDescendantsOfKind(SyntaxKind.Constructor)[0];
	if (constructorDeclaration) {
		const body = constructorDeclaration.getBody();
		if (body && typeof (body as { getStatements?: () => Statement[] }).getStatements === "function") {
			return ((body as unknown) as { getStatements: () => Statement[] }).getStatements();
		}
	}

	const functionDeclaration = sourceFile.getFunctions()[0];
	const functionBody = functionDeclaration?.getBody();
	if (functionBody && typeof (functionBody as { getStatements?: () => Statement[] }).getStatements === "function") {
		return ((functionBody as unknown) as { getStatements: () => Statement[] }).getStatements();
	}

	const arrowFunction = sourceFile.getDescendantsOfKind(SyntaxKind.ArrowFunction)[0];
	if (arrowFunction) {
		const body = arrowFunction.getBody();
		if (body && SyntaxKind.Block === body.getKind() && typeof (body as { getStatements?: () => Statement[] }).getStatements === "function") {
			return ((body as unknown) as { getStatements: () => Statement[] }).getStatements();
		}

		
		if (body && body.getKind() !== SyntaxKind.Block) {
			return [body as unknown as Statement];
		}
	}

	const functionExpression = sourceFile.getDescendantsOfKind(SyntaxKind.FunctionExpression)[0];
	if (functionExpression) {
		const body = functionExpression.getBody();
		if (body && typeof (body as { getStatements?: () => Statement[] }).getStatements === "function") {
			return ((body as unknown) as { getStatements: () => Statement[] }).getStatements();
		}
	}

	return undefined;
}