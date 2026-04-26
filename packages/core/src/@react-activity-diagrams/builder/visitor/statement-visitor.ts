import {
	Block,
	BreakStatement,
	ContinueStatement,
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
		if (uniqueSources.length < 2) return undefined;

		const mergeId = this.writer.addFlowNode('merge', '');
		for (const source of uniqueSources) {
			this.writer.addEdge(source, mergeId);
		}
		return mergeId;
	}

	resolveExitSources(sources: string[]): string[] {
		const uniqueSources = [...new Set(sources)].filter(Boolean);
		if (uniqueSources.length <= 1) return uniqueSources;

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
			if (!result.entry) continue;

			if (!entry) entry = result.entry;

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

	visitStatementsInline(statements: Statement[]): BuildResult {
		return this.visitStatements(statements);
	}

	visitStatement(stmt: Statement): BuildResult {
		const hookMeta = getHookMeta(stmt);
		if (hookMeta) {
			return visitHook(this, hookMeta);
		}

		const expandableMeta = getExpandableMeta(stmt);
		if (expandableMeta) {
			let sourceText = expandableMeta.sourceText ?? stmt.getText();

			if (expandableMeta.label === 'return' && !sourceText.trim().startsWith('return')) {
				sourceText = `return ${sourceText};`;
			}

			// Expandables produced by getExpandableMeta are ALL function-shaped
			// (function decl / variable holding an arrow / return-arrow). Hooks
			// go through getHookMeta above. So construct is always 'function' here.
			const id = this.writer.addFlowNode('expandable', compactLabel(expandableMeta.label), {
				sourceText,
				construct: 'function',
			});
			return { entry: id, exits: [id], endExits: [] };
		}

		switch (stmt.getKind()) {
			case SyntaxKind.ExpressionStatement:
				return visitExpressionStatement(this, stmt.asKindOrThrow(SyntaxKind.ExpressionStatement));

			case SyntaxKind.IfStatement:
				return visitIf(this, stmt as IfStatement);

			case SyntaxKind.WhileStatement:
				return visitWhile(this, stmt as WhileStatement);

			case SyntaxKind.DoStatement:
				return visitDoWhile(this, stmt.asKindOrThrow(SyntaxKind.DoStatement));

			case SyntaxKind.ForStatement:
				return visitFor(this, stmt as ForStatement);

			case SyntaxKind.ForOfStatement:
				return visitForOf(this, stmt as ForOfStatement);

			case SyntaxKind.ForInStatement:
				return visitForIn(this, stmt as ForInStatement);

			case SyntaxKind.TryStatement:
				return visitTry(this, stmt as TryStatement);

			case SyntaxKind.SwitchStatement:
				return visitSwitch(this, stmt as SwitchStatement);

			case SyntaxKind.ReturnStatement:
				return visitReturn(this, stmt as ReturnStatement);

			case SyntaxKind.ThrowStatement:
				return visitThrow(this, stmt as ThrowStatement);

			case SyntaxKind.BreakStatement:
				return this.visitTerminating(stmt as BreakStatement, 'break');

			case SyntaxKind.ContinueStatement:
				return this.visitTerminating(stmt as ContinueStatement, 'continue');

			case SyntaxKind.Block:
				return this.visitStatements((stmt as Block).getStatements());

			default:
				return visitAction(this, compactLabel(stmt.getText()), stmt.getText());
		}
	}

	/**
	 * Render `break` / `continue` as a regular action node tagged with the
	 * matching construct. CodeGen reads the construct, emits the keyword,
	 * and stops traversal — no text-sniffing required.
	 */
	private visitTerminating(stmt: BreakStatement | ContinueStatement, construct: 'break' | 'continue'): BuildResult {
		const id = this.writer.addFlowNode('action', compactLabel(stmt.getText()), {
			sourceText: stmt.getText(),
			construct,
		});
		return { entry: id, exits: [], endExits: [id] };
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
		// `construct` is set by callers (visitIf / visitSwitch / visitTry).
		return this.writer.addFlowNode('decision', label, { sourceText });
	}

	createLoopNode(label: string, sourceText: string): string {
		// `construct` is set by callers (visitWhile / visitFor / visitForEachLike / etc.).
		return this.writer.addFlowNode('loop', label, { sourceText });
	}

	connectLoopBackEdges(exits: string[], loopId: string, _innerDecisionCount: number): void {
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