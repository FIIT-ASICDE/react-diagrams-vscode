import type { Node } from "@xyflow/react";
import type { FuncArg, NodeData } from "../shared/types";
import { stringifyLabel } from "../shared/string-utils";


// Returns node label.
function getNodeLabel(node: Node): string {
	const data = (node.data as NodeData | undefined) ?? {};
	const label = stringifyLabel(data.label);
	const sourceText = stringifyLabel(data.sourceText);

	if (label.endsWith("...") && sourceText) return sourceText;
	return label;
}


// Handles looks async.
export function looksAsync(nodes: Node[]): boolean {
	return nodes.some((node) => {
		const label = getNodeLabel(node);
		return /\bawait\b|\bfetch\s*\(|\.json\s*\(|promiseDelay|setTimeout|setInterval|async\b/i.test(label);
	});
}


// Handles format function header.
export function formatFunctionHeader(funcName: string, funcArgs: FuncArg[], asyncMode: boolean): string {
	const argsStr = funcArgs.map((arg) => (arg.type ? `${arg.name}: ${arg.type}` : arg.name)).join(", ");
	const asyncKeyword = asyncMode ? "async " : "";
	return `${asyncKeyword}function ${funcName}(${argsStr}) {\n`;
}
