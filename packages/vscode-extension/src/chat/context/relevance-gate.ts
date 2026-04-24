import * as vscode from "vscode";
import { AgentContext } from "./agent-context";
import { getConfig } from "../config";
import * as ts from "typescript";

/**
 * Result of asking the model whether the current context is relevant to the
 * user's prompt. Used to drop stale diagram context that doesn't match the
 * question — e.g. the user previously generated a diagram for function A but
 * is now asking about function B.
 */
export interface RelevanceVerdict {
  codeRelevant: boolean;
  diagramRelevant: boolean;
  reason?: string;
}

/**
 * Ask the model a quick yes/no question: is this context relevant to the
 * user's prompt? Returns a best-effort verdict. If the check fails or is
 * disabled, defaults to "everything is relevant" (safe fallback).
 */
export async function checkContextRelevance(
  model: vscode.LanguageModelChat,
  userPrompt: string,
  context: AgentContext,
  token: vscode.CancellationToken,
): Promise<RelevanceVerdict> {
    const config = getConfig();
  if (!config.diagramRelevanceCheck) {
    return { codeRelevant: true, diagramRelevant: true };
  }

  // Don't spend tokens if there's nothing to gate.
  if (!context.diagramJson.present && !context.code.present) {
    return { codeRelevant: true, diagramRelevant: true };
  }

  const prompt = buildRelevancePrompt(userPrompt, context);

  try {
    const response = await model.sendRequest(
      [vscode.LanguageModelChatMessage.User(prompt)],
      {},
      token,
    );

    const text = await collectResponseText(response);
    return parseVerdict(text, context);
  } catch {
    // On error, default to "relevant" — better to over-include than to drop.
    return { codeRelevant: true, diagramRelevant: true, reason: "relevance check failed" };
  }
}

function buildRelevancePrompt(userPrompt: string, context: AgentContext): string {
  const diagramSummary = context.diagramJson.present
    ? summarizeDiagram(context.diagramJson.text)
    : "<no diagram available>";

  const codeSummary = context.code.present
    ? summarizeCode(context.code.text)
    : "<no code available>";

  return [
    "You are a relevance classifier. Your job is to decide whether the provided",
    "context is useful for answering the user's prompt. Be strict: if the diagram",
    "shows function A but the user is asking about function B, the diagram is NOT",
    "relevant. If the user is asking a generic question (e.g. 'refactor this',",
    "'explain this code'), the open code is relevant.",
    "",
    "Respond with EXACTLY this JSON, nothing else:",
    '{"codeRelevant": boolean, "diagramRelevant": boolean, "reason": "short string"}',
    "",
    "---",
    `User prompt: ${userPrompt}`,
    "",
    `Code summary: ${codeSummary}`,
    "",
    `Diagram summary: ${diagramSummary}`,
  ].join("\n");
}

export function summarizeCode(code: string): string {
  const sourceFile = ts.createSourceFile(
    "file.ts",
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );

  const parts: string[] = [];

  for (const stmt of sourceFile.statements) {
    // imports
    if (ts.isImportDeclaration(stmt)) {
      parts.push(stmt.getText(sourceFile));
      continue;
    }

    // functions
    if (ts.isFunctionDeclaration(stmt)) {
      const name = stmt.name?.text ?? "anonymous";
      const params = stmt.parameters.map(p => p.getText(sourceFile)).join(", ");
      parts.push(`function ${name}(${params}) { ... }`);
      continue;
    }

    // arrow functions / const fn
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (
          ts.isIdentifier(decl.name) &&
          decl.initializer &&
          (ts.isArrowFunction(decl.initializer) ||
            ts.isFunctionExpression(decl.initializer))
        ) {
          const name = decl.name.text;
          const params = decl.initializer.parameters
            .map(p => p.getText(sourceFile))
            .join(", ");
          parts.push(`const ${name} = (${params}) => { ... }`);
        } else {
          parts.push(stmt.getText(sourceFile));
        }
      }
      continue;
    }

    // classes
    if (ts.isClassDeclaration(stmt)) {
      const name = stmt.name?.text ?? "AnonymousClass";
      parts.push(`class ${name} { ... }`);
      continue;
    }

    // fallback (types, enums, etc.)
    parts.push(stmt.getText(sourceFile));
  }

  return parts.join("\n");
}

function summarizeDiagram(diagramJson: string): string {
  try {
    const parsed = JSON.parse(diagramJson) as { nodes?: Array<{ data?: { label?: string } }> };
    const labels = (parsed.nodes ?? [])
      .map((n) => n.data?.label)
      .filter((l): l is string => typeof l === "string")
      .slice(0, 20);
    return `Diagram with ${parsed.nodes?.length ?? 0} nodes. Sample labels: ${labels.join(", ")}`;
  } catch {
    return "<diagram JSON unparseable>";
  }
}

async function collectResponseText(response: vscode.LanguageModelChatResponse): Promise<string> {
  const parts: string[] = [];
  for await (const part of response.stream) {
    if (part instanceof vscode.LanguageModelTextPart) {
      parts.push(part.value);
    }
  }
  return parts.join("");
}

function parseVerdict(text: string, context: AgentContext): RelevanceVerdict {
  // Tolerant parse: find a JSON object anywhere in the output.
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return { codeRelevant: true, diagramRelevant: true, reason: "unparseable verdict" };
  }

  try {
    const parsed = JSON.parse(match[0]) as Partial<RelevanceVerdict>;
    return {
      codeRelevant: context.code.present ? parsed.codeRelevant !== false : false,
      diagramRelevant: context.diagramJson.present ? parsed.diagramRelevant !== false : false,
      reason: typeof parsed.reason === "string" ? parsed.reason : undefined,
    };
  } catch {
    return { codeRelevant: true, diagramRelevant: true, reason: "JSON parse failed" };
  }
}

/**
 * Apply the relevance verdict by zeroing out context fields that the model
 * deemed irrelevant. Mutation-free — returns a new AgentContext.
 */
export function applyRelevanceVerdict(
  context: AgentContext,
  verdict: RelevanceVerdict,
): AgentContext {
  const code = verdict.codeRelevant
    ? context.code
    : { text: "", present: false, reason: `dropped as irrelevant: ${verdict.reason ?? "model verdict"}` };

  const diagramJson = verdict.diagramRelevant
    ? context.diagramJson
    : { text: "", present: false, reason: `dropped as irrelevant: ${verdict.reason ?? "model verdict"}` };

  const diagramImage = verdict.diagramRelevant
    ? context.diagramImage
    : { present: false, reason: `dropped as irrelevant: ${verdict.reason ?? "model verdict"}` };

  return {
    code,
    diagramJson,
    diagramImage,
    hasAnything: code.present || diagramJson.present || diagramImage.present,
  };
}