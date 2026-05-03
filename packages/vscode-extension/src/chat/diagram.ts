import * as vscode from "vscode";
import { registerRefactorCommands } from "./commands";
import { DEBUG, DIAGRAM_CHAT_PARTICIPANT_ID, MODEL_TYPE, getConfig } from "./config";
import { collectAvailableTools } from "./agent/tool-dispatch";
import { runAgenticLoop, ToolCallEvent } from "./agent/agent-loop";
import { buildHelpText, isHelpPrompt, printDebug } from "./debug";
import { selectModelByType } from "./utils";
import { appendExperiment, buildExperimentEntry } from "./experiment-writer";
import { ChatContext, collectContext, refreshContext } from "./context/chat-context";

export function registerDiagramChatParticipant(
  context: vscode.ExtensionContext,
): vscode.Disposable {
  registerRefactorCommands(context);

  const participant = vscode.chat.createChatParticipant(
    DIAGRAM_CHAT_PARTICIPANT_ID,
    handleChatRequest,
  );
  participant.iconPath = new vscode.ThemeIcon("graph-line");
  context.subscriptions.push(participant);
  return participant;
}

async function handleChatRequest(
  request: vscode.ChatRequest,
  _chatContext: vscode.ChatContext,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken,
): Promise<void> {
  const startedAtMs = Date.now();
  const toolCalls: ToolCallEvent[] = [];

  let answer = "";
  let status: "success" | "error" = "success";
  let errorMessage: string | undefined;

  const userMessage = request.prompt;
  const config = getConfig();
  let context: ChatContext = await collectContext(config);
  let model: vscode.LanguageModelChat | undefined;

  try {
    if (isHelpPrompt(userMessage)) {
      const helpText = buildHelpText();
      stream.markdown(helpText);
      answer = helpText;
      return;
    }

    model = request.model ?? (await selectModelByType(MODEL_TYPE));
    if (!model) {
      const noModelMsg =
        `No chat model is available for MODEL_TYPE='${MODEL_TYPE}'. Ensure Copilot Chat is enabled.`;
      stream.markdown(noModelMsg);
      answer = noModelMsg;
      status = "error";
      errorMessage = "No model available";
      return;
    }

    if (DEBUG) {
      printDebug(stream, context);
    }

    const tools = collectAvailableTools();
    const finalText = await runAgenticLoop({
      model,
      tools,
      userMessage,
      context,
      refreshContext: async () => {
        await refreshContext(context, config);
      },
      request,
      token,
      stream,
      onToolCallEvent: (event) => {
        toolCalls.push(event);
      },
    });

    if (finalText === undefined) {
      status = "error";
      errorMessage = "Agent loop returned no final text";
      return;
    }

    answer = finalText;
    stream.markdown(finalText);
  } catch (err) {
    status = "error";
    errorMessage = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    const entry = buildExperimentEntry({
      prompt: userMessage,
      answer,
      startedAtMs,
      endedAtMs: Date.now(),
      status,
      errorMessage,
      context,
      toolCalls,
      model,
    });

    try {
      await appendExperiment(entry);
    } catch {
      // Logging should not break user-facing chat behavior.
    }
  }
}