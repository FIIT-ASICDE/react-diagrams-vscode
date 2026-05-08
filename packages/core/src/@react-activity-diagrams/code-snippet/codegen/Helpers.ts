import { type Node, type Edge } from "@xyflow/react";
import { findLabeledEdge, getOutgoingEdges } from "../graph/traversal";
import { normalize, sanitizeStatement } from "../shared/string-utils";
import type { Construct } from "../shared/construct";
import type { AnyNodeData, Outcome } from "./Types";
import { RETURN } from "./Types";




// Returns data.
export const getData = (node: Node): AnyNodeData =>
	(node.data as AnyNodeData | undefined) ?? {};


// Returns str.
export const getStr = (value: unknown): string =>
	typeof value === "string" ? value : "";


// Returns construct.
export function getConstruct(node: Node): Construct | undefined {
	const value = getStr(getData(node).construct);
	return value ? (value as Construct) : undefined;
}



// Handles action text.
export function actionText(node: Node): string {
	const data = getData(node);
	return getStr(data.sourceText).trim() || sanitizeStatement(getStr(data.label).trim());
}



const EXCEPTION_LABELS = new Set(["exception", "catch", "error"]);


// Checks whether is exception edge.
export const isExceptionEdge = (label: unknown): boolean =>
	EXCEPTION_LABELS.has(normalize(label));


// Checks whether is back edge.
export const isBackEdge = (edge: Edge): boolean => edge.type === "back";


// Checks whether is try exit edge.
export const isTryExitEdge = (edge: Edge): boolean =>
	normalize(edge.label) === "exit try";





// Handles extract label.
export function extractLabel(text: string, keyword: "break" | "continue"): string | undefined {
	const m = text.match(new RegExp(`^${keyword}\\s+([A-Za-z_$][\\w$]*)`));
	return m ? m[1] : undefined;
}



// Handles sniff terminator.
export function sniffTerminator(text: string): Outcome | undefined {
	const t = text.trim();
	if (/^return\b/.test(t) || /^throw\b/.test(t)) return RETURN;
	if (/^break\b/.test(t)) return { kind: "break", label: extractLabel(t, "break") };
	if (/^continue\b/.test(t)) return { kind: "continue", label: extractLabel(t, "continue") };
	return undefined;
}



// Checks whether is terminator node.
export function isTerminatorNode(node: Node): boolean {
	const construct = getConstruct(node);
	if (
		construct === "return" ||
		construct === "throw" ||
		construct === "break" ||
		construct === "continue"
	) {
		return true;
	}
	return Boolean(sniffTerminator(actionText(node)));
}





// Handles outgoing forward edges.
export function outgoingForwardEdges(edges: Edge[], id: string): Edge[] {
	return getOutgoingEdges(edges, id).filter(
		(e) => !isBackEdge(e) && !isExceptionEdge(e.label),
	);
}



// Handles fallthrough successor.
export function fallthroughSuccessor(edges: Edge[], id: string): string | undefined {
	const out = outgoingForwardEdges(edges, id);
	if (out.length === 0) return undefined;

	const unlabeled = out.find((e) => {
		const n = normalize(e.label);
		return !n || n === "next";
	});
	if (unlabeled) return String(unlabeled.target);

	const fallish = out.find((e) => {
		const n = normalize(e.label);
		return n === "no" || n === "false" || n === "done" || n === "finally";
	});
	return String((fallish ?? out[0]).target);
}


// Handles pick edge.
export function pickEdge(outgoing: Edge[], preferredLabels: string[]): Edge | undefined {
	return findLabeledEdge(outgoing, preferredLabels);
}