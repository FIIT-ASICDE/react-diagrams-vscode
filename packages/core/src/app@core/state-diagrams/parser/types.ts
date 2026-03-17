import {
	ArrowFunction,
	CallExpression,
	FunctionDeclaration,
	FunctionExpression,
} from 'ts-morph';

export type SupportedComponentDeclaration =
	| FunctionDeclaration
	| ArrowFunction
	| FunctionExpression;