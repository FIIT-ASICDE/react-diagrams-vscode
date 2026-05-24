import * as vscode from "vscode";
import { ChatContext } from "../context/chat-context";
import {
  RESPONSE_LANGUAGE,
  DIAGRAM_TOOL_NAME,
  CODE_FROM_DIAGRAM_TOOL_NAME,
} from "../config";

export function buildSystemPrompt(): string {
  return [
    "Role: expert assistant for TypeScript, TSX, and activity diagrams.",
    `Respond in: ${RESPONSE_LANGUAGE}.`,
    "",
    "## Available context",
    "- The request may include code, diagram JSON, and/or an attached diagram image.",
    "",
    "## Tool usage",
    `- Call \`${DIAGRAM_TOOL_NAME}\` whenever the user wants to create, generate, visualize, show, or update an activity diagram from code.`,
    `  - If source code is provided in the context (CODE section), pass it as the \`sourceText\` input to the tool.`,
    `  - Do NOT skip the tool call and just describe what the diagram would look like — always invoke the tool.`,
    `- Call \`${CODE_FROM_DIAGRAM_TOOL_NAME}\` whenever the user wants to generate or reconstruct code FROM an existing activity diagram.`,
    `  - This applies when the user asks to "generate code", "write code for this diagram", or similar.`,
    "",
    "## Response format",
    "- After a tool call, interpret the tool result and answer the user concisely.",
    "- If the user asks for an explanation or refactoring suggestion (no diagram needed), respond with prose or a code block — no tool call required.",
    "- Only ask for missing context when the request cannot be answered from the provided code, diagram JSON, or attached image.",
    "- If the diagram is present, use it to analyse logic only after you analyse the code itself, and state whether the diagram changed your understanding of the code flow.",
  ].join("\n");
}

type UserPart = vscode.LanguageModelTextPart | vscode.LanguageModelDataPart;

export function buildPrompt(userMessage: string, context: ChatContext): string {
  const parts: string[] = [];

  parts.push(`User message:\n${userMessage}`);

  if (context.code) {
    parts.push("CODE:\n```ts\n" + context.code + "\n```");
  }

  if (context.diagramJson) {
    parts.push("DIAGRAM JSON:\n```json\n" + context.diagramJson + "\n```");
  }

  if (context.diagramMermaid) {
    parts.push("DIAGRAM MERMAID:\n```mermaid\n" + context.diagramMermaid + "\n```");
  }

  if (context.diagramImage && context.diagramImagePart) {
    parts.push("DIAGRAM IMAGE IS ATTACHED. Use the attached image as input for diagram analysis requests.");
  }

  if (context.toolResults.length > 0) {
    parts.push("TOOL RESULTS:\n```json\n" + JSON.stringify(context.toolResults, null, 2) + "\n```");
  }

  return parts.join("\n\n");
}

export function buildPromptParts(userMessage: string, context: ChatContext): UserPart[] {
  const prompt = buildPrompt(userMessage, context);
  const parts: UserPart[] = [new vscode.LanguageModelTextPart(prompt)];

  if (context.diagramImage && context.diagramImagePart) {
    parts.push(context.diagramImagePart);
  }

  return parts;
}