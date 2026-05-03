import * as vscode from "vscode";
import { ChatContext } from "./context/chat-context";
import { getConfig } from "./config";

export function printDebug(
  stream: vscode.ChatResponseStream,
  context: ChatContext,
): void {
  stream.markdown(
    [
      "### Debug",
      ...configLines(),
      "",
      ...contextLines(context),
    ].join("\n") + "\n",
  );
}

function configLines(): string[] {
    const config = getConfig();
  return [
    "**Config:**",
    `- code: ${config.code}`,
    `- diagramJson: ${config.diagramJson}`,
    `- diagramMermaid: ${config.diagramMermaid}`,
    `- diagramImage: ${config.diagramImage}`,
    `- diagramImageTimeoutMs: ${config.diagramImageTimeoutMs}`,
    `- allowToolCall: ${config.allowToolCall}`,
    `- maxToolIterations: ${config.maxToolIterations}`,
  ];
}

function contextLines(context: ChatContext): string[] {
  return [
    "**Sent to agent:**",
    `- active file: ${context.activeFilePath ?? "<none>"}`,
    `- code context kind: ${context.codeContextKind}`,
    `- code: ${context.code ? `yes (${context.code.length} chars)` : "no"}`,
    `- diagram JSON: ${context.diagramJson ? `yes (${context.diagramJson.length} chars)` : "no"}`,
    `- diagram Mermaid: ${context.diagramMermaid ? `yes (${context.diagramMermaid.length} chars)` : "no"}`,
    `- diagram image: ${context.diagramImage ? "yes" : "no"}`,
    `- tool results count: ${context.toolResults.length}`,
  ];
}

export function buildHelpText(): string {
  return [
    "### What you can ask",
    "- @diagram explain this flow",
    "- @diagram analyze diagram",
    "- @diagram compare code and diagram",
    "- @diagram find inconsistencies",
    "- @diagram refactor this code",
    "- @diagram refactor #sym:functionName",
    "- @diagram create a diagram out of #sym:functionName",
    "",
  ].join("\n");
}

export function isHelpPrompt(prompt: string): boolean {
  const n = prompt.trim().toLowerCase();
  return ["?", "help", "", "what"].includes(n);
}