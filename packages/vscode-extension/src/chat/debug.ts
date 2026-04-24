import * as vscode from "vscode";
import { ChatContextSnapshot } from "./types";
import { AgentContext } from "./context/agent-context";
import { UserFocus } from "./focus/user-focus";
import { RelevanceVerdict } from "./context/relevance-gate";
import { getConfig } from "./config";

export function printDebug(
  stream: vscode.ChatResponseStream,
  snapshot: ChatContextSnapshot,
  context: AgentContext,
  focus: UserFocus,
  verdict: RelevanceVerdict | undefined,
): void {
    
  stream.markdown(
    [
      "### Debug",
      ...configLines(),
      "",
      ...snapshotLines(snapshot),
      "",
      ...focusLines(focus),
      "",
      ...contextLines(context),
      "",
      ...relevanceLines(verdict),
    ].join("\n") + "\n",
  );
}

function configLines(): string[] {
    const config = getConfig();
  return [
    "**Config:**",
    `- code: ${config.code}`,
    `- diagramJson: ${config.diagramJson}`,
    `- diagramImage: ${config.diagramImage}`,
    `- diagramImageTimeoutMs: ${config.diagramImageTimeoutMs}`,
    `- diagramRelevanceCheck: ${config.diagramRelevanceCheck}`,
    `- allowToolCall: ${config.allowToolCall}`,
    `- maxToolIterations: ${config.maxToolIterations}`,
  ];
}

function snapshotLines(snapshot: ChatContextSnapshot): string[] {
  return [
    "**Snapshot:**",
    `- active file: ${snapshot.activeFilePath ?? "<none>"}`,
    `- code context kind: ${snapshot.codeContextKind}`,
    `- code length on screen: ${snapshot.selectedOrFullCode.length}`,
    `- diagram availability: ${snapshot.diagramContext.availability}`,
  ];
}

function focusLines(focus: UserFocus): string[] {
  return [
    "**Focus:**",
    `- origin: ${focus.origin}`,
    `- name: ${focus.name ?? "<none>"}`,
    `- snippet length: ${focus.snippet?.length ?? 0}`,
  ];
}

function contextLines(context: AgentContext): string[] {
  return [
    "**Sent to agent:**",
    `- code: ${describePresence(context.code)}`,
    `- diagram JSON: ${describePresence(context.diagramJson)}`,
    `- diagram image: ${describePresence(context.diagramImage)}`,
  ];
}

function describePresence(field: { present: boolean; reason?: string }): string {
  const base = field.present ? "yes" : "no";
  return field.reason ? `${base} (${field.reason})` : base;
}

function relevanceLines(verdict: RelevanceVerdict | undefined): string[] {
  if (!verdict) return ["**Relevance gate:** not run"];
  return [
    "**Relevance gate:**",
    `- code relevant: ${verdict.codeRelevant}`,
    `- diagram relevant: ${verdict.diagramRelevant}`,
    `- reason: ${verdict.reason ?? "<none>"}`,
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