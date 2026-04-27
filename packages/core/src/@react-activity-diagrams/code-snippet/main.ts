import type { Node, Edge } from "@xyflow/react";
import type { FuncArg } from "./shared/types";
import { CodeGenerator } from "./codegen/CodeGenerator";

export type { FuncArg } from "./shared/types";
export * from "./codegen/diagram-check";

export function convertDiagramToCode(
	nodes: Node[],
	edges: Edge[],
	funcName = "generatedFromDiagram",
	funcArgs: FuncArg[] = [],
): string {
	try {
		return new CodeGenerator(nodes, edges).generate(funcName, funcArgs);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Diagram conversion failed.";
		return `function ${funcName}() {\n  throw new Error(${JSON.stringify(`Diagram conversion failed: ${message}`)});\n}`;
	}
}