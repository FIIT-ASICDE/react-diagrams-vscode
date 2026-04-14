import {
  CallExpression,
  Node as MorphNode,
  ReturnStatement,
  Statement,
  SyntaxKind,
  VariableStatement,
} from 'ts-morph';
import type { ExpandableMeta, HookMeta } from './types';

const effectHooks = new Set(['useEffect', 'useLayoutEffect', 'useInsertionEffect']);
const callbackHooks = new Set(['useCallback', 'useMemo']);
const lazyInitHooks = new Set(['useState']);

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

function getHookCallbackSourceText(callExpression: CallExpression): string | undefined {
  const callbackArgument = callExpression.getArguments()[0];

  if (!callbackArgument) {
    return undefined;
  }

  let candidate = callbackArgument;
  while (MorphNode.isParenthesizedExpression(candidate)) {
    candidate = candidate.getExpression();
  }

  if (MorphNode.isArrowFunction(candidate) || MorphNode.isFunctionExpression(candidate)) {
    return candidate.getText();
  }

  return undefined;
}

function getHookMetaFromCall(callExpression: CallExpression, variableName?: string): HookMeta | undefined {
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

  return {
    label,
    sourceText: callbackSourceText,
    dependencyText,
  };
}

export function getHookMeta(stmt: Statement): HookMeta | undefined {
  if (stmt.getKind() === SyntaxKind.VariableStatement) {
    const variableStmt = stmt as VariableStatement;
    for (const declaration of variableStmt.getDeclarations()) {
      const initializer = declaration.getInitializer();
      if (!initializer || !MorphNode.isCallExpression(initializer)) {
        continue;
      }

      const hookMeta = getHookMetaFromCall(initializer, declaration.getName() ?? 'anonymous');
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

function getExpandableExpressionMeta(node: MorphNode): { nodeKind: 'function' | 'class'; sourceText: string } | undefined {
  const directKind = node.getKind();

  if (directKind === SyntaxKind.ArrowFunction || directKind === SyntaxKind.FunctionExpression) {
    return { nodeKind: 'function', sourceText: node.getText() };
  }

  if (directKind === SyntaxKind.ClassExpression) {
    return { nodeKind: 'class', sourceText: node.getText() };
  }

  const arrowFunction = node.getDescendantsOfKind(SyntaxKind.ArrowFunction)[0];
  if (arrowFunction) {
    return { nodeKind: 'function', sourceText: arrowFunction.getText() };
  }

  const functionExpression = node.getDescendantsOfKind(SyntaxKind.FunctionExpression)[0];
  if (functionExpression) {
    return { nodeKind: 'function', sourceText: functionExpression.getText() };
  }

  const classExpression = node.getDescendantsOfKind(SyntaxKind.ClassExpression)[0];
  if (classExpression) {
    return { nodeKind: 'class', sourceText: classExpression.getText() };
  }

  return undefined;
}

export function getExpandableMeta(stmt: Statement): ExpandableMeta | undefined {
  if (stmt.getKind() === SyntaxKind.FunctionDeclaration) {
    const name = stmt.asKind(SyntaxKind.FunctionDeclaration)?.getName() ?? 'anonymous';
    return { label: `function ${name}()`, nodeKind: 'function' };
  }

  if (stmt.getKind() === SyntaxKind.ClassDeclaration) {
    const name = stmt.asKind(SyntaxKind.ClassDeclaration)?.getName() ?? 'anonymous';
    return { label: `class ${name}`, nodeKind: 'class' };
  }

  if (stmt.getKind() === SyntaxKind.VariableStatement) {
    const variableStmt = stmt as VariableStatement;
    for (const declaration of variableStmt.getDeclarations()) {
      const initializer = declaration.getInitializer();
      if (!initializer) {
        continue;
      }

      const hasFunctionInitializer =
        initializer.getKind() === SyntaxKind.ArrowFunction ||
        initializer.getKind() === SyntaxKind.FunctionExpression;
      const hasClassInitializer = initializer.getKind() === SyntaxKind.ClassExpression;

      if (hasFunctionInitializer) {
        const name = declaration.getName() ?? 'anonymous';
        return {
          label: `function ${name}()`,
          nodeKind: 'function',
          sourceText: initializer.getText(),
        };
      }

      if (hasClassInitializer) {
        const name = declaration.getName() ?? 'anonymous';
        return {
          label: `class ${name}`,
          nodeKind: 'class',
          sourceText: initializer.getText(),
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
