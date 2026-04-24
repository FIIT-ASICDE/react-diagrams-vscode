import * as vscode from "vscode";
import { ChatContextSnapshot } from "../types";
import { UserFocus } from "../focus/user-focus";
import { extractRefactorBlock, RefactorBlock } from "./refactor-block";
import {
  locateFunctionInSource,
  locateNamedDeclaration,
  LocationResult,
} from "./locate-declaration";

export async function renderAgentResponse(
  text: string,
  snapshot: ChatContextSnapshot,
  focus: UserFocus,
  stream: vscode.ChatResponseStream,
): Promise<void> {
  if (!text.trim()) {
    stream.markdown(buildEmptyResponseHint());
    return;
  }

  const refactor = extractRefactorBlock(text);
  if (!refactor) {
    stream.markdown(text);
    return;
  }

  await renderRefactorResponse(refactor, snapshot, focus, stream);
}

function buildEmptyResponseHint(): string {
  return (
    "The model didn't return any text. This usually means the combined context " +
    "(code + diagram JSON + images) is too large. Try selecting a smaller portion of code, " +
    "or disable `diagramImage` in CONFIG."
  );
}

async function renderRefactorResponse(
  refactor: RefactorBlock,
  snapshot: ChatContextSnapshot,
  focus: UserFocus,
  stream: vscode.ChatResponseStream,
): Promise<void> {
  const location = resolveRefactorLocation(refactor, snapshot, focus);

  if (refactor.before) stream.markdown(refactor.before + "\n\n");

  stream.markdown(
    location.matched ? `### Refactored \`${location.name}\`:\n` : "### Refactored code:\n",
  );
  stream.markdown("```typescript\n" + refactor.code + "\n```\n\n");

  if (refactor.after) stream.markdown(refactor.after + "\n\n");

  renderActionButtons(refactor, snapshot, location, stream);
}

function resolveRefactorLocation(
  refactor: RefactorBlock,
  snapshot: ChatContextSnapshot,
  focus: UserFocus,
): LocationResult {
  return focus.name
    ? locateNamedDeclaration(snapshot.selectedOrFullCode, focus.name)
    : locateFunctionInSource(snapshot.selectedOrFullCode, refactor.code);
}

function renderActionButtons(
  refactor: RefactorBlock,
  snapshot: ChatContextSnapshot,
  location: LocationResult,
  stream: vscode.ChatResponseStream,
): void {
  stream.button({
    command: "vs-code-ext.applyRefactor",
    title: "$(check) Apply changes",
    arguments: [
      snapshot.activeFilePath,
      snapshot.codeContextKind,
      refactor.code,
      location.startLine,
      location.endLine,
    ],
  });

  stream.button({
    command: "vs-code-ext.showRefactorDiff",
    title: "$(diff) Show diff",
    arguments: [snapshot.activeFilePath, snapshot.codeContextKind, refactor.code],
  });
}