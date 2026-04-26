import { Node as MorphNode, Statement } from 'ts-morph';
import { GraphWriter } from '../../graph-writer';
import type { BuildResult } from '../types';

export interface StatementVisitorHost {
  writer: GraphWriter;
  resolveExitSources(sources: string[]): string[];
  createDecisionNode(label: string, sourceText: string): string;
  createLoopNode(label: string, sourceText: string): string;
  connectLoopBackEdges(exits: string[], loopId: string, innerDecisionCount: number): void;
  visitBranch(node: MorphNode): BuildResult;
  analyzeStatementsSemantics(statements: Statement[]): BuildResult;
  visitStatementsInline(statements: Statement[]): BuildResult
}