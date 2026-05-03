import { type Node, type Edge } from "@xyflow/react";
import { findLabeledEdge, getOutgoingEdges } from "../graph/traversal";
import { normalize, sanitizeStatement } from "../shared/string-utils";
import type { Construct } from "../shared/construct";
import type { AnyNodeData, Outcome } from "./Types";
import { RETURN } from "./Types";

// ── Node-data readers ──────────────────────────────────────────────────────

export const getData = (node: Node): AnyNodeData =>
	(node.data as AnyNodeData | undefined) ?? {};

export const getStr = (value: unknown): string =>
	typeof value === "string" ? value : "";

export function getConstruct(node: Node): Construct | undefined {
	const value = getStr(getData(node).construct);
	return value ? (value as Construct) : undefined;
}

/**
 * Pick the best textual representation of an action node:
 *   - prefer the verbatim source text (preserves user formatting),
 *   - fall back to a sanitised label (adds trailing `;` when needed).
 */
export function actionText(node: Node): string {
	const data = getData(node);
	return getStr(data.sourceText).trim() || sanitizeStatement(getStr(data.label).trim());
}

// ── Edge classifiers ───────────────────────────────────────────────────────

const EXCEPTION_LABELS = new Set(["exception", "catch", "error"]);

export const isExceptionEdge = (label: unknown): boolean =>
	EXCEPTION_LABELS.has(normalize(label));

export const isBackEdge = (edge: Edge): boolean => edge.type === "back";

export const isTryExitEdge = (edge: Edge): boolean =>
	normalize(edge.label) === "exit try";

// ── Terminator detection ───────────────────────────────────────────────────

/**
 * Detect a `break label` / `continue label` pattern at the start of
 * an action's text. Returns the label name or undefined.
 */
export function extractLabel(text: string, keyword: "break" | "continue"): string | undefined {
	const m = text.match(new RegExp(`^${keyword}\\s+([A-Za-z_$][\\w$]*)`));
	return m ? m[1] : undefined;
}

/**
 * Recognise a terminator written into an action's text. Older parsers
 * may not carry an explicit `construct` tag for break / continue —
 * we sniff them out so flow tracking still works.
 */
export function sniffTerminator(text: string): Outcome | undefined {
	const t = text.trim();
	if (/^return\b/.test(t) || /^throw\b/.test(t)) return RETURN;
	if (/^break\b/.test(t)) return { kind: "break", label: extractLabel(t, "break") };
	if (/^continue\b/.test(t)) return { kind: "continue", label: extractLabel(t, "continue") };
	return undefined;
}

/**
 * A node is a terminator when it carries a return/throw/break/continue
 * construct OR its text matches one (sniffed). Used by branch-join
 * detection to avoid walking past a control-flow exit.
 *
 * Pure function — no class membership. BranchResolver used to receive
 * this as a callback from CodeGenerator; now it just imports it.
 */
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

// ── Edge navigation ────────────────────────────────────────────────────────

/**
 * Forward, non-exceptional edges leaving `id`. The default
 * "what comes next" set for sequence walking. Exception edges and
 * back-edges are excluded — they have dedicated handling (catch
 * routing and loop-back detection respectively).
 */
export function outgoingForwardEdges(edges: Edge[], id: string): Edge[] {
	return getOutgoingEdges(edges, id).filter(
		(e) => !isBackEdge(e) && !isExceptionEdge(e.label),
	);
}

/**
 * Pick the natural successor of a node when control falls through.
 * Preference order:
 *   1. unlabeled or 'next'  → the canonical fall-through edge
 *   2. 'no'/'false'/'done'/'finally' → branch labels meaning "the
 *      other side", used after if / try emit
 *   3. first edge as a last resort
 *
 * Returns undefined when there are no forward edges (terminal node).
 */
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

export function pickEdge(outgoing: Edge[], preferredLabels: string[]): Edge | undefined {
	return findLabeledEdge(outgoing, preferredLabels);
}