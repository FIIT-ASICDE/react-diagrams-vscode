import * as vscode from "vscode";

export function registerRefactorCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("vs-code-ext.applyRefactor", applyRefactor),
    vscode.commands.registerCommand("vs-code-ext.showRefactorDiff", showRefactorDiff),
  );
}

async function applyRefactor(
  filePath: string,
  contextKind: string,
  newCode: string,
  startLine?: number | null,
  endLine?: number | null,
): Promise<void> {
  const uri = vscode.Uri.file(filePath);
  const document = await vscode.workspace.openTextDocument(uri);

  const range = resolveRefactorRange(document, uri, contextKind, startLine, endLine);

  const edit = new vscode.WorkspaceEdit();
  edit.replace(uri, range, newCode);

  const ok = await vscode.workspace.applyEdit(edit);
  if (ok) {
    vscode.window.showInformationMessage("✅ Refactoring applied!");
  } else {
    vscode.window.showErrorMessage("❌ Failed to apply changes.");
  }
}

function resolveRefactorRange(
  document: vscode.TextDocument,
  uri: vscode.Uri,
  contextKind: string,
  startLine?: number | null,
  endLine?: number | null,
): vscode.Range {
  if (startLine != null && endLine != null) {
    return new vscode.Range(startLine, 0, endLine + 1, 0);
  }

  const editor = vscode.window.visibleTextEditors.find(
    (e) => e.document.uri.toString() === uri.toString(),
  );

  if (contextKind === "selected" && editor && !editor.selection.isEmpty) {
    return editor.selection;
  }

  return new vscode.Range(0, 0, document.lineCount, 0);
}

async function showRefactorDiff(
  filePath: string,
  _contextKind: string,
  newCode: string,
): Promise<void> {
  const originalUri = vscode.Uri.file(filePath);
  const newDoc = await vscode.workspace.openTextDocument({
    content: newCode,
    language: "typescript",
  });
  await vscode.commands.executeCommand(
    "vscode.diff",
    originalUri,
    newDoc.uri,
    "Original ↔ Refactored",
  );
}