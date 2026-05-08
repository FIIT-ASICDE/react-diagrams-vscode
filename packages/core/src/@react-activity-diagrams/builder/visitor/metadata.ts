import {
  ArrowFunction,
  CallExpression,
  ExpressionStatement,
  Node as MorphNode,
  ReturnStatement,
  Statement,
  SyntaxKind,
  VariableDeclaration,
  VariableStatement,
} from 'ts-morph';
import type { ExpandableMeta, HookMeta } from './types';

const effectHooks = new Set(['useEffect', 'useLayoutEffect', 'useInsertionEffect']);
const callbackHooks = new Set(['useCallback', 'useMemo']);
const lazyInitHooks = new Set(['useState']);


// Checks whether a call expression is forEach-like.
export function isForEachLikeCall(callExpression: CallExpression): boolean {
  const callee = callExpression.getExpression();

  if (MorphNode.isIdentifier(callee)) {
    const name = callee.getText();
    return name === 'forEach' || name === 'forEachChild';
  }

  if (MorphNode.isPropertyAccessExpression(callee)) {
    const name = callee.getName();
    return name === 'forEach' || name === 'forEachChild';
  }

  return false;
}

// Returns the callback body node for a call expression.
export function getCallbackBranch(callExpression: CallExpression): MorphNode | undefined {
  const callbackArgument = callExpression.getArguments()[0];

  if (!callbackArgument) {
    return undefined;
  }

  if (MorphNode.isArrowFunction(callbackArgument) || MorphNode.isFunctionExpression(callbackArgument)) {
    return callbackArgument.getBody();
  }

  return undefined;
}

// Resolves the hook name from a call expression.
function getHookName(callExpression: CallExpression): string | undefined {
  const callee = callExpression.getExpression();

  if (MorphNode.isIdentifier(callee)) {
    return callee.getText();
  }

  if (MorphNode.isPropertyAccessExpression(callee)) {
    return callee.getName();
  }

  return undefined;
}

// Converts an arrow function to a block-body form.
function normalizeArrowToBlockBody(arrow: ArrowFunction): string {
  const body = arrow.getBody();
  if (MorphNode.isBlock(body)) {
    return arrow.getText();
  }

  const params = arrow.getParameters().map((p) => p.getText()).join(', ');
  const asyncKw = arrow.isAsync() ? 'async ' : '';
  const typeParams = arrow.getTypeParameters().map((tp) => tp.getText()).join(', ');
  const typeParamsText = typeParams ? `<${typeParams}>` : '';
  const returnTypeNode = arrow.getReturnTypeNode();
  const returnTypeText = returnTypeNode ? `: ${returnTypeNode.getText()}` : '';

  return `${asyncKw}${typeParamsText}(${params})${returnTypeText} => { return ${body.getText()}; }`;
}

// Builds a variable declaration wrapper string.
function buildVariableWrapper(
  variableStmt: VariableStatement,
  declaration: VariableDeclaration,
  initializerSource: string,
): string {
  const keyword = variableStmt.getDeclarationKindKeywords()[0].getText();
  const name = declaration.getName();
  const typeNode = declaration.getTypeNode();
  const typeAnnotation = typeNode ? `: ${typeNode.getText()}` : '';

  return `${keyword} ${name}${typeAnnotation} = ${initializerSource};`;
}

// Rebuilds a hook call text with a normalized callback argument.
function rebuildHookCall(callExpression: CallExpression): string {
  const callee = callExpression.getExpression().getText();
  const args = callExpression.getArguments();

  const renderedArgs = args.map((arg, index) => {
    if (index === 0) {
      let candidate = arg;
      while (MorphNode.isParenthesizedExpression(candidate)) {
        candidate = candidate.getExpression();
      }
      if (MorphNode.isArrowFunction(candidate)) {
        return normalizeArrowToBlockBody(candidate);
      }
    }
    return arg.getText();
  });

  return `${callee}(${renderedArgs.join(', ')})`;
}

// Returns normalized callback source text for a hook call.
function getHookCallbackSourceText(callExpression: CallExpression): string | undefined {
  const callbackArgument = callExpression.getArguments()[0];

  if (!callbackArgument) {
    return undefined;
  }

  let candidate = callbackArgument;
  while (MorphNode.isParenthesizedExpression(candidate)) {
    candidate = candidate.getExpression();
  }

  if (MorphNode.isArrowFunction(candidate)) {
    return normalizeArrowToBlockBody(candidate);
  }

  if (MorphNode.isFunctionExpression(candidate)) {
    return candidate.getText();
  }

  return undefined;
}

// Builds source text for a hook statement or declaration.
function buildHookSourceText(
  callExpression: CallExpression,
  variableStmt: VariableStatement | undefined,
  declaration: VariableDeclaration | undefined,
): string {
  const rebuiltCall = rebuildHookCall(callExpression);

  if (variableStmt && declaration) {
    const declText = declaration.getText();
    const eqIndex = declText.indexOf('=');
    if (eqIndex >= 0) {
      const lhs = declText.slice(0, eqIndex).trimEnd();
      const keyword = variableStmt.getDeclarationKindKeywords()[0].getText();
      return `${keyword} ${lhs} = ${rebuiltCall};`;
    }
    return buildVariableWrapper(variableStmt, declaration, rebuiltCall);
  }

  return `${rebuiltCall};`;
}

// Extracts hook metadata from a call expression.
function getHookMetaFromCall(
  callExpression: CallExpression,
  variableName?: string,
  variableStmt?: VariableStatement,
  declaration?: VariableDeclaration,
): HookMeta | undefined {
  const hookName = getHookName(callExpression);
  if (!hookName) {
    return undefined;
  }

  const isEffectHook = effectHooks.has(hookName);
  const isCallbackHook = callbackHooks.has(hookName);
  const isLazyInitHook = lazyInitHooks.has(hookName);
  if (!isEffectHook && !isCallbackHook && !isLazyInitHook) {
    return undefined;
  }

  const callbackSourceText = getHookCallbackSourceText(callExpression);
  if (!callbackSourceText) {
    return undefined;
  }

  const dependencyArgument = callExpression.getArguments()[1];
  const dependencyText = dependencyArgument?.getText() ?? '[]';

  const label = isCallbackHook
    ? `function ${variableName ?? 'anonymous'}()`
    : isLazyInitHook
      ? `${hookName} initializer`
      : `${hookName} callback`;

  const sourceText = buildHookSourceText(callExpression, variableStmt, declaration);

  return {
    label,
    sourceText,
    dependencyText,
  };
}

// Extracts hook metadata from a statement.
export function getHookMeta(stmt: Statement): HookMeta | undefined {
  if (stmt.getKind() === SyntaxKind.VariableStatement) {
    const variableStmt = stmt as VariableStatement;
    for (const declaration of variableStmt.getDeclarations()) {
      const initializer = declaration.getInitializer();
      if (!initializer || !MorphNode.isCallExpression(initializer)) {
        continue;
      }

      const variableName = declaration.getName() ?? 'anonymous';
      const hookMeta = getHookMetaFromCall(initializer, variableName, variableStmt, declaration);
      if (hookMeta) {
        return hookMeta;
      }
    }
  }

  if (stmt.getKind() === SyntaxKind.ExpressionStatement) {
    const expression = stmt.asKind(SyntaxKind.ExpressionStatement)?.getExpression();
    if (expression && MorphNode.isCallExpression(expression)) {
      return getHookMetaFromCall(expression);
    }
  }

  return undefined;
}




// Returns expandable expression meta.
function getExpandableExpressionMeta(node: MorphNode): { nodeKind: 'function' | 'class'; sourceText: string } | undefined {
  let candidate = node;
  while (MorphNode.isParenthesizedExpression(candidate)) {
    candidate = candidate.getExpression();
  }

  const directKind = candidate.getKind();

  if (directKind === SyntaxKind.ArrowFunction) {
    return {
      nodeKind: 'function',
      sourceText: normalizeArrowToBlockBody(candidate as ArrowFunction),
    };
  }

  if (directKind === SyntaxKind.FunctionExpression) {
    return { nodeKind: 'function', sourceText: candidate.getText() };
  }

  if (directKind === SyntaxKind.ClassExpression) {
    return { nodeKind: 'class', sourceText: candidate.getText() };
  }

  return undefined;
}




// Returns expandable meta.
export function getExpandableMeta(stmt: Statement): ExpandableMeta | undefined {
  if (stmt.getKind() === SyntaxKind.FunctionDeclaration) {
    const name = stmt.asKind(SyntaxKind.FunctionDeclaration)?.getName() ?? 'anonymous';
    return { label: `function ${name}()`, nodeKind: 'function' };
  }

  if (stmt.getKind() === SyntaxKind.ClassDeclaration) {
    const decl = stmt.asKind(SyntaxKind.ClassDeclaration);
    const name = decl?.getName() ?? 'anonymous';
    const sourceText = decl?.getText();
    return { label: `class ${name}`, nodeKind: 'class', sourceText };
  }

  if (stmt.getKind() === SyntaxKind.VariableStatement) {
    const variableStmt = stmt as VariableStatement;
    for (const declaration of variableStmt.getDeclarations()) {
      const initializer = declaration.getInitializer();
      if (!initializer) {
        continue;
      }

      const initializerKind = initializer.getKind();

      if (initializerKind === SyntaxKind.ArrowFunction) {
        const name = declaration.getName() ?? 'anonymous';
        const innerSource = normalizeArrowToBlockBody(initializer as ArrowFunction);
        return {
          label: `function ${name}()`,
          nodeKind: 'function',
          sourceText: buildVariableWrapper(variableStmt, declaration, innerSource),
        };
      }

      if (initializerKind === SyntaxKind.FunctionExpression) {
        const name = declaration.getName() ?? 'anonymous';
        return {
          label: `function ${name}()`,
          nodeKind: 'function',
          sourceText: buildVariableWrapper(variableStmt, declaration, initializer.getText()),
        };
      }

      if (initializerKind === SyntaxKind.ClassExpression) {
        const name = declaration.getName() ?? 'anonymous';
        return {
          label: `class ${name}`,
          nodeKind: 'class',
          sourceText: buildVariableWrapper(variableStmt, declaration, initializer.getText()),
        };
      }
    }
  }

  if (stmt.getKind() === SyntaxKind.ReturnStatement) {
    const returnStmt = stmt as ReturnStatement;
    const returnExpression = returnStmt.getExpression();

    if (returnExpression) {
      const expandableExpression = getExpandableExpressionMeta(returnExpression);
      if (expandableExpression) {
        return {
          label: 'return',
          nodeKind: expandableExpression.nodeKind,
          sourceText: expandableExpression.sourceText,
        };
      }
    }
  }

  return undefined;
}