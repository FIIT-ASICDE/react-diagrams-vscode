import * as ts from "typescript";

function parseSource(sourceCode: string): ts.SourceFile {
  return ts.createSourceFile("src.tsx", sourceCode, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

export function collectTopLevelNames(sourceCode: string): Set<string> {
  const sf = parseSource(sourceCode);
  const names = new Set<string>();

  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      names.add(stmt.name.text);
    } else if (ts.isClassDeclaration(stmt) && stmt.name) {
      names.add(stmt.name.text);
    } else if (ts.isVariableStatement(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) names.add(d.name.text);
      }
    }
  }
  return names;
}

export function sliceNamedDeclaration(sourceCode: string, name: string): string | null {
  const sf = parseSource(sourceCode);
  for (const stmt of sf.statements) {
    if (matchesName(stmt, name)) {
      return sourceCode.slice(stmt.getStart(sf), stmt.getEnd());
    }
  }
  return null;
}

export function matchesName(stmt: ts.Statement, name: string): boolean {
  if (ts.isFunctionDeclaration(stmt) && stmt.name?.text === name) return true;
  if (ts.isClassDeclaration(stmt) && stmt.name?.text === name) return true;
  if (ts.isVariableStatement(stmt)) {
    return stmt.declarationList.declarations.some(
      (d) => ts.isIdentifier(d.name) && d.name.text === name,
    );
  }
  return false;
}