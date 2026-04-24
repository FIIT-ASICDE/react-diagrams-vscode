import * as ts from "typescript";

export interface RefactorBlock {
  code: string;
  before: string;
  after: string;
}

export function extractRefactorBlock(text: string): RefactorBlock | null {
  const pattern = /```(?:tsx?|jsx?|javascript|typescript)?\s*\n([\s\S]*?)```/gi;
  const matches = [...text.matchAll(pattern)];
  if (matches.length !== 1) return null;

  const match = matches[0];
  const code = match[1].trim();
  if (!looksLikeRealCode(code)) return null;

  const blockStart = match.index ?? 0;
  const blockEnd = blockStart + match[0].length;

  return {
    code,
    before: text.slice(0, blockStart).trim(),
    after: text.slice(blockEnd).trim(),
  };
}

function looksLikeRealCode(code: string): boolean {
  try {
    const sf = ts.createSourceFile("snippet.tsx", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    return sf.statements.some(isMeaningfulStatement);
  } catch {
    return false;
  }
}

function isMeaningfulStatement(s: ts.Statement): boolean {
  return (
    ts.isFunctionDeclaration(s) ||
    ts.isClassDeclaration(s) ||
    ts.isInterfaceDeclaration(s) ||
    ts.isTypeAliasDeclaration(s) ||
    ts.isVariableStatement(s) ||
    ts.isImportDeclaration(s) ||
    ts.isExportDeclaration(s)
  );
}