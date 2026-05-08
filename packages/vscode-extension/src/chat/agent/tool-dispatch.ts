import * as vscode from "vscode";
import { ChatContext } from "../context/chat-context";
import {
  CODE_FROM_DIAGRAM_TOOL_NAME,
  getConfig,
  DIAGRAM_TOOL_NAME,
} from "../config";

export function collectAvailableTools(): vscode.LanguageModelChatTool[] {
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
  context: ChatContext,
  modelProposedInput: unknown,
): Record<string, unknown> {
  if (toolName === DIAGRAM_TOOL_NAME) {
    return buildDiagramToolInput(context, modelProposedInput);
  }

  // For CODE_FROM_DIAGRAM_TOOL_NAME, pass through whatever the model proposed.
  return isRecord(modelProposedInput) ? modelProposedInput : {};
}

function buildDiagramToolInput(
  context: ChatContext,
  modelProposedInput: unknown,
): Record<string, unknown> {
  // Prefer explicit model input when it already provides valid sourceText.
  const fromModel = buildInputFromModelProposal(modelProposedInput);
  if (fromModel) return fromModel;

  // Fallback to currently collected editor code.
  if (context.code && context.code.trim()) {
    return {
      sourceText: context.code,
      title: context.activeFilePath
        ? `Activity Diagram - ${context.activeFilePath.split(/[\\/]/).pop()}`
        : "Activity Diagram - Current Code",
    };
  }

  return {};
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

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}