import {
	ArrowFunction,
	CallExpression,
	FunctionDeclaration,
	FunctionExpression,
} from 'ts-morph';

export type SupportedDeclaration =
	| FunctionDeclaration
	| ArrowFunction
	| FunctionExpression;

export type SupportedComponentDeclaration = SupportedDeclaration
	//|
	;