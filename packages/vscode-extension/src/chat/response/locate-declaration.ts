import * as ts from "typescript";
import { matchesName } from "../focus/ast-helpers";

export interface LocationResult {
  matched: boolean;
  name?: string;
  startLine: number | null;
  endLine: number | null;
}

export function locateFunctionInSource(
  sourceCode: string,
  refactoredCode: string,
): LocationResult {
  const name = extractTopLevelName(refactoredCode);
  if (!name) return { matched: false, startLine: null, endLine: null };
  return locateNamedDeclaration(sourceCode, name);
}

export function locateNamedDeclaration(sourceCode: string, name: string): LocationResult {
  const range = findNamedDeclarationRange(sourceCode, name);
  if (!range) return { matched: false, name, startLine: null, endLine: null };
  return { matched: true, name, startLine: range.startLine, endLine: range.endLine };
}

function extractTopLevelName(code: string): string | null {
  const sf = ts.createSourceFile("snippet.tsx", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  for (const stmt of sf.statements) {
    const name = extractNameFromStatement(stmt);
    if (name) return name;
  }
  return null;
}

function extractNameFromStatement(stmt: ts.Statement): string | null {
  if (ts.isFunctionDeclaration(stmt) && stmt.name) return stmt.name.text;
  if (ts.isClassDeclaration(stmt) && stmt.name) return stmt.name.text;

  if (ts.isVariableStatement(stmt)) {
    const decl = stmt.declarationList.declarations[0];
    if (
      decl &&
      ts.isIdentifier(decl.name) &&
      decl.initializer &&
      (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))
    ) {
      return decl.name.text;
    }
  }

  return null;
}

function findNamedDeclarationRange(
  sourceCode: string,
  name: string,
): { startLine: number; endLine: number } | null {
  const sf = ts.createSourceFile("src.tsx", sourceCode, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  for (const stmt of sf.statements) {
    if (matchesName(stmt, name)) {
      const start = sf.getLineAndCharacterOfPosition(stmt.getStart(sf)).line;
      const end = sf.getLineAndCharacterOfPosition(stmt.getEnd()).line;
      return { startLine: start, endLine: end };
    }
  }
  return null;
}