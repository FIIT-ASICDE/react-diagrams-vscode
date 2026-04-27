/**
 * Result of visiting a statement (or sequence of statements).
 *
 * Three kinds of out-edges, corresponding to the three kinds of control
 * leaving a JS construct:
 *
 *   exits        — NORMAL fall-through. The next statement after this
 *                  one in source order receives these as its incoming
 *                  edges. Continuation of normal flow.
 *
 *   returnExits  — `return` paths. Eventually wired to the function's
 *                  End node. They MUST NOT be merged with throwExits —
 *                  semantically these are the function's success-style
 *                  exits.
 *
 *   throwExits   — UNHANDLED `throw` paths (i.e. throws that escape this
 *                  scope without being caught). Eventually wired to the
 *                  function's ErrorEnd node. They MUST NOT be merged
 *                  with exits or returnExits — exception flow has
 *                  distinct downstream semantics (different runtime
 *                  behaviour, different post-conditions, different
 *                  end node).
 *
 * Earlier versions of this code used a single `endExits` field that
 * collapsed return and throw together; that was wrong for try/finally
 * routing and for unhandled-throw propagation. The split is necessary
 * for the strict semantics: throw goes to ErrorEnd, return goes to End,
 * never the same merge.
 */
export type BuildResult = {
  entry?: string;
  exits: string[];
  returnExits: string[];
  throwExits: string[];
};

export type HookMeta = {
  label: string;
  sourceText: string;
  dependencyText: string;
};

export type ExpandableMeta = {
  label: string;
  nodeKind: 'function' | 'class' | 'interface' | 'type';
  sourceText?: string;
};