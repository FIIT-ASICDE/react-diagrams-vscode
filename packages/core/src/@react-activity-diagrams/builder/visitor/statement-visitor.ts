import {
	Block,
	ForInStatement,
	ForOfStatement,
	ForStatement,
	IfStatement,
	Node as MorphNode,
	ReturnStatement,
	Statement,
	SwitchStatement,
	SyntaxKind,
	ThrowStatement,
	TryStatement,
	WhileStatement,
} from 'ts-morph';
import { GraphWriter } from '../graph-writer';
import { getExpandableMeta, getHookMeta } from './metadata';
import type { BuildResult } from './types';
import { compactLabel, getFallthroughEdgeLabel } from './utils';
import type { StatementVisitorHost } from './handlers/host-context';
import {
	visitAction,
	visitExpressionStatement,
	visitHook,
	visitReturn,
	visitThrow,
} from './handlers/action-flow';
import {
	visitDoWhile,
	visitFor,
	visitForIn,
	visitForOf,
	visitIf,
	visitTry,
	visitWhile,
} from './handlers/control-flow';
import { visitSwitch } from './handlers/switch-flow';

export class StatementVisitor implements StatementVisitorHost {
	constructor(public writer: GraphWriter) {}

	private createMergeForSources(sources: string[]): string | undefined {
		const uniqueSources = [...new Set(sources)].filter(Boolean);

		if (uniqueSources.length < 2) {
			return undefined;
		}

		const mergeId = this.writer.addFlowNode('merge', '');
		for (const source of uniqueSources) {
			this.writer.addEdge(source, mergeId);
		}
		return mergeId;
	}

	resolveExitSources(sources: string[]): string[] {
		const uniqueSources = [...new Set(sources)].filter(Boolean);
		if (uniqueSources.length <= 1) {
			return uniqueSources;
		}

		const mergeId = this.createMergeForSources(uniqueSources);
		return mergeId ? [mergeId] : uniqueSources;
	}

	visitStatements(statements: Statement[]): BuildResult {
		let entry: string | undefined;
		let pendingExits: string[] = [];
		const endExits: string[] = [];

		for (let index = 0; index < statements.length; index += 1) {
			if (statements[index].getKind() === SyntaxKind.ImportDeclaration) {
				continue;
			}

			const result = this.visitStatement(statements[index]);
			if (!result.entry) {
				continue;
			}

			if (!entry) {
				entry = result.entry;
			}

			for (const exit of pendingExits) {
				this.writer.addEdge(exit, result.entry, getFallthroughEdgeLabel(exit));
			}

			pendingExits = result.exits;
			endExits.push(...result.endExits);
		}

		return {
			entry,
			exits: entry ? [...new Set(pendingExits)] : [],
			endExits: [...new Set(endExits)],
		};
	}

	visitStatement(stmt: Statement): BuildResult {
		const hookMeta = getHookMeta(stmt);
		if (hookMeta) {
			return visitHook(this, hookMeta);
		}

		const expandableMeta = getExpandableMeta(stmt);
		if (expandableMeta) {
			const id = this.writer.addFlowNode('expandable', compactLabel(expandableMeta.label), {
				sourceText: expandableMeta.sourceText ?? stmt.getText(),
				nodeKind: expandableMeta.nodeKind,
			});
			return { entry: id, exits: [id], endExits: [] };
		}

		if (stmt.getKind() === SyntaxKind.ExpressionStatement) {
			return visitExpressionStatement(this, stmt.asKindOrThrow(SyntaxKind.ExpressionStatement));
		}

		if (stmt.getKind() === SyntaxKind.IfStatement) {
			return visitIf(this, stmt as IfStatement);
		}

		if (stmt.getKind() === SyntaxKind.WhileStatement) {
			return visitWhile(this, stmt as WhileStatement);
		}

		if (stmt.getKind() === SyntaxKind.DoStatement) {
			return visitDoWhile(this, stmt.asKindOrThrow(SyntaxKind.DoStatement));
		}

		if (stmt.getKind() === SyntaxKind.ForStatement) {
			return visitFor(this, stmt as ForStatement);
		}

		if (stmt.getKind() === SyntaxKind.ForOfStatement) {
			return visitForOf(this, stmt as ForOfStatement);
		}

		if (stmt.getKind() === SyntaxKind.ForInStatement) {
			return visitForIn(this, stmt as ForInStatement);
		}

		if (stmt.getKind() === SyntaxKind.TryStatement) {
			return visitTry(this, stmt as TryStatement);
		}

		if (stmt.getKind() === SyntaxKind.SwitchStatement) {
			return visitSwitch(this, stmt as SwitchStatement);
		}

		if (stmt.getKind() === SyntaxKind.ReturnStatement) {
			return visitReturn(this, stmt as ReturnStatement);
		}

		if (stmt.getKind() === SyntaxKind.ThrowStatement) {
			return visitThrow(this, stmt as ThrowStatement);
		}

		if (stmt.getKind() === SyntaxKind.Block) {
			return this.visitStatements((stmt as Block).getStatements());
		}

		return visitAction(this, compactLabel(stmt.getText()), stmt.getText());
	}

	visitBranch(node: MorphNode): BuildResult {
		if (MorphNode.isBlock(node)) {
			return this.visitStatements(node.getStatements());
		}

		if (MorphNode.isStatement(node)) {
			return this.visitStatement(node);
		}

		return visitAction(this, node.getText());
	}

	createDecisionNode(label: string, sourceText: string): string {
		return this.writer.addFlowNode('decision', label, {
			sourceText,
			nodeKind: 'decision',
		});
	}

	createLoopNode(label: string, sourceText: string): string {
		return this.writer.addFlowNode('loop', label, {
			sourceText,
			nodeKind: 'loop',
		});
	}

	connectLoopBackEdges(exits: string[], loopId: string, innerDecisionCount: number): void {
		void innerDecisionCount;
		const uniqueExits = [...new Set(exits)].filter((exit) => exit && exit !== loopId);

		for (const exit of uniqueExits) {
			this.writer.addEdge(exit, loopId, '', true);
		}
	}

	analyzeStatementsSemantics(statements: Statement[]): BuildResult {
		const scratchNodes: import('@xyflow/react').Node[] = [];
		const scratchEdges: import('@xyflow/react').Edge[] = [];
		const scratchVisitor = new StatementVisitor(new GraphWriter(scratchNodes, scratchEdges));
		return scratchVisitor.visitStatements(statements);
	}
}
