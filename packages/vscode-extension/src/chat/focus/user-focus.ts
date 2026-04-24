import { ChatContextSnapshot } from "../types";
import { AgentContext } from "../context/agent-context";
import { collectTopLevelNames, sliceNamedDeclaration } from "./ast-helpers";

export interface UserFocus {
  name: string | null;
  snippet: string | null;
  origin: "sym-reference" | "plain-mention" | "editor-selection" | "none";
}

export function resolveUserFocus(
  snapshot: ChatContextSnapshot,
  context: AgentContext,
): UserFocus {
  const fromSymRef = tryFocusFromSymReference(snapshot, context);
  if (fromSymRef) return fromSymRef;

  const fromPlainMention = tryFocusFromPlainMention(snapshot, context);
  if (fromPlainMention) return fromPlainMention;

  const fromSelection = tryFocusFromEditorSelection(snapshot);
  if (fromSelection) return fromSelection;

  return { name: null, snippet: null, origin: "none" };
}

function tryFocusFromSymReference(
  snapshot: ChatContextSnapshot,
  context: AgentContext,
): UserFocus | null {
  if (!context.code.present) return null;

  const symRefs = [...snapshot.userPrompt.matchAll(/#sym:([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
  if (symRefs.length === 0) return null;

  const name = symRefs[0];
  const snippet = sliceNamedDeclaration(context.code.text, name);
  if (!snippet) return null;

  return { name, snippet, origin: "sym-reference" };
}

function tryFocusFromPlainMention(
  snapshot: ChatContextSnapshot,
  context: AgentContext,
): UserFocus | null {
  if (!context.code.present) return null;

  const candidates = [...snapshot.userPrompt.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)].map((m) => m[1]);
  if (candidates.length === 0) return null;

  const topLevelNames = collectTopLevelNames(context.code.text);
  const matchedName = candidates.find((c) => topLevelNames.has(c));
  if (!matchedName) return null;

  const snippet = sliceNamedDeclaration(context.code.text, matchedName);
  if (!snippet) return null;

  return { name: matchedName, snippet, origin: "plain-mention" };
}

function tryFocusFromEditorSelection(snapshot: ChatContextSnapshot): UserFocus | null {
  if (snapshot.codeContextKind !== "selected" || !snapshot.selectedOrFullCode.trim()) {
    return null;
  }
  return { name: null, snippet: snapshot.selectedOrFullCode, origin: "editor-selection" };
}