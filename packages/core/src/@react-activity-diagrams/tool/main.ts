import type { Node, Edge } from "@xyflow/react";
import type { FuncArg } from "./shared/types";
import { CodeGenerator } from "./codegen/CodeGenerator";

export type { FuncArg } from "./shared/types";

export function convertDiagramToCode(
	nodes: Node[],
	edges: Edge[],
	funcName = "generatedFromDiagram",
	funcArgs: FuncArg[] = [],
): string {
	return new CodeGenerator(nodes, edges).generate(funcName, funcArgs);
}