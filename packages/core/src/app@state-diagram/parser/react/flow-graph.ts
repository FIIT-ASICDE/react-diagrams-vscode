import {
	Block,
	BreakStatement,
	CallExpression,
	ContinueStatement,
	DoStatement,
	ForStatement,
	IfStatement,
	Node,
	ReturnStatement,
	SourceFile,
	Statement,
	SwitchStatement,
	SyntaxKind,
	ThrowStatement,
	TryStatement,
	ts,
	WhileStatement,
} from 'ts-morph';
import {
	ControlFlowNode,
	ControlFlowNodeKind,
	Id,
	StateGraphNode,
	StateGraphNodeType,
	StateMutatingFunction,
	StateTransition,
	StateTransitionKind,
	StateUpdate,
	StateUpdateKind,
	StateVariable,
} from '../../../app@state-diagram-model/types';
import { codePosStr, createId, getAllCalls, getCodePos, getFuncName, normText } from '../utils';
import { truncate } from '../../../app@core/utils';

export function createFlowNode(kind: ControlFlowNodeKind, node: Node, mutator: StateMutatingFunction, label?: string/*, sourceFile: SourceFile*/): ControlFlowNode {
	const pos = getCodePos(node);
	return {
		id: createId('flow', label ? `${mutator.id}-${label}:${kind}` : `${mutator.id}:${kind}`, pos),
		nodeType: 'control-flow',
		kind,
		label,
		pos,
	};
}

export function createTransition(from: StateGraphNode, to: StateGraphNode, kind: StateTransitionKind, rawConditionText?: string, label?: string): StateTransition {
	const ifKindName = kind => kind == StateTransitionKind.Then ? 'true' : kind == StateTransitionKind.Else ? 'false' : kind;
	label ??= rawConditionText ? `[${kind}] ${truncate(rawConditionText, 80)}` : (kind == StateTransitionKind.Normal ? '' : `[${ifKindName(kind)}]`);
	return {
		id: createId('transition', `${from.id}->${to.id}:${kind}`, from.pos),
		fromNodeId: from.id,
		toNodeId: to.id,
		kind,
		label,
		rawConditionText,
	};
}

export function normalizeOpenEdges(openEdges: OpenEdge[], to?: StateGraphNode) { // necessary evil to dedup case fallthroughs and rm unecessary...
	const result: OpenEdge[] = [];
	const caseByFromId = new Map<string, OpenEdge>();
	for (const edge of openEdges) {
		if (edge.kind != StateTransitionKind.Case && edge.kind != StateTransitionKind.Default) {
			result.push(edge);
			continue;
		}

		if (edge.from.kind == 'switch-decision' && to?.kind == 'merge')
			continue;

		const existing = caseByFromId.get(edge.from.id);
		if (!existing) {
			caseByFromId.set(edge.from.id, edge);
			result.push(edge);
			continue;
		}

		if (existing.kind == StateTransitionKind.Default)
			continue;

		if (edge.kind == StateTransitionKind.Default) {
			existing.kind = StateTransitionKind.Default;
			existing.rawConditionText = undefined;
			continue;
		}

		existing.rawConditionText = `${existing.rawConditionText} | ${edge.rawConditionText}`;
	}
	return result;
}

export const isRelevant = (node: Node, setterName: string, hasSetterAhead = false) => {
	if (getAllCalls(node, setterName, "some"))
		return true;

	if (!hasSetterAhead)
		return false;

	return node.getDescendants().some(n => Node.isReturnStatement(n) || Node.isThrowStatement(n));
};

export interface OpenEdge { // We dont yet know "to", remember type and from...
	from: StateGraphNode;
	kind: StateTransitionKind;
	to?: StateGraphNode,
	rawConditionText?: string;
	label?: string;
}

export interface StateVisitContext {
	breakCollector?: OpenEdge[];
	continueCollector?: OpenEdge[];
}

export type MergeSquashType = "merge->merge" | "merge->decision" | "merge->try" | "merge->switch" | "merge->loop" | "do->x" | "merge->exit";
export interface StateGraphOptions {
	mergeSquashing?: MergeSquashType[];
	useGuardsWhenPossible?: boolean;
}

export const emplaceMergeIfCan = (incoming: OpenEdge[], mergeSquashType: MergeSquashType, options?: StateGraphOptions, currNode?: StateGraphNode) => {
	currNode ??= incoming[0]?.from;
	return incoming.length == 1 && options?.mergeSquashing?.includes(mergeSquashType) && incoming[0]?.kind == StateTransitionKind.Normal && currNode?.kind == 'merge' ? currNode : undefined;
}

export class GraphBuilder {
	private readonly updateNodesByPos: Map<string, StateUpdate> = new Map(); // cache to dedup updates

	constructor(
		private readonly stateVariable: StateVariable,
		private readonly mutator: StateMutatingFunction,
		private readonly nodes: StateGraphNode[],
		private readonly transitions: StateTransition[],
		private readonly options?: StateGraphOptions,
		// private readonly sourceFile?: SourceFile,
		
	) {
		for (const node of nodes) {
			if (node.nodeType != 'state-update' || node.stateVariableId != stateVariable.id)
				continue;
			this.updateNodesByPos.set(codePosStr(node.pos), node);
		}
	}

	connect(to: StateGraphNode, edges: OpenEdge[], avoidSelfLoop = false) {
		for (const edge of normalizeOpenEdges(edges, to)) {
			if (avoidSelfLoop && edge.from.id == to.id)
				continue;
			edge.to = to;
			this.transitions.push(createTransition(edge.from, to, edge.kind, edge.rawConditionText, edge.label));
		}
		return to;
	}

	appendFlowNode(kind: ControlFlowNodeKind, node: Node, label?: string, replaceCurrent?: ControlFlowNode) {
		const flowNode = createFlowNode(kind, node, this.mutator, label);
		if (replaceCurrent) {
			Object.assign(replaceCurrent, { ...flowNode, id: replaceCurrent.id });
			return replaceCurrent;
		}
		this.nodes.push(flowNode);
		return flowNode;
	}

	rerouteFlow(from: StateGraphNode, to: StateGraphNode, rmFrom = false) {
		for (let i = this.transitions.length - 1; i >= 0; i--) {
			const transition = this.transitions[i];
			if (rmFrom && transition.fromNodeId == from.id) {
				this.transitions.splice(i, 1);
				continue;
			}

			if (transition.toNodeId == from.id) {
				transition.toNodeId = to.id;
			}
		}

		if (rmFrom) {
			const idx = this.nodes.indexOf(from);
			if (idx != -1)
				this.nodes.splice(idx, 1);
		}
		return to;
	}

	collapseWithMerge(node: Node, openEdges: OpenEdge[]) {
		const normalizedOpen = normalizeOpenEdges(openEdges);
		if (!normalizedOpen.length)
			return [];

		if (normalizedOpen.length == 1)
			return normalizedOpen;

		const mergeNode = this.appendFlowNode('merge', node);
		if (this.options?.mergeSquashing?.includes("merge->merge")) {
			for (const edge of normalizedOpen) {
				if (edge.from.kind == 'merge') {
					this.rerouteFlow(edge.from, mergeNode, true);
					continue;
				}
				this.connect(mergeNode, [edge]);
			}
		}
		else
			this.connect(mergeNode, normalizedOpen);
		return [{ from: mergeNode, kind: StateTransitionKind.Normal }];
	}

	visitReturn(statement: ReturnStatement, incoming: OpenEdge[]) {
		let current = incoming;
		const setterCalls = getAllCalls(statement, this.stateVariable.setterName) as CallExpression[];

		for (const call of setterCalls) {
			const updateNode = this.updateNodesByPos.get(codePosStr(getCodePos(call)));
			if (!updateNode)
				continue;

			this.connect(updateNode, current);
			current = [{ from: updateNode, kind: StateTransitionKind.Normal }];
		}

		return this.visitEnd(statement, current);
	}

	visitEnd(statement: ThrowStatement | ReturnStatement | Block, incoming: OpenEdge[], what: 'exit' | 'throw' = 'exit') {
		const txt = Node.isBlock(statement) ? '' : statement.getExpression()?.getText();

		const currNode = emplaceMergeIfCan(incoming, `merge->exit`, this.options);
		const exitNode = this.appendFlowNode(what, statement, txt ? `${what} ${truncate(txt, 80)}` : ``, currNode);
		if (currNode != exitNode)
			this.connect(exitNode, incoming);
		return [];
	}

	visitIf(statement: IfStatement, incoming: OpenEdge[], hasSetterAhead = false, context?: StateVisitContext): OpenEdge[] {
		if (!isRelevant(statement, this.stateVariable.setterName, hasSetterAhead)) // omit unrelated
			return incoming;

		const conditionText = statement.getExpression().getText();
		const thenBody = statement.getThenStatement();
		const elseBody = statement.getElseStatement();
		const isElseif = Node.isIfStatement(elseBody);

		const { from, kind } = incoming[0] ?? {};
		if (this.options?.useGuardsWhenPossible && !isElseif && incoming.length == 1 && from?.nodeType == 'state-update' && kind == StateTransitionKind.Normal) {

			const thenIncoming: OpenEdge[] = [{ from, kind: StateTransitionKind.Then, label: `[${truncate(conditionText, 80)}]` }];
			const thenOpen = this.visit(thenBody, thenIncoming, hasSetterAhead, context);

			const elseIncoming: OpenEdge[] = [{ from, kind: StateTransitionKind.Else, label: `[else]` }];
			const elseOpen = !elseBody ? elseIncoming : this.visit(elseBody, elseIncoming, hasSetterAhead, context);

			return normalizeOpenEdges([...thenOpen, ...elseOpen]);
		}
		
		const decisionNode = this.appendFlowNode('decision', statement, truncate(conditionText, 80), emplaceMergeIfCan(incoming, `merge->decision`, this.options, from));
		this.connect(decisionNode, incoming, true);

		const thenIncoming: OpenEdge[] = [{ from: decisionNode, kind: StateTransitionKind.Then, /*rawConditionText: conditionText*/ }];
		const thenOpen = this.visit(thenBody, thenIncoming, hasSetterAhead, context)

		const elseIncoming: OpenEdge[] = [{ from: decisionNode, kind: StateTransitionKind.Else, /*rawConditionText: `!(${conditionText})`*/ }];
		var elseOpen = !elseBody ? elseIncoming : isElseif ? this.visitIf(elseBody, elseIncoming, hasSetterAhead, context) : this.visit(elseBody, elseIncoming, hasSetterAhead, context);

		return this.collapseWithMerge(statement, [...thenOpen, ...elseOpen]);
	}

	visitTry(statement: TryStatement, incoming: OpenEdge[], hasSetterAhead = false, context?: StateVisitContext) {
		if (!isRelevant(statement, this.stateVariable.setterName, hasSetterAhead)) // omit unrelated
			return incoming;

		const decisionNode = this.appendFlowNode('try-decision', statement, 'try', emplaceMergeIfCan(incoming, `merge->try`, this.options));
		this.connect(decisionNode, incoming, true);

		const tryOpen = this.visit(statement.getTryBlock(), [{ from: decisionNode, kind: StateTransitionKind.Normal }], hasSetterAhead, context);

		const catchClause = statement.getCatchClause();
		let catchOpen: OpenEdge[] = [];
		if (catchClause) {
			const catchParam = catchClause.getVariableDeclaration()?.getName() ?? 'error';
			catchOpen = this.visit(catchClause.getBlock(), [{
				from: decisionNode,
				kind: StateTransitionKind.Catch,
				rawConditionText: catchParam,
			}], hasSetterAhead, context);
		}

		const finallyBlock = statement.getFinallyBlock();
		let finalOpen: OpenEdge[];
		if (finallyBlock) {
			const toFinally = [...tryOpen, ...catchOpen];
			const finallyIncoming = toFinally.length ? toFinally : [{ from: decisionNode, kind: StateTransitionKind.Finally }];
			finalOpen = this.visit(finallyBlock, finallyIncoming, hasSetterAhead, context);
		}
		else {
			finalOpen = [...tryOpen, ...catchOpen];
		}

		return this.collapseWithMerge(statement, finalOpen);
	}

	visitBreak(_statement: BreakStatement, incoming: OpenEdge[], context?: StateVisitContext) {
		if (!context?.breakCollector)
			return incoming;

		context.breakCollector.push(...incoming);
		return [];
	}

	visitContinue(_statement: ContinueStatement, incoming: OpenEdge[], context?: StateVisitContext) {
		if (!context?.continueCollector)
			return incoming;

		context.continueCollector.push(...incoming);
		return [];
	}

	visitSwitch(statement: SwitchStatement, incoming: OpenEdge[], hasSetterAhead = false, context?: StateVisitContext) {
		if (!isRelevant(statement, this.stateVariable.setterName, hasSetterAhead)) // omit unrelated
			return incoming;

		const decisionNode = this.appendFlowNode('switch-decision', statement, truncate(statement.getExpression().getText(), 80), emplaceMergeIfCan(incoming, `merge->switch`, this.options));
		this.connect(decisionNode, incoming, true);

		const clauses = statement.getCaseBlock().getClauses();
		const hasSetterAfterClause: boolean[] = new Array(clauses.length);
		let seenSetterAhead = hasSetterAhead;

		for (let i = clauses.length - 1; i >= 0; i--) {
			hasSetterAfterClause[i] = seenSetterAhead;
			if (getAllCalls(clauses[i], this.stateVariable.setterName, 'some'))
				seenSetterAhead = true;
		}

		let fallthroughOpen: OpenEdge[] = [];
		const switchBreakEdges: OpenEdge[] = [];

		for (let i = 0; i < clauses.length; i++) {
			const clause = clauses[i];
			
			const caseEdge = Node.isCaseClause(clause) ? 
				{ from: decisionNode, kind: StateTransitionKind.Case, rawConditionText: clause.getExpression().getText() } : 
				{ from: decisionNode, kind: StateTransitionKind.Default };
			
			const clauseIncoming: OpenEdge[] = [...fallthroughOpen, caseEdge];
			if (!clauseIncoming.length) {
				fallthroughOpen = [];
				continue;
			}
			
			let current = clauseIncoming;
			const clauseHasSetterAhead = hasSetterAfterClause[i];
			const statements = clause.getStatements();
			const hasSetterAfterStmt: boolean[] = new Array(statements.length);
			let seenSetterInClause = clauseHasSetterAhead;

			for (let j = statements.length - 1; j >= 0; j--) {
				hasSetterAfterStmt[j] = seenSetterInClause;
				if (getAllCalls(statements[j], this.stateVariable.setterName, 'some'))
					seenSetterInClause = true;
			}

			for (let j = 0; j < statements.length; j++) {
				current = this.visit(statements[j], current, hasSetterAfterStmt[j], {
					breakCollector: switchBreakEdges,
					continueCollector: context?.continueCollector,
				});
				if (!current.length)
					break;
			}

			fallthroughOpen = current;
		}

		return this.collapseWithMerge(statement, [...switchBreakEdges, ...fallthroughOpen]);
	}

	visitLoop(statement: ForStatement | WhileStatement, incoming: OpenEdge[], hasSetterAhead = false) {
		if (!isRelevant(statement, this.stateVariable.setterName, hasSetterAhead)) // omit unrelated
			return incoming;

		const conditionText = Node.isWhileStatement(statement) ? statement.getExpression().getText() : statement.getCondition()?.getText() ?? 'for';
		const decisionNode = this.appendFlowNode('loop-decision', statement, truncate(conditionText, 80), emplaceMergeIfCan(incoming, `merge->loop`, this.options));
		this.connect(decisionNode, incoming, true);

		const loopBreakEdges: OpenEdge[] = [];
		const loopContinueEdges: OpenEdge[] = [];

		const bodyOpen = this.visit(
			statement.getStatement(),
			[{ from: decisionNode, kind: StateTransitionKind.Then }],
			hasSetterAhead,
			{ breakCollector: loopBreakEdges, continueCollector: loopContinueEdges },
		);

		const loopBack = [...bodyOpen, ...loopContinueEdges].map(edge => ({ ...edge, kind: StateTransitionKind.Loop }));
		if (loopBack.length)
			this.connect(decisionNode, loopBack);

		return this.collapseWithMerge(statement, [{ from: decisionNode, kind: StateTransitionKind.Else }, ...loopBreakEdges]);
	}

	visitDoWhile(statement: DoStatement, incoming: OpenEdge[], hasSetterAhead = false) {
		if (!isRelevant(statement, this.stateVariable.setterName, hasSetterAhead)) // omit unrelated
			return incoming;

		const bodyEntry = this.appendFlowNode('merge', statement, 'do');
		this.connect(bodyEntry, incoming);

		const loopBreakEdges: OpenEdge[] = [];
		const loopContinueEdges: OpenEdge[] = [];

		const loopEntryEdge: OpenEdge[] = [{ from: bodyEntry, kind: StateTransitionKind.Normal }]
		const bodyOpen = this.visit(statement.getStatement(), loopEntryEdge, hasSetterAhead, { breakCollector: loopBreakEdges, continueCollector: loopContinueEdges });

		const conditionText = statement.getExpression().getText();
		const decisionNode = this.appendFlowNode('loop-decision', statement, truncate(conditionText, 80));
		const toDecision = [...bodyOpen, ...loopContinueEdges];
		if (toDecision.length)
			this.connect(decisionNode, toDecision);

		const loopback = [{ from: decisionNode, kind: StateTransitionKind.Loop }];
		if (this.options?.mergeSquashing?.includes("do->x") && loopEntryEdge[0].to)
			this.connect(this.rerouteFlow(bodyEntry, loopEntryEdge[0].to, true), loopback);
		else
			this.connect(bodyEntry, loopback);
			
		return this.collapseWithMerge(statement, [{ from: decisionNode, kind: StateTransitionKind.Else }, ...loopBreakEdges]);
	}

	visit(what: Statement | Block, incoming: OpenEdge[], hasSetterAhead = false, context?: StateVisitContext) {
		let current = incoming;
		if (Node.isBlock(what)) {
			const statements = what.getStatements();
			const hasSetterAfter: boolean[] = new Array(statements.length);
			let seenSetterAhead = hasSetterAhead;

			for (let i = statements.length - 1; i >= 0; i--) {
				hasSetterAfter[i] = seenSetterAhead;
				if (getAllCalls(statements[i], this.stateVariable.setterName, "some"))
					seenSetterAhead = true;
			}

			for (let i = 0; i < statements.length; i++) {
				current = this.visit(statements[i], current, hasSetterAfter[i], context);
				if (!current.length)
					return current;
			}
			return current;
		}

		if (Node.isIfStatement(what))
			return this.visitIf(what, incoming, hasSetterAhead, context);

		if (Node.isTryStatement(what))
			return this.visitTry(what, incoming, hasSetterAhead, context);

		if (Node.isSwitchStatement(what))
			return this.visitSwitch(what, incoming, hasSetterAhead, context);

		if (Node.isForStatement(what) || Node.isWhileStatement(what))
			return this.visitLoop(what, incoming, hasSetterAhead);

		if (Node.isDoStatement(what))
			return this.visitDoWhile(what, incoming, hasSetterAhead);

		if (Node.isBreakStatement(what))
			return this.visitBreak(what, incoming, context);

		if (Node.isContinueStatement(what))
			return this.visitContinue(what, incoming, context);

		if (Node.isReturnStatement(what))
			return this.visitReturn(what, incoming);

		if (Node.isThrowStatement(what))
			return this.visitEnd(what, incoming, 'throw');

		const setterCalls = getAllCalls(what, this.stateVariable.setterName) as CallExpression[];
		for (const call of setterCalls) {
			const updateNode = this.updateNodesByPos.get(codePosStr(getCodePos(call)));
			if (!updateNode)
				continue;

			this.connect(updateNode, current);
			current = [{ from: updateNode, kind: StateTransitionKind.Normal }];
		}

		return current;
	}

	build(body: Block) {
		const entryNode = this.appendFlowNode('entry', body, this.mutator.name);
		const finalOpen = this.visit(body, [{ from: entryNode, kind: StateTransitionKind.Normal }]);
		if (!finalOpen.length)
			return;

		// const exitNode = this.appendFlowNode('exit', body, 'return');
		this.visitEnd(body, finalOpen);
	}
}

export function buildTransitionFlowGraph(mutatorBodies: Map<Id, Block>, stateVariables: StateVariable[], stateFlowOptions?: StateGraphOptions) {
	for (const stateVariable of stateVariables) {
		const mutators = [...(stateVariable.mutators ?? [])]; // remember obj instances are shared
		for (const mutator of mutators) {
			const body = mutatorBodies.get(mutator.id);
			if (!body)
				continue;

			mutator.nodes = mutator.nodes.filter(({nodeType}) => nodeType == 'state-update');
			mutator.transitions = [];

			const builder = new GraphBuilder(stateVariable, mutator, mutator.nodes, mutator.transitions, stateFlowOptions);
			builder.build(body);
		}
	}
}