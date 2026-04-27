import type { Node, Edge } from "@xyflow/react";
import type { FuncArg, NodeData } from "../shared/types";
import { normalize, stringifyLabel } from "../shared/string-utils";

export function getNodeLabel(node: Node): string {
	const data = (node.data as NodeData | undefined) ?? {};
	const label = stringifyLabel(data.label);
	const sourceText = stringifyLabel(data.sourceText);

	if (label.endsWith("...") && sourceText) return sourceText;
	return label;
}

export function isTryNode(node: Node): boolean {
	const label = normalize(getNodeLabel(node));
	return label === "try";
}

export function looksAsync(nodes: Node[]): boolean {
	return nodes.some((node) => {
		const label = getNodeLabel(node);
		return /\bawait\b|\bfetch\s*\(|\.json\s*\(|promiseDelay|setTimeout|setInterval|async\b/i.test(label);
	});
}

export function formatFunctionHeader(funcName: string, funcArgs: FuncArg[], asyncMode: boolean): string {
	const argsStr = funcArgs.map((arg) => (arg.type ? `${arg.name}: ${arg.type}` : arg.name)).join(", ");
	const asyncKeyword = asyncMode ? "async " : "";
	return `${asyncKeyword}function ${funcName}(${argsStr}) {\n`;
}
