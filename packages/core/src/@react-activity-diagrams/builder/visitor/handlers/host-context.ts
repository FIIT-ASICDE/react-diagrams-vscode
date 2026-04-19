import { Node as MorphNode, Statement } from 'ts-morph';
import { EdgeBranchData, GraphWriter } from '../../graph-writer';
import type { BuildResult } from '../types';

export type BranchSide = 'left' | 'right' | 'bottom';
export type SemanticKind = 'positive' | 'negative' | 'case' | 'default' | 'loop-back' | 'normal';

export interface StatementVisitorHost {
  writer: GraphWriter;
  edgeMeta(
    branchSide: BranchSide,
    semanticKind: SemanticKind,
    extra?: Record<string, unknown>,
  ): EdgeBranchData;
  createContinuationFrom(sourceId: string, edgeLabel?: string, edgeData?: EdgeBranchData): string;
  resolveExitSources(sources: string[]): string[];
  createDecisionNode(label: string, sourceText: string): string;
  createLoopNode(label: string, sourceText: string): string;
  connectLoopBackEdges(exits: string[], loopId: string, innerDecisionCount: number): void;
  visitBranch(node: MorphNode): BuildResult;
  analyzeStatementsSemantics(statements: Statement[]): BuildResult;
}