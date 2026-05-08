import * as vscode from "vscode";
import { ParticipantConfig } from "../config";
import {
  captureDiagramImageWithDiagnostics,
  dataUrlToImagePart,
  readCurrentDiagramContext,
} from "../snapshot/diagram-snapshot";

export type ToolResult = {
  toolName: string;
  callId: string;
  iteration: number;
  success: boolean;
  at: string;
  errorMessage?: string;
};

export type ChatContext = {
  code?: string;
  diagramJson?: string;
  diagramMermaid?: string;
  diagramImage?: string;
  diagramImagePart?: vscode.LanguageModelDataPart;
  toolResults: ToolResult[];
  activeFilePath?: string;
  codeContextKind: "selected" | "full-file" | "none";
};

export async function collectContext(config: ParticipantConfig): Promise<ChatContext> {
  const base = await collectBaseContext(config);
  return { ...base, toolResults: [] };
}

export async function refreshContext(context: ChatContext, config: ParticipantConfig): Promise<void> {
  const refreshed = await collectBaseContext(config);
  context.code = refreshed.code;
  context.diagramJson = refreshed.diagramJson;
  context.diagramMermaid = refreshed.diagramMermaid;
  context.diagramImage = refreshed.diagramImage;
  context.diagramImagePart = refreshed.diagramImagePart;
  context.activeFilePath = refreshed.activeFilePath;
  context.codeContextKind = refreshed.codeContextKind;
}

async function collectBaseContext(config: ParticipantConfig): Promise<Omit<ChatContext, "toolResults">> {
  const codeInfo = collectCodeContext(config);
  const diagramInfo = await collectDiagramContext(config);

  return {
    code: codeInfo.code,
    activeFilePath: codeInfo.activeFilePath,
    codeContextKind: codeInfo.codeContextKind,
    diagramJson: diagramInfo.diagramJson,
    diagramMermaid: diagramInfo.diagramMermaid,
    diagramImage: diagramInfo.diagramImage,
    diagramImagePart: diagramInfo.diagramImagePart,
  };
}

function collectCodeContext(config: ParticipantConfig): {
  code?: string;
  activeFilePath?: string;
  codeContextKind: "selected" | "full-file" | "none";
} {
  if (!config.code) {
    return { codeContextKind: "none" };
  }

  const document = pickPreferredDocument();
  const editor = document ? findEditorFor(document) : undefined;
  const hasSelection = Boolean(editor && !editor.selection.isEmpty);

  if (!document) {
    return { codeContextKind: "none" };
  }

  const selectedOrFullCode = hasSelection
    ? editor!.document.getText(editor!.selection)
    : document.getText();

  return {
    code: selectedOrFullCode.trim() ? selectedOrFullCode : undefined,
    activeFilePath: document.uri.fsPath,
    codeContextKind: hasSelection ? "selected" : "full-file",
  };
}

async function collectDiagramContext(config: ParticipantConfig): Promise<{
  diagramJson?: string;
  diagramMermaid?: string;
  diagramImage?: string;
  diagramImagePart?: vscode.LanguageModelDataPart;
}> {
  const result: {
    diagramJson?: string;
    diagramMermaid?: string;
    diagramImage?: string;
    diagramImagePart?: vscode.LanguageModelDataPart;
  } = {};

  if (config.diagramJson || config.diagramMermaid) {
    const diagram = await readCurrentDiagramContext();
    if (diagram.availability !== "unavailable") {
      if (config.diagramJson && diagram.json.trim()) {
        result.diagramJson = diagram.json;
      }
      if (config.diagramMermaid && diagram.mermaid?.trim()) {
        result.diagramMermaid = diagram.mermaid;
      }
    }
  }

  if (config.diagramImage) {
    const capture = await captureDiagramImageWithDiagnostics();
    const imagePart = dataUrlToImagePart(capture.dataUrl);
    if (imagePart) {
      result.diagramImage = "attached";
      result.diagramImagePart = imagePart;
    }
  }

  return result;
}

function pickPreferredDocument(): vscode.TextDocument | undefined {
  // Prefer active editor, then visible editors, then any open matching file.
  const active = vscode.window.activeTextEditor?.document;
  if (active && isSupportedCodeFile(active)) return active;

  const visible = vscode.window.visibleTextEditors
    .map((e) => e.document)
    .find(isSupportedCodeFile);
  if (visible) return visible;

  return vscode.workspace.textDocuments.find(isSupportedCodeFile);
}

function findEditorFor(document: vscode.TextDocument): vscode.TextEditor | undefined {
  const active = vscode.window.activeTextEditor;
  if (active && active.document.uri.toString() === document.uri.toString()) return active;
  return vscode.window.visibleTextEditors.find(
    (e) => e.document.uri.toString() === document.uri.toString(),
  );
}

function isSupportedCodeFile(document: vscode.TextDocument | undefined): boolean {
  if (!document || document.uri.scheme !== "file") return false;
  const p = document.uri.fsPath.toLowerCase();
  return p.endsWith(".ts") || p.endsWith(".tsx") || p.endsWith(".js") || p.endsWith(".jsx");
}
