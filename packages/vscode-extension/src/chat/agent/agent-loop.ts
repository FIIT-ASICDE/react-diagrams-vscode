import * as vscode from "vscode";
import { ChatContext, ToolResult } from "../context/chat-context";
import { CODE_FROM_DIAGRAM_TOOL_NAME, getConfig, DIAGRAM_TOOL_NAME } from "../config";
import { streamOnce } from "./model-stream";
import {
  buildPromptParts,
  buildSystemPrompt,
} from "./prompt-builder";
import { buildToolInput, isAllowedTool } from "./tool-dispatch";

export interface AgenticLoopArgs {
  model: vscode.LanguageModelChat;
  tools: vscode.LanguageModelChatTool[];
  userMessage: string;
  context: ChatContext;
  refreshContext: () => Promise<void>;
  request: vscode.ChatRequest;
  token: vscode.CancellationToken;
  stream: vscode.ChatResponseStream;
  onToolCallEvent?: (event: ToolCallEvent) => void;
}

export interface ToolCallEvent {
  iteration: number;
  name: string;
  callId: string;
  input: Record<string, unknown> | undefined;
  startedAt: string;
  finishedAt: string;
  success: boolean;
  errorMessage?: string;
}

export async function runAgenticLoop(args: AgenticLoopArgs): Promise<string | undefined> {
  const config = getConfig();

  for (let iteration = 0; iteration < config.maxToolIterations + 1; iteration++) {
    const messages: vscode.LanguageModelChatMessage[] = [
      vscode.LanguageModelChatMessage.User(buildSystemPrompt()),
      vscode.LanguageModelChatMessage.User(buildPromptParts(args.userMessage, args.context)),
    ];

    const isLastIteration = iteration === config.maxToolIterations;
    const options = buildRequestOptions(args.tools, isLastIteration);

    const result = await streamOnce(args.model, messages, options, args.token, args.stream);
    if (!result.ok) return undefined;
    if (!result.toolCall) return result.text;

    if (!isAllowedTool(result.toolCall.name)) {
      return result.text || "The model requested an unknown tool. Please try again.";
    }

    const toolResult = await invokeTool(args, result.toolCall, iteration);
    if (!toolResult) {
      args.context.toolResults.push({
        toolName: result.toolCall.name,
        callId: result.toolCall.callId,
        iteration,
        success: false,
        at: new Date().toISOString(),
        errorMessage: "Tool invocation failed",
      });
      continue;
    }

    args.context.toolResults.push(buildToolResultMetadata(result.toolCall, toolResult, iteration));
    await args.refreshContext();
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
  iteration: number,
): Promise<vscode.LanguageModelToolResult | undefined> {
  announceToolStart(args.stream, toolCall.name);

  const input = buildToolInput(toolCall.name, args.context, toolCall.input);
  const startedAt = new Date().toISOString();

  try {
    const toolResult = await vscode.lm.invokeTool(
      toolCall.name,
      { input, toolInvocationToken: args.request.toolInvocationToken },
      args.token,
    );
    args.onToolCallEvent?.({
      iteration,
      name: toolCall.name,
      callId: toolCall.callId,
      input,
      startedAt,
      finishedAt: new Date().toISOString(),
      success: true,
    });
    return toolResult;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    args.onToolCallEvent?.({
      iteration,
      name: toolCall.name,
      callId: toolCall.callId,
      input,
      startedAt,
      finishedAt: new Date().toISOString(),
      success: false,
      errorMessage: msg,
    });
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

function buildToolResultMetadata(
  toolCall: vscode.LanguageModelToolCallPart,
  _toolResult: vscode.LanguageModelToolResult,
  iteration: number,
): ToolResult {
  return {
    toolName: toolCall.name,
    callId: toolCall.callId,
    iteration,
    success: true,
    at: new Date().toISOString(),
  };
}