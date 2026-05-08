import * as vscode from "vscode";

export type StreamOnceResult =
  | { ok: true; text: string; toolCall?: vscode.LanguageModelToolCallPart }
  | { ok: false };

export async function streamOnce(
  model: vscode.LanguageModelChat,
  messages: vscode.LanguageModelChatMessage[],
  options: vscode.LanguageModelChatRequestOptions,
  token: vscode.CancellationToken,
  stream: vscode.ChatResponseStream,
): Promise<StreamOnceResult> {
  const response = await sendRequest(model, messages, options, token, stream);
  if (!response) return { ok: false };

  return consumeStream(response, stream);
}

async function sendRequest(
  model: vscode.LanguageModelChat,
  messages: vscode.LanguageModelChatMessage[],
  options: vscode.LanguageModelChatRequestOptions,
  token: vscode.CancellationToken,
  stream: vscode.ChatResponseStream,
): Promise<vscode.LanguageModelChatResponse | undefined> {
  try {
    return await model.sendRequest(messages, options, token);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    stream.markdown(`❌ Model request failed: \`${msg}\``);
    return undefined;
  }
}

async function consumeStream(
  response: vscode.LanguageModelChatResponse,
  stream: vscode.ChatResponseStream,
): Promise<StreamOnceResult> {
  const textParts: string[] = [];
  let toolCall: vscode.LanguageModelToolCallPart | undefined;

  try {
    for await (const part of response.stream) {
      // Model streams text and tool-call parts interleaved.
      if (part instanceof vscode.LanguageModelTextPart) {
        textParts.push(part.value);
      } else if (part instanceof vscode.LanguageModelToolCallPart) {
        // Keep the latest tool call from this pass.
        toolCall = part;
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    stream.markdown(`❌ Stream error: \`${msg}\``);
    return { ok: false };
  }

  return { ok: true, text: textParts.join(""), toolCall };
}