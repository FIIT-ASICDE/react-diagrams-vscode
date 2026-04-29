import { type Node, type Edge } from "@xyflow/react";
import { normalize } from "../shared/string-utils";
import type { Construct } from "../shared/construct";
import type { AnyNodeData } from "./Types";

export const getData = (node: Node): AnyNodeData =>
	(node.data as AnyNodeData | undefined) ?? {};

export const getStr = (value: unknown): string =>
	typeof value === "string" ? value : "";

export function getConstruct(node: Node): Construct | undefined {
	const value = getStr(getData(node).construct);
	return value ? (value as Construct) : undefined;
}

const EXCEPTION_LABELS = new Set(["exception", "catch", "error"]);

export const isExceptionEdge = (label: unknown): boolean =>
	EXCEPTION_LABELS.has(normalize(label));

export const isBackEdge = (edge: Edge): boolean => edge.type === "back";

export const isTryExitEdge = (edge: Edge): boolean =>
	normalize(edge.label) === "exit try";