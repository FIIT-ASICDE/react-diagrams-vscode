import * as path from "path";
import { mkdir, readFile, writeFile } from "fs/promises";
import * as vscode from "vscode";
import { ChatContext } from "./context/chat-context";
import { ToolCallEvent } from "./agent/agent-loop";

export interface ExperimentEntry {
  id: string;
  createdAt: string;
  durationMs: number;
  prompt: string;
  answer: string;
  answerLength: number;
  status: "success" | "error";
  errorMessage?: string;
  toolCallUsed: boolean;
  toolCalls: ToolCallEvent[];
  model: Record<string, unknown>;
  contextReceived: Record<string, unknown>;
}

export async function appendExperiment(entry: ExperimentEntry): Promise<void> {
  const filePath = getExperimentsPath();
  if (!filePath) return;

  const existing = await readExperimentArray(filePath);
  existing.push(entry);

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(existing, null, 2), "utf8");
}

export function buildExperimentEntry(args: {
  prompt: string;
  answer: string;
  startedAtMs: number;
  endedAtMs: number;
  status: "success" | "error";
  errorMessage?: string;
  context: ChatContext;
  toolCalls: ToolCallEvent[];
  model?: vscode.LanguageModelChat;
}): ExperimentEntry {
  return {
    id: `${args.endedAtMs}-${Math.random().toString(36).slice(2, 10)}`,
    createdAt: new Date(args.endedAtMs).toISOString(),
    durationMs: Math.max(0, args.endedAtMs - args.startedAtMs),
    prompt: args.prompt,
    answer: args.answer,
    answerLength: args.answer.length,
    status: args.status,
    errorMessage: args.errorMessage,
    toolCallUsed: args.toolCalls.length > 0,
    toolCalls: args.toolCalls,
    model: serializeModel(args.model),
    contextReceived: serializeContext(args.context),
  };
}

function getExperimentsPath(): string | undefined {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) return undefined;
  return path.join(workspaceRoot, "experiments");
}

async function readExperimentArray(filePath: string): Promise<ExperimentEntry[]> {
  try {
    const content = await readFile(filePath, "utf8");
    const parsed = JSON.parse(content) as unknown;
    if (Array.isArray(parsed)) return parsed as ExperimentEntry[];
    return [];
  } catch {
    return [];
  }
}

function serializeContext(context: ChatContext): Record<string, unknown> {
  return {
    activeFilePath: context.activeFilePath,
    codeContextKind: context.codeContextKind,
    code: context.code,
    codeLength: context.code?.length ?? 0,
    diagramJson: context.diagramJson,
    diagramJsonLength: context.diagramJson?.length ?? 0,
    diagramMermaid: context.diagramMermaid,
    diagramMermaidLength: context.diagramMermaid?.length ?? 0,
    diagramImage: context.diagramImage,
    hasDiagramImagePart: Boolean(context.diagramImagePart),
    diagramImageMimeType: context.diagramImagePart?.mimeType,
    diagramImageDataLength: getDataLength(context.diagramImagePart?.data),
    toolResults: context.toolResults,
  };
}

function serializeModel(model?: vscode.LanguageModelChat): Record<string, unknown> {
  if (!model) {
    return { available: false };
  }
  const candidate = model as unknown as Record<string, unknown>;
  return {
    available: true,
    id: candidate.id,
    family: candidate.family,
    name: candidate.name,
    vendor: candidate.vendor,
    version: candidate.version,
    maxInputTokens: candidate.maxInputTokens,
  };
}

function getDataLength(data: unknown): number | undefined {
  if (data == null) return undefined;
  if (typeof data === "string") return data.length;
  if (data instanceof Uint8Array) return data.byteLength;
  return undefined;
}
