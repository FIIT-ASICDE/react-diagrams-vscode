import * as vscode from "vscode";
import { ChatContextSnapshot } from "../types";
import { AgentContext } from "../context/agent-context";
import { UserFocus } from "../focus/user-focus";
import {
  CODE_FROM_DIAGRAM_TOOL_NAME,
  DIAGRAM_TOOL_NAME,
  RESPONSE_LANGUAGE,
} from "../config";

export function buildSystemPrompt(): string {
  return [
    "Role: expert assistant for TypeScript, TSX, and activity diagrams.",
    `Respond in: ${RESPONSE_LANGUAGE}.`,
    "",
    "Decide the appropriate response type from the user's prompt:",
    "",
    "1. REFACTOR — the user asks to refactor, rewrite, restructure, or clean up code.",
    "   Return refactored code inside a single fenced code block (```typescript ... ```).",
    "   The block is applied directly to the file, so it must contain ONLY valid code —",
    "   no comments like '// rest unchanged'.",
    "   If a `FOCUS` section is provided, return ONLY that focused code.",
    "   Otherwise return the full code you were given.",
    "   Preserve behavior unless the user explicitly asks to change it.",
    "",
    "   If the user ALSO asks for explanation: put the code block FIRST, then prose after.",
    "   Use at most ONE code block total.",
    "",
    "2. EXPLANATION / ANALYSIS — the user asks to explain, analyze, compare, or find issues.",
    "   Answer in prose. No code block unless showing a very short example.",
    "",
    "3. TOOLS — you have two tools available. Pick the right one based on the user's intent:",
    "",
    `   a) ${DIAGRAM_TOOL_NAME}`,
    "      Use when the user wants to CREATE, GENERATE, SHOW, VISUALIZE, or DRAW",
    "      an activity diagram FROM CODE.",
    "      Examples: 'create a diagram', 'show flow', 'visualize this function'.",
    "      If a `FOCUS` section is present, pass ONLY that focused code as `sourceText`.",
    "      Do NOT pass the entire file when the user asked about a specific function.",
    "",
    `   b) ${CODE_FROM_DIAGRAM_TOOL_NAME}`,
    "      Use when the user wants to GENERATE, CREATE, PRODUCE, or BUILD CODE",
    "      FROM THE EXISTING ACTIVITY DIAGRAM. The activity diagram is already",
    "      rendered on screen; the user wants its TypeScript equivalent.",
    "      Examples: 'generate code from this diagram', 'turn the diagram into code'.",
    "      Do NOT try to write this code yourself — the tool does it deterministically.",
    "      This tool takes no required input; just call it.",
    "",
    "Rules:",
    "- A `FOCUS` section always takes precedence over the full file.",
    "- Do not assume anything not explicitly provided.",
    "- Answer strictly what the user asked — nothing more, nothing less.",
  ].join("\n");
}

type UserPart = vscode.LanguageModelTextPart | vscode.LanguageModelDataPart;

export function buildInitialUserParts(
  snapshot: ChatContextSnapshot,
  context: AgentContext,
  focus: UserFocus,
): UserPart[] {
  const text = assembleInitialUserText(snapshot, context, focus);

  const parts: UserPart[] = [new vscode.LanguageModelTextPart(text)];
  if (context.diagramImage.part) parts.push(context.diagramImage.part);
  return parts;
}

function assembleInitialUserText(
  snapshot: ChatContextSnapshot,
  context: AgentContext,
  focus: UserFocus,
): string {
  const lines: string[] = [
    `User prompt: ${snapshot.userPrompt}`,
    "",
    `File: ${snapshot.activeFilePath ?? "<none>"}`,
    `Code context kind: ${snapshot.codeContextKind}`,
  ];

  appendFocusSection(lines, focus);
  appendCodeSection(lines, context, focus);
  appendDiagramJsonSection(lines, context);
  appendDiagramImageMarker(lines, context);

  return lines.join("\n");
}

function appendFocusSection(lines: string[], focus: UserFocus): void {
  if (!focus.snippet) return;

  lines.push(
    "",
    `FOCUS — the user is asking about this${focus.name ? ` (${focus.name})` : ""}:`,
    "```typescript",
    focus.snippet,
    "```",
  );
}

function appendCodeSection(lines: string[], context: AgentContext, focus: UserFocus): void {
  if (!context.code.present) {
    lines.push("", "Available code: <none>");
    return;
  }

  lines.push(
    "",
    focus.snippet ? "Full file (for surrounding context only):" : "Available code:",
    "```typescript",
    context.code.text,
    "```",
  );
}

function appendDiagramJsonSection(lines: string[], context: AgentContext): void {
  if (context.diagramJson.present) {
    lines.push("", "Available activity diagram JSON:", context.diagramJson.text);
  } else {
    lines.push("", "Available activity diagram JSON: <none>");
  }
}

function appendDiagramImageMarker(lines: string[], context: AgentContext): void {
  lines.push(
    "",
    context.diagramImage.present
      ? "A rendered diagram image is attached below."
      : "Rendered diagram image: <none>",
  );
}

export function buildToolFollowUpText(refreshed: AgentContext): string {
  return [
    "",
    "---",
    "Refreshed diagram context after the tool ran:",
    refreshed.diagramJson.present
      ? "Diagram JSON:\n" + refreshed.diagramJson.text
      : "Diagram JSON: <still unavailable>",
    "",
    refreshed.diagramImage.present
      ? "A rendered diagram image is attached below."
      : "Rendered diagram image: <still unavailable>",
    "",
    "Now finish the user's original request using this refreshed context.",
  ].join("\n");
}