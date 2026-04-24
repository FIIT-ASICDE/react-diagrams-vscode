import * as vscode from "vscode";
import { ComponentActivityPanel } from "../../app@panels/ComponentActivityPanel";
import { ChatContextSnapshot } from "../types";
import { readCurrentDiagramContext } from "./diagram-snapshot";

export async function collectChatSnapshot(userPrompt: string): Promise<ChatContextSnapshot> {
  const document = pickPreferredDocument();
  const editor = document ? findEditorFor(document) : undefined;
  const hasSelection = Boolean(editor && !editor.selection.isEmpty);

  const selectedOrFullCode = !document
    ? ""
    : hasSelection
      ? editor!.document.getText(editor!.selection)
      : document.getText();

  const codeContextKind: ChatContextSnapshot["codeContextKind"] = !document
    ? "none"
    : hasSelection
      ? "selected"
      : "full-file";

  return {
    userPrompt,
    activeFilePath: document?.uri.fsPath,
    selectedOrFullCode,
    codeContextKind,
    diagramContext: await readCurrentDiagramContext(),
  };
}

function pickPreferredDocument(): vscode.TextDocument | undefined {
  const panelDoc = getPanelSourceDocument();
  if (panelDoc && isSupportedCodeFile(panelDoc)) return panelDoc;

  const active = vscode.window.activeTextEditor?.document;
  if (active && isSupportedCodeFile(active)) return active;

  const visible = vscode.window.visibleTextEditors
    .map((e) => e.document)
    .find(isSupportedCodeFile);
  if (visible) return visible;

  return vscode.workspace.textDocuments.find(isSupportedCodeFile);
}

function getPanelSourceDocument(): vscode.TextDocument | undefined {
  const panelClass = ComponentActivityPanel as typeof ComponentActivityPanel & {
    getCurrentSourceDocument?: () => vscode.TextDocument | undefined;
  };
  return panelClass.getCurrentSourceDocument?.();
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