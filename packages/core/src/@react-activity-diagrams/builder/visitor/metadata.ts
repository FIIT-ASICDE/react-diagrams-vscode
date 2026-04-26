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

/**
 * Convert an arrow function to canonical block-bodied form:
 *   `() => expr`              -> `() => { return expr; }`
 *   `() => { ... }`           -> unchanged
 *
 * Block-bodied form is required so that the diagram round-trip pipeline
 * can reliably find the OUTERMOST `{ ... }` to act as wrapper boundaries
 * when syncing a child diagram back into its parent expandable. A concise
 * arrow body has no braces, so wrapper extraction would fall through and
 * corrupt the parent's sourceText.
 */
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

/**
 * Build a self-contained variable declaration from its parts.
 * Preserves the original keyword (const/let/var), variable name, and
 * type annotation if present.
 *
 *   `const x = (a) => a + 1;`        -> `const x = (a) => { return a + 1; };`
 *   `let foo = function () {...};`   -> `let foo = function () {...};`
 *   `const C = class { ... };`       -> `const C = class { ... };`
 *
 * Used in two places: (1) regular function-like initializers via
 * getExpandableMeta, and (2) hook calls that are stored in a variable via
 * getHookMeta (useCallback/useMemo/useState).
 */
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

/**
 * Re-stringify a hook call expression with its callback normalized to
 * block-bodied form. Other arguments (deps array, etc.) are kept verbatim
 * so e.g. `[value, delayMs]` round-trips exactly.
 *
 *   useEffect(() => doStuff(), [a])
 *     -> useEffect(() => { return doStuff(); }, [a])
 *
 *   useEffect(() => { doStuff(); }, [a])
 *     -> useEffect(() => { doStuff(); }, [a])  (already block-bodied)
 */
function rebuildHookCall(callExpression: CallExpression): string {
  const callee = callExpression.getExpression().getText();
  const args = callExpression.getArguments();

  const renderedArgs = args.map((arg, index) => {
    if (index === 0) {
      // Callback (or initial value, in case of useState).
      let candidate = arg;
      while (MorphNode.isParenthesizedExpression(candidate)) {
        candidate = candidate.getExpression();
      }
      if (MorphNode.isArrowFunction(candidate)) {
        return normalizeArrowToBlockBody(candidate);
      }
      // FunctionExpression and any other arg type: keep verbatim.
    }
    return arg.getText();
  });

  return `${callee}(${renderedArgs.join(', ')})`;
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

  if (MorphNode.isArrowFunction(candidate)) {
    return normalizeArrowToBlockBody(candidate);
  }

  if (MorphNode.isFunctionExpression(candidate)) {
    return candidate.getText();
  }

  return undefined;
}

/**
 * Build a hook expandable's sourceText that is a complete, self-contained
 * statement including the hook wrapper.
 *
 * Three shapes:
 *
 *   1. Bare expression statement (effect hooks):
 *        `useEffect(() => { ... }, [deps]);`
 *
 *   2. Variable destructuring (useState):
 *        `const [s, setS] = useState(() => { ... });`
 *
 *   3. Single variable (useCallback / useMemo):
 *        `const handler = useCallback(() => { ... }, [deps]);`
 *
 * In all cases the inner arrow function is normalized to block body so the
 * diagram round-trip pipeline can find the matching braces during sync.
 *
 * If the hook call is an ExpressionStatement (case 1), `variableStmt` is
 * undefined; we just suffix the call with `;`. For variable forms we go
 * through buildVariableWrapper.
 */
function buildHookSourceText(
  callExpression: CallExpression,
  variableStmt: VariableStatement | undefined,
  declaration: VariableDeclaration | undefined,
): string {
  const rebuiltCall = rebuildHookCall(callExpression);

  if (variableStmt && declaration) {
    // Use the original variable declaration's text up to the `=`, then
    // splice in the rebuilt call. This preserves destructuring patterns
    // (`const [s, setS] = ...`) which buildVariableWrapper can't render
    // because it only knows how to write a plain `name`.
    const declText = declaration.getText();
    const eqIndex = declText.indexOf('=');
    if (eqIndex >= 0) {
      const lhs = declText.slice(0, eqIndex).trimEnd();
      const keyword = variableStmt.getDeclarationKindKeywords()[0].getText();
      return `${keyword} ${lhs} = ${rebuiltCall};`;
    }
    // Fallback: simple name
    return buildVariableWrapper(variableStmt, declaration, rebuiltCall);
  }

  return `${rebuiltCall};`;
}

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

  // Verify the callback (first arg) is a function we can drill into. If
  // it's not (e.g. `useState(0)` or `useEffect(someExternalFn)`), we don't
  // create an expandable — the call falls through to a regular action.
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

  // sourceText is the FULL statement including the hook wrapper — not
  // just the callback. CodeGen pastes it verbatim; drilldown extracts the
  // callback body via extractFunctionBodyIfWrapped.
  const sourceText = buildHookSourceText(callExpression, variableStmt, declaration);

  return {
    label,
    sourceText,
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