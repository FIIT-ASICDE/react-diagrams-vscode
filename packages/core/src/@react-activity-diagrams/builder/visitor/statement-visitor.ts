import {
	Block,
	BreakStatement,
	ContinueStatement,
	ForInStatement,
	ForOfStatement,
	ForStatement,
	IfStatement,
	LabeledStatement,
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
import type {
	ControlContext,
	LoopContext,
	StatementVisitorHost,
	SwitchContext,
} from './handlers/host-context';
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
	private readonly contextStack: ControlContext[] = [];
	private pendingLabel: string | undefined;

	constructor(public writer: GraphWriter) {}

	// ── Merge / exit helpers ───────────────────────────────────────────

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

	// ── Context stack API ──────────────────────────────────────────────

	pushLoopContext(loopId: string): LoopContext {
		const label = this.pendingLabel;
		this.pendingLabel = undefined;

		const ctx: LoopContext = {
			kind: 'loop',
			loopId,
			label,
			pendingBreaks: [],
			pendingContinues: [],
		};
		this.contextStack.push(ctx);
		return ctx;
	}

	pushSwitchContext(): SwitchContext {
		const label = this.pendingLabel;
		this.pendingLabel = undefined;

		const ctx: SwitchContext = {
			kind: 'switch',
			label,
			pendingBreaks: [],
		};
		this.contextStack.push(ctx);
		return ctx;
	}

	popContext(): void {
		this.contextStack.pop();
	}

	findBreakContext(label?: string): ControlContext | undefined {
		for (let i = this.contextStack.length - 1; i >= 0; i -= 1) {
			const ctx = this.contextStack[i];
			if (label) {
				if (ctx.label === label) return ctx;
			} else {
				return ctx;
			}
		}
		return undefined;
	}

	findContinueContext(label?: string): LoopContext | undefined {
		for (let i = this.contextStack.length - 1; i >= 0; i -= 1) {
			const ctx = this.contextStack[i];
			if (ctx.kind !== 'loop') continue;
			if (label) {
				if (ctx.label === label) return ctx;
			} else {
				return ctx;
			}
		}
		return undefined;
	}

	setPendingLabel(label: string): void {
		this.pendingLabel = label;
	}

	getContextStack(): readonly ControlContext[] {
		return this.contextStack;
	}

	// ── Statement traversal ────────────────────────────────────────────

	/**
	 * Visit a sequence of statements in source order.
	 *
	 * Aggregates return / throw exits across all statements (they all
	 * flow to function-level End / ErrorEnd respectively, so they're
	 * additive). Normal `exits` are pipelined: each statement's exits
	 * become the next statement's incoming edges.
	 */
	visitStatements(statements: Statement[]): BuildResult {
		let entry: string | undefined;
		let pendingExits: string[] = [];
		const returnExits: string[] = [];
		const throwExits: string[] = [];

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
			returnExits.push(...result.returnExits);
			throwExits.push(...result.throwExits);
		}

		return {
			entry,
			exits: entry ? [...new Set(pendingExits)] : [],
			returnExits: [...new Set(returnExits)],
			throwExits: [...new Set(throwExits)],
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

			const id = this.writer.addFlowNode('expandable', compactLabel(expandableMeta.label), {
				sourceText,
				construct: 'function',
				nodeKind: expandableMeta.nodeKind,
			});
			return { entry: id, exits: [id], returnExits: [], throwExits: [] };
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
				return this.visitBreak(stmt as BreakStatement);

			case SyntaxKind.ContinueStatement:
				return this.visitContinue(stmt as ContinueStatement);

			case SyntaxKind.LabeledStatement:
				return this.visitLabeled(stmt as LabeledStatement);

			case SyntaxKind.Block:
				return this.visitStatements((stmt as Block).getStatements());

			default:
				return visitAction(this, compactLabel(stmt.getText()), stmt.getText());
		}
	}

	// ── Labeled statement ──────────────────────────────────────────────

	private visitLabeled(stmt: LabeledStatement): BuildResult {
		const labelName = stmt.getLabel().getText();
		this.pendingLabel = labelName;

		const inner = stmt.getStatement();
		const result = this.visitStatement(inner);

		if (result.entry) {
			this.tagLoopLabelIfPossible(result.entry, labelName);
		}

		this.pendingLabel = undefined;

		return result;
	}

	private tagLoopLabelIfPossible(nodeId: string, labelName: string): void {
		const writerWithNodes = this.writer as unknown as { nodes?: import('@xyflow/react').Node[] };
		const node = writerWithNodes.nodes?.find((n) => n.id === nodeId);
		if (!node || node.type !== 'loop') return;
		node.data = { ...(node.data ?? {}), loopLabel: labelName };
	}

	// ── Break / continue ───────────────────────────────────────────────

	/**
	 * Render `break [label]` as a regular action node tagged with
	 * `construct: 'break'`. Register on the matching control context;
	 * the surrounding loop / switch wires it to the right post-construct
	 * target when popping its context.
	 *
	 * Outside any loop / switch (malformed source), fall back to
	 * returnExits so the action at least terminates flow at End.
	 */
	private visitBreak(stmt: BreakStatement): BuildResult {
		const id = this.writer.addFlowNode('action', compactLabel(stmt.getText()), {
			sourceText: stmt.getText(),
			construct: 'break',
		});

		const labelName = stmt.getLabel()?.getText();
		const ctx = this.findBreakContext(labelName);

		if (!ctx) {
			return { entry: id, exits: [], returnExits: [id], throwExits: [] };
		}

		ctx.pendingBreaks.push(id);
		return { entry: id, exits: [], returnExits: [], throwExits: [] };
	}

	private visitContinue(stmt: ContinueStatement): BuildResult {
		const id = this.writer.addFlowNode('action', compactLabel(stmt.getText()), {
			sourceText: stmt.getText(),
			construct: 'continue',
		});

		const labelName = stmt.getLabel()?.getText();
		const ctx = this.findContinueContext(labelName);

		if (!ctx) {
			return { entry: id, exits: [], returnExits: [id], throwExits: [] };
		}

		ctx.pendingContinues.push(id);
		return { entry: id, exits: [], returnExits: [], throwExits: [] };
	}

	// ── Branch entry ───────────────────────────────────────────────────

	visitBranch(node: MorphNode): BuildResult {
		if (MorphNode.isBlock(node)) {
			return this.visitStatements(node.getStatements());
		}

		if (MorphNode.isStatement(node)) {
			return this.visitStatement(node);
		}

		return visitAction(this, node.getText());
	}

	// ── Node creation primitives ───────────────────────────────────────

	createDecisionNode(label: string, sourceText: string): string {
		return this.writer.addFlowNode('decision', label, { sourceText });
	}

	createLoopNode(label: string, sourceText: string): string {
		return this.writer.addFlowNode('loop', label, { sourceText });
	}

	connectLoopBackEdges(exits: string[], loopId: string, _innerDecisionCount: number): void {
		const uniqueExits = [...new Set(exits)].filter((exit) => exit && exit !== loopId);
		for (const exit of uniqueExits) {
			const label = getFallthroughEdgeLabel(exit) ?? '';
			this.writer.addEdge(exit, loopId, label, true);
		}
	}

	analyzeStatementsSemantics(statements: Statement[]): BuildResult {
		const scratchNodes: import('@xyflow/react').Node[] = [];
		const scratchEdges: import('@xyflow/react').Edge[] = [];
		const scratchVisitor = new StatementVisitor(new GraphWriter(scratchNodes, scratchEdges));
		return scratchVisitor.visitStatements(statements);
	}
}