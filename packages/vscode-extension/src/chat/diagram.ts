import * as vscode from "vscode";
import { registerRefactorCommands } from "./commands";
import { DEBUG, DIAGRAM_CHAT_PARTICIPANT_ID, MODEL_TYPE } from "./config";
import { collectChatSnapshot } from "./snapshot/chat-snapshot";
import { collectAgentContext, describeMissing } from "./context/agent-context";
import {
  applyRelevanceVerdict,
  checkContextRelevance,
  RelevanceVerdict,
} from "./context/relevance-gate";
import { resolveUserFocus } from "./focus/user-focus";
import { collectAvailableTools } from "./agent/tool-dispatch";
import { runAgenticLoop } from "./agent/agent-loop";
import { renderAgentResponse } from "./response/render-response";
import { buildHelpText, isHelpPrompt, printDebug } from "./debug";
import { selectModelByType } from "./utils";
import { getConfig } from "./config";

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
  const snapshot = await collectChatSnapshot(request.prompt);
  const config = getConfig();
  if (isHelpPrompt(snapshot.userPrompt)) {
    stream.markdown(buildHelpText());
    return;
  }

  const model = request.model ?? (await selectModelByType(MODEL_TYPE));
  if (!model) {
    stream.markdown(
      `No chat model is available for MODEL_TYPE='${MODEL_TYPE}'. Ensure Copilot Chat is enabled.`,
    );
    return;
  }

  // 1. Collect raw context from the editor + diagram panel.
  const rawContext = await collectAgentContext(snapshot);

  // 2. Ask the model whether the current context is actually relevant to the
  //    user's prompt. A diagram of function A is dropped when the user asks
  //    about function B.
  let verdict: RelevanceVerdict | undefined;
  let context = rawContext;

  if (config.maxToolIterations > 0) {
      if (rawContext.hasAnything) {
      verdict = await checkContextRelevance(model, snapshot.userPrompt, rawContext, token);
      context = applyRelevanceVerdict(rawContext, verdict);
    }
}
  const focus = resolveUserFocus(snapshot, context);

  if (DEBUG) {
    printDebug(stream, snapshot, context, focus, verdict);
  }

  if (!context.hasAnything) {
    stream.markdown(
      "I don't have any context to work with. " +
      describeMissing(context) +
      " Adjust the participant config or open/select the relevant content, then ask again.",
    );
    return;
  }

  const tools = collectAvailableTools(context);

  const finalText = await runAgenticLoop({
    model, tools, snapshot, context, focus, request, token, stream,
  });

  if (finalText === undefined) return;
  await renderAgentResponse(finalText, snapshot, focus, stream);
}