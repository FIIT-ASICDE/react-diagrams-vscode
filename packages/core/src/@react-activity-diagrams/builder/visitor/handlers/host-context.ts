import { Node as MorphNode, Statement } from 'ts-morph';
import { GraphWriter } from '../../graph-writer';
import type { BuildResult } from '../types';


export type LoopContext = {
  kind: 'loop';
  continueTarget: string;
  breakTarget: string;
  label?: string;
  pendingBreaks: string[];
  pendingContinues: string[];
};

export type SwitchContext = {
  kind: 'switch';
  breakTarget: string;
  label?: string;
  pendingBreaks: string[];
};

export type ControlContext = LoopContext | SwitchContext;



export interface StatementVisitorHost {
  writer: GraphWriter;
  resolveExitSources(sources: string[], sourceLabels?: Record<string, string>): string[];
  createDecisionNode(label: string, sourceText: string): string;
  createLoopNode(label: string, sourceText: string): string;
  connectLoopBackEdges(exits: string[], loopId: string): void;
  visitBranch(node: MorphNode): BuildResult;
  visitStatementsInline(statements: Statement[]): BuildResult;

  

  pushLoopContext(loopId: string): LoopContext;
  pushSwitchContext(breakTarget: string): SwitchContext;
  popContext(): void;
  findNearestContext(kinds: Array<'loop' | 'switch'>, label?: string): ControlContext | undefined;
  setPendingLabel(label: string): void;

  
  getContextStack(): readonly ControlContext[];
}