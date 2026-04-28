import { Node as MorphNode, Statement } from 'ts-morph';
import { GraphWriter } from '../../graph-writer';
import type { BuildResult } from '../types';

/**
 * Context for a `break` / `continue` statement to look up its target.
 *
 * `break` may exit either a loop or a switch — both push contexts.
 * `continue` only applies to loops, so it walks the stack until it finds
 * one. Labeled statements (`outer: while (...) { ... }`) record the label
 * on the context they create, so `break outer;` can target a specific
 * outer loop.
 *
 * Contexts collect node IDs of break / continue actions as they're
 * created. The wiring happens at popContext time, when we finally know
 * what the post-loop / post-switch target is.
 */
export type LoopContext = {
  kind: 'loop';
  continueTarget: string;
  breakTarget: string;
  label?: string;
  pendingBreaks: string[];
};

export type SwitchContext = {
  kind: 'switch';
  breakTarget: string;
  label?: string;
  pendingBreaks: string[];
};

export type ControlContext = LoopContext | SwitchContext;

// ──────────────────────────────────────────────────────────────────────────

export interface StatementVisitorHost {
  writer: GraphWriter;
  resolveExitSources(sources: string[]): string[];
  createDecisionNode(label: string, sourceText: string): string;
  createLoopNode(label: string, sourceText: string): string;
  connectLoopBackEdges(exits: string[], loopId: string): void;
  visitBranch(node: MorphNode): BuildResult;
  visitStatementsInline(statements: Statement[]): BuildResult;

  // ── Break / continue context API ────────────────────────────────────

  pushLoopContext(loopId: string): LoopContext;
  pushSwitchContext(breakTarget: string): SwitchContext;
  popContext(): void;
  findNearestContext(kinds: Array<'loop' | 'switch'>, label?: string): ControlContext | undefined;
  setPendingLabel(label: string): void;

  /**
   * Read-only access to the current context stack. Used by `visitTry`
   * to detect which break/continue actions were registered DURING the
   * visit of try-body, so they can be funnelled through finally before
   * reaching their original target.
   */
  getContextStack(): readonly ControlContext[];
}