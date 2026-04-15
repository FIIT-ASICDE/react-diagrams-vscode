import {
	Block,
	CallExpression,
	IfStatement,
	Node,
	ReturnStatement,
	SourceFile,
	Statement,
	SyntaxKind,
	ThrowStatement,
	TryStatement,
	ts,
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
} from '../../app@state-diagram-model/types';
import { codePosStr, createId, getAllCalls, getCodePos, getFuncName, normText } from './utils';
import { truncate } from '../../app@core/utils';
import { classifyStateUpdateKind } from './state-mutators';

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

export function createTransition(from: StateGraphNode, to: StateGraphNode, kind: StateTransitionKind, rawConditionText?: string): StateTransition {
	const ifKindName = kind => kind == StateTransitionKind.Then ? 'true' : kind == StateTransitionKind.Else ? 'false' : kind;
	const label = rawConditionText ? `[${kind}] ${truncate(rawConditionText, 80)}` : (kind == StateTransitionKind.Normal ? '' : `[${ifKindName(kind)}]`);
	return {
		id: createId('transition', `${from.id}->${to.id}:${kind}`, from.pos),
		fromNodeId: from.id,
		toNodeId: to.id,
		kind,
		label,
		rawConditionText,
	};
}

export function createOccurrenceUpdateNode(call: CallExpression, stateVariable: StateVariable/*, sourceFile: SourceFile*/): StateUpdate {
	const pos = getCodePos(call);
	const arg = call.getArguments()[0];
	const label = arg ? normText(arg) : undefined;
	const kind = classifyStateUpdateKind(arg);

	return {
		id: createId('update-occ', `${stateVariable.name}:${kind}`, pos),
		nodeType: 'state-update',
		stateVariableId: stateVariable.id,
		setterName: stateVariable.setterName,
		kind,
		pos,
		label,
	};
}

export interface OpenEdge { // We dont yet know "to", remember type and from...
	from: StateGraphNode;
	kind: StateTransitionKind;
	rawConditionText?: string;
}

export class GraphBuilder {
	private readonly updateNodesByPos: Map<string, StateUpdate> = new Map(); // cache to dedup updates

	constructor(
		private readonly stateVariable: StateVariable,
		private readonly mutator: StateMutatingFunction,
		private readonly nodes: StateGraphNode[],
		private readonly transitions: StateTransition[],
		// private readonly sourceFile?: SourceFile,
		
	) {
		for (const node of nodes) {
			if (node.nodeType != 'state-update' || node.stateVariableId != stateVariable.id)
				continue;
			this.updateNodesByPos.set(codePosStr(node.pos), node);
		}
	}

	private connect(to: StateGraphNode, edges: OpenEdge[]) {
		for (const edge of edges)
			this.transitions.push(createTransition(edge.from, to, edge.kind, edge.rawConditionText));
	}

	private appendFlowNode(kind: ControlFlowNodeKind, node: Node, label?: string) {
		const flowNode = createFlowNode(kind, node, this.mutator, label);
		this.nodes.push(flowNode);
		return flowNode;
	}

	private appendUpdateNode(call: CallExpression) {
		const pos = getCodePos(call);
		const key = codePosStr(pos);

		const existing = this.updateNodesByPos.get(key);
		if (existing)
			return existing;

		const created = createOccurrenceUpdateNode(call, this.stateVariable);
		this.nodes.push(created);
		this.updateNodesByPos.set(key, created);
		return created;
	}

	visitReturn(statement: ReturnStatement, incoming: OpenEdge[]) {
		let current = incoming;
		const setterCalls = getAllCalls(statement, this.stateVariable.setterName);

		for (const call of setterCalls) {
			const updateNode = this.appendUpdateNode(call);
			this.connect(updateNode, current);
			current = [{ from: updateNode, kind: StateTransitionKind.Normal }];
		}

		const txt = statement.getExpression()?.getText(); 
		const exitNode = this.appendFlowNode('exit', statement, txt ? `return ${truncate(txt, 80)}` : ``);
		this.connect(exitNode, current);
		return [];
	}

	visitThrow(statement: ThrowStatement, incoming: OpenEdge[]) {
		const txt = statement.getExpression().getText();
		const exitNode = this.appendFlowNode('throw', statement, `throw ${truncate(txt, 80)}`);
		this.connect(exitNode, incoming);
		return [];
	}

	visitIf(statement: IfStatement, incoming: OpenEdge[]) {
		const conditionText = statement.getExpression().getText();
		const decisionNode = this.appendFlowNode('decision', statement, truncate(conditionText, 80));
		this.connect(decisionNode, incoming);

		const thenIncoming: OpenEdge[] = [{ from: decisionNode, kind: StateTransitionKind.Then, /*rawConditionText: conditionText*/ }];
		const thenBody = statement.getThenStatement();
		const thenOpen = this.visit(thenBody, thenIncoming)

		const elseIncoming: OpenEdge[] = [{ from: decisionNode, kind: StateTransitionKind.Else, /*rawConditionText: `!(${conditionText})`*/ }];
		const elseBody = statement.getElseStatement();
		var elseOpen = !elseBody ? elseIncoming : Node.isIfStatement(elseBody) ? this.visitIf(elseBody, elseIncoming) : this.visit(elseBody, elseIncoming);

		const allOpen = [...thenOpen, ...elseOpen];
		if (!allOpen.length)
			return [];

		const mergeNode = this.appendFlowNode('merge', statement);
		this.connect(mergeNode, allOpen);
		return [{ from: mergeNode, kind: StateTransitionKind.Normal }];
	}

	visitTry(statement: TryStatement, incoming: OpenEdge[]) {
		const decisionNode = this.appendFlowNode('try-decision', statement, 'try');
		this.connect(decisionNode, incoming);

		const tryOpen = this.visit(statement.getTryBlock(), [{ from: decisionNode, kind: StateTransitionKind.Normal }]);

		const catchClause = statement.getCatchClause();
		let catchOpen: OpenEdge[] = [];
		if (catchClause) {
			const catchParam = catchClause.getVariableDeclaration()?.getName() ?? 'error';
			catchOpen = this.visit(catchClause.getBlock(), [{
				from: decisionNode,
				kind: StateTransitionKind.Catch,
				rawConditionText: catchParam,
			}]);
		}

		const finallyBlock = statement.getFinallyBlock();
		let finalOpen: OpenEdge[];
		if (finallyBlock) {
			const toFinally = [...tryOpen, ...catchOpen];
			const finallyIncoming = toFinally.length ? toFinally : [{ from: decisionNode, kind: StateTransitionKind.Finally }];
			finalOpen = this.visit(finallyBlock, finallyIncoming);
		}
		else {
			finalOpen = [...tryOpen, ...catchOpen];
		}

		if (!finalOpen.length)
			return [];

		const mergeNode = this.appendFlowNode('merge', statement);
		this.connect(mergeNode, finalOpen);
		return [{ from: mergeNode, kind: StateTransitionKind.Normal }];
	}

	visit(what: Statement | Block, incoming: OpenEdge[]) {
		let current = incoming;
		if (Node.isBlock(what)) {
			for (const statement of what.getStatements()) {
				current = this.visit(statement, current);
				if (!current.length)
					return current;
			}
			return current;
		}

		if (Node.isIfStatement(what))
			return this.visitIf(what, incoming);

		if (Node.isTryStatement(what))
			return this.visitTry(what, incoming);

		if (Node.isReturnStatement(what))
			return this.visitReturn(what, incoming);

		if (Node.isThrowStatement(what))
			return this.visitThrow(what, incoming);

		const setterCalls = getAllCalls(what, this.stateVariable.setterName);
		for (const call of setterCalls) {
			const updateNode = this.appendUpdateNode(call);
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
		const exitNode = this.appendFlowNode('exit', body);
		this.connect(exitNode, finalOpen);
	}
}

export function buildTransitionFlowGraph(mutatorBodies: Map<Id, Block>, stateVariables: StateVariable[]/*, sourceFile: SourceFile*/) {
	for (const stateVariable of stateVariables) {
		const mutators = [...(stateVariable.mutators ?? []), ...(stateVariable.inlineMutator ? [stateVariable.inlineMutator] : [])]; // remember obj instances are shared
		for (const mutator of mutators) {
			const body = mutatorBodies.get(mutator.id);
			if (!body)
				continue;

			mutator.nodes = mutator.nodes.filter(({nodeType}) => nodeType == 'state-update');
			mutator.transitions = [];

			const builder = new GraphBuilder(
				stateVariable,
				mutator,
				mutator.nodes,
				mutator.transitions,
				// sourceFile
			);

			builder.build(body);
		}
	}
}