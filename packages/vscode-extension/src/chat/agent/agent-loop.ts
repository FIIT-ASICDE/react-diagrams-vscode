import * as vscode from "vscode";
import { ChatContextSnapshot } from "../types";
import { AgentContext, collectAgentContext } from "../context/agent-context";
import { UserFocus } from "../focus/user-focus";
import { CODE_FROM_DIAGRAM_TOOL_NAME, getConfig, DIAGRAM_TOOL_NAME } from "../config";
import { streamOnce } from "./model-stream";
import {
  buildInitialUserParts,
  buildSystemPrompt,
  buildToolFollowUpText,
} from "./prompt-builder";
import { buildToolInput, isAllowedTool } from "./tool-dispatch";

export interface AgenticLoopArgs {
  model: vscode.LanguageModelChat;
  tools: vscode.LanguageModelChatTool[];
  snapshot: ChatContextSnapshot;
  context: AgentContext;
  focus: UserFocus;
  request: vscode.ChatRequest;
  token: vscode.CancellationToken;
  stream: vscode.ChatResponseStream;
}

export async function runAgenticLoop(args: AgenticLoopArgs): Promise<string | undefined> {
  const messages: vscode.LanguageModelChatMessage[] = [
    vscode.LanguageModelChatMessage.User(buildSystemPrompt()),
    vscode.LanguageModelChatMessage.User(buildInitialUserParts(args.snapshot, args.context, args.focus)),
  ];

  const config = getConfig();

  for (let iteration = 0; iteration < config.maxToolIterations + 1; iteration++) {
    const isLastIteration = iteration === config.maxToolIterations;
    const options = buildRequestOptions(args.tools, isLastIteration);

    const result = await streamOnce(args.model, messages, options, args.token, args.stream);
    if (!result.ok) return undefined;
    if (!result.toolCall) return result.text;

    if (!isAllowedTool(result.toolCall.name)) {
      return result.text || "The model requested an unknown tool. Please try again.";
    }

    const toolResult = await invokeTool(args, result.toolCall);
    if (!toolResult) return undefined;

    await appendToolRoundToMessages(args, messages, result.toolCall, toolResult);
  }

  return "I wasn't able to complete the request.";
}

function buildRequestOptions(
  tools: vscode.LanguageModelChatTool[],
  isLastIteration: boolean,
): vscode.LanguageModelChatRequestOptions {
  const hasTools = tools.length > 0;
  if (!hasTools || isLastIteration) return {};
  return { tools, toolMode: vscode.LanguageModelChatToolMode.Auto };
}

async function invokeTool(
  args: AgenticLoopArgs,
  toolCall: vscode.LanguageModelToolCallPart,
): Promise<vscode.LanguageModelToolResult | undefined> {
  announceToolStart(args.stream, toolCall.name);

  const input = buildToolInput(toolCall.name, args.snapshot, args.focus, toolCall.input);

  try {
    return await vscode.lm.invokeTool(
      toolCall.name,
      { input, toolInvocationToken: args.request.toolInvocationToken },
      args.token,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    args.stream.markdown(`❌ Tool invocation failed: \`${msg}\``);
    return undefined;
  }
}

function announceToolStart(stream: vscode.ChatResponseStream, toolName: string): void {
  if (toolName === DIAGRAM_TOOL_NAME) {
    stream.markdown("Generating diagram...\n\n");
  } else if (toolName === CODE_FROM_DIAGRAM_TOOL_NAME) {
    stream.markdown("Generating code from diagram...\n\n");
  }
}

async function appendToolRoundToMessages(
  args: AgenticLoopArgs,
  messages: vscode.LanguageModelChatMessage[],
  toolCall: vscode.LanguageModelToolCallPart,
  toolResult: vscode.LanguageModelToolResult,
): Promise<void> {
  await delay(750);

  const refreshed = await collectAgentContext(args.snapshot);
  const mergedContent = mergeToolResultWithFollowUp(
    toolResult,
    buildToolFollowUpText(refreshed),
    refreshed.diagramImage.part,
  );

  messages.push(
    vscode.LanguageModelChatMessage.Assistant([toolCall]),
    vscode.LanguageModelChatMessage.User([
      new vscode.LanguageModelToolResultPart(toolCall.callId, mergedContent),
    ]),
  );
}

type MessagePart = vscode.LanguageModelTextPart | vscode.LanguageModelDataPart;

function mergeToolResultWithFollowUp(
  toolResult: vscode.LanguageModelToolResult,
  followUpText: string,
  imagePart?: vscode.LanguageModelDataPart,
): MessagePart[] {
  const merged: MessagePart[] = [
    ...(toolResult.content as MessagePart[]),
    new vscode.LanguageModelTextPart(followUpText),
  ];
  if (imagePart) merged.push(imagePart);
  return merged;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}