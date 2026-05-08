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
    `- debug: ${config.debug}`,
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