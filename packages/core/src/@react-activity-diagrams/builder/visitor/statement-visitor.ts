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

	// Creates a statement visitor with a graph writer host.
	constructor(public writer: GraphWriter) {}

	

	// Creates a merge node for multiple incoming sources.
	private createMergeForSources(
		sources: string[],
		sourceLabels?: Record<string, string>,
	): string | undefined {
		const uniqueSources = [...new Set(sources)].filter(Boolean);
		if (uniqueSources.length < 2) return undefined;

		const mergeId = this.writer.addFlowNode('merge', '');
		for (const source of uniqueSources) {
			const label = sourceLabels?.[source] ?? getFallthroughEdgeLabel(this, source);
			this.writer.addEdge(source, mergeId, label);
		}
		return mergeId;
	}

	// Resolves statement exits to a single source when needed.
	resolveExitSources(sources: string[], sourceLabels?: Record<string, string>): string[] {
		const uniqueSources = [...new Set(sources)].filter(Boolean);
		if (uniqueSources.length <= 1) return uniqueSources;

		const mergeId = this.createMergeForSources(uniqueSources, sourceLabels);
		return mergeId ? [mergeId] : uniqueSources;
	}

	

	// Pushes loop context for break and continue handling.
	pushLoopContext(loopId: string): LoopContext {
		const label = this.pendingLabel;
		this.pendingLabel = undefined;

		const ctx: LoopContext = {
			kind: 'loop',
			continueTarget: loopId,
			breakTarget: loopId,
			label,
			pendingBreaks: [],
			pendingContinues: [],
		};
		this.contextStack.push(ctx);
		return ctx;
	}

	// Pushes switch context for break handling.
	pushSwitchContext(breakTarget: string): SwitchContext {
		const label = this.pendingLabel;
		this.pendingLabel = undefined;

		const ctx: SwitchContext = {
			kind: 'switch',
			breakTarget,
			label,
			pendingBreaks: [],
		};
		this.contextStack.push(ctx);
		return ctx;
	}

	// Pops the current control-flow context.
	popContext(): void {
		this.contextStack.pop();
	}

	// Finds the nearest matching loop or switch context.
	findNearestContext(kinds: Array<'loop' | 'switch'>, label?: string): ControlContext | undefined {
		for (let i = this.contextStack.length - 1; i >= 0; i -= 1) {
			const ctx = this.contextStack[i];
			if (!kinds.includes(ctx.kind)) continue;
			if (label) {
				if (ctx.label === label) return ctx;
			} else {
				return ctx;
			}
		}
		return undefined;
	}

	// Stores a pending label for the next labeled control node.
	setPendingLabel(label: string): void {
		this.pendingLabel = label;
	}

	// Returns the current control context stack.
	getContextStack(): readonly ControlContext[] {
		return this.contextStack;
	}

	

	// Visits and connects a linear list of statements.
	visitStatements(statements: Statement[]): BuildResult {
	let entry: string | undefined;
	let entryEdgeLabel: string | undefined;
	let pendingExits: string[] = [];
	let pendingExitLabels: Record<string, string> | undefined;
	const returnExits: string[] = [];
	const throwExits: string[] = [];
	let hasRenderedStatement = false;

	for (let index = 0; index < statements.length; index += 1) {
		if (statements[index].getKind() === SyntaxKind.ImportDeclaration) {
			continue;
		}

		if (hasRenderedStatement && pendingExits.length === 0) {
			break;
		}

		const result = this.visitStatement(statements[index]);

		returnExits.push(...result.returnExits);
		throwExits.push(...result.throwExits);

		if (!result.entry) {
			continue;
		}

		if (!entry) {
			entry = result.entry;
			entryEdgeLabel = result.entryEdgeLabel;
		}

		for (const exit of pendingExits) {
			const exitData = this.writer.getNodeData(exit);
			const label = pendingExitLabels?.[exit]
				?? result.entryEdgeLabel
				?? (exitData?.role === 'try-exit-boundary' ? 'exit try' : getFallthroughEdgeLabel(this, exit));

			this.writer.addEdge(exit, result.entry, label);
		}

		pendingExits = result.exits;
		pendingExitLabels = result.exitLabels;
		hasRenderedStatement = true;
	}

	const finalExitLabels = pendingExitLabels
		? Object.fromEntries(
			Object.entries(pendingExitLabels).filter(([exitId]) => pendingExits.includes(exitId)),
		)
		: undefined;

	return {
		entry,
		entryEdgeLabel,
		exits: entry ? [...new Set(pendingExits)] : [],
		exitLabels: finalExitLabels && Object.keys(finalExitLabels).length > 0 ? finalExitLabels : undefined,
		returnExits: [...new Set(returnExits)],
		throwExits: [...new Set(throwExits)],
	};
}

	// Visits statements in inline branch context.
	visitStatementsInline(statements: Statement[]): BuildResult {
		return this.visitStatements(statements);
	}

	// Visits a single statement and dispatches by syntax kind.
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

	

	// Visits a labeled statement and applies loop label metadata.
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

	// Tags a loop node with its source label when applicable.
	private tagLoopLabelIfPossible(nodeId: string, labelName: string): void {
		if (this.writer.getNodeType(nodeId) !== 'loop') return;
		this.writer.updateNodeData(nodeId, { loopLabel: labelName });
	}

	

	// Visits a break statement and routes it through context.
	private visitBreak(stmt: BreakStatement): BuildResult {
		const id = this.writer.addFlowNode('action', compactLabel(stmt.getText()), {
			sourceText: stmt.getText(),
			construct: 'break',
		});

		const labelName = stmt.getLabel()?.getText();
		const ctx = this.findNearestContext(['loop', 'switch'], labelName);

		if (!ctx) {
			return { entry: id, exits: [id], returnExits: [], throwExits: [] };
		}

		ctx.pendingBreaks.push(id);
		return { entry: id, exits: [], returnExits: [], throwExits: [] };
	}

	// Visits a continue statement and routes it through loop context.
	private visitContinue(stmt: ContinueStatement): BuildResult {
		const id = this.writer.addFlowNode('action', compactLabel(stmt.getText()), {
			sourceText: stmt.getText(),
			construct: 'continue',
		});

		const labelName = stmt.getLabel()?.getText();
		const ctx = this.findNearestContext(['loop'], labelName);

		if (!ctx || ctx.kind !== 'loop') {
			return { entry: id, exits: [id], returnExits: [], throwExits: [] };
		}

		ctx.pendingContinues.push(id);
		return { entry: id, exits: [], returnExits: [], throwExits: [] };
	}

	

	// Visits a branch node as block, statement, or action fallback.
	visitBranch(node: MorphNode): BuildResult {
		if (MorphNode.isBlock(node)) {
			return this.visitStatements(node.getStatements());
		}

		if (MorphNode.isStatement(node)) {
			return this.visitStatement(node);
		}

		return visitAction(this, node.getText());
	}

	

	// Creates a decision node in the graph.
	createDecisionNode(label: string, sourceText: string): string {
		return this.writer.addFlowNode('decision', label, { sourceText });
	}

	// Creates a loop node in the graph.
	createLoopNode(label: string, sourceText: string): string {
		return this.writer.addFlowNode('loop', label, { sourceText });
	}

	// Connects loop body exits back to the loop header.
	connectLoopBackEdges(exits: string[], loopId: string): void {
		const uniqueExits = [...new Set(exits)].filter((exit) => exit && exit !== loopId);
		for (const exit of uniqueExits) {
			const label = getFallthroughEdgeLabel(this, exit) ?? '';
			this.writer.addEdge(exit, loopId, label, true);
		}
	}
}