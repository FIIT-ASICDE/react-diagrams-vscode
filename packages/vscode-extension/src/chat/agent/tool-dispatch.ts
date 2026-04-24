import * as vscode from "vscode";
import { ChatContextSnapshot } from "../types";
import { UserFocus } from "../focus/user-focus";
import { AgentContext } from "../context/agent-context";
import {
  CODE_FROM_DIAGRAM_TOOL_NAME,
  getConfig,
  DIAGRAM_TOOL_NAME,
} from "../config";

export function collectAvailableTools(
  _context: AgentContext,
): vscode.LanguageModelChatTool[] {
    const config = getConfig();
  if (!config.allowToolCall) return [];

  const toolNames = new Set([DIAGRAM_TOOL_NAME, CODE_FROM_DIAGRAM_TOOL_NAME]);
  return vscode.lm.tools.filter((tool) => toolNames.has(tool.name));
}

export function isAllowedTool(name: string): boolean {
  return name === DIAGRAM_TOOL_NAME || name === CODE_FROM_DIAGRAM_TOOL_NAME;
}

export function buildToolInput(
  toolName: string,
  snapshot: ChatContextSnapshot,
  focus: UserFocus,
  modelProposedInput: unknown,
): Record<string, unknown> {
  if (toolName === DIAGRAM_TOOL_NAME) {
    return buildDiagramToolInput(snapshot, focus, modelProposedInput);
  }

  // For CODE_FROM_DIAGRAM_TOOL_NAME, pass through whatever the model proposed.
  return isRecord(modelProposedInput) ? modelProposedInput : {};
}

function buildDiagramToolInput(
  snapshot: ChatContextSnapshot,
  focus: UserFocus,
  modelProposedInput: unknown,
): Record<string, unknown> {
  const fromFocus = buildInputFromFocus(focus);
  if (fromFocus) return fromFocus;

  const fromModel = buildInputFromModelProposal(modelProposedInput);
  if (fromModel) return fromModel;

  const fromSnapshot = buildInputFromSnapshot(snapshot);
  if (fromSnapshot) return fromSnapshot;

  return { wholeFile: true, title: "Activity Diagram - Whole File" };
}

function buildInputFromFocus(focus: UserFocus): Record<string, unknown> | null {
  if (!focus.snippet) return null;
  return {
    sourceText: focus.snippet,
    title: focus.name ? `Activity Diagram - ${focus.name}` : "Activity Diagram - Selected Code",
  };
}

function buildInputFromModelProposal(input: unknown): Record<string, unknown> | null {
  if (!isRecord(input)) return null;

  const proposedSource = input.sourceText;
  if (typeof proposedSource !== "string" || !proposedSource.trim()) return null;

  const title = typeof input.title === "string" && input.title.trim()
    ? input.title
    : "Activity Diagram - Proposed by Agent";

  return { sourceText: proposedSource, title };
}

function buildInputFromSnapshot(snapshot: ChatContextSnapshot): Record<string, unknown> | null {
  if (!snapshot.selectedOrFullCode.trim()) return null;

  return {
    sourceText: snapshot.selectedOrFullCode,
    title: snapshot.activeFilePath
      ? `Activity Diagram - ${snapshot.activeFilePath.split(/[\\/]/).pop()}`
      : "Activity Diagram - Whole File",
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}