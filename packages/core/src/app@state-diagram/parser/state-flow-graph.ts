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

	private appendFlowNode(kind: ControlFlowNodeKind, node: Node, label?: string, replaceCurrent?: ControlFlowNode) {
		const flowNode = createFlowNode(kind, node, this.mutator, label);
		if (replaceCurrent) {
			Object.assign(replaceCurrent, { ...flowNode, id: replaceCurrent.id });
			return replaceCurrent;
		}
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
		const setterCalls = getAllCalls(statement, this.stateVariable.setterName) as CallExpression[];

		for (const call of setterCalls) {
			const updateNode = this.appendUpdateNode(call);
			this.connect(updateNode, current);
			current = [{ from: updateNode, kind: StateTransitionKind.Normal }];
		}

		return this.visitEnd(statement, current, 'return');
	}

	// visitThrow(statement: ThrowStatement, incoming: OpenEdge[]) {
	// 	const txt = statement.getExpression().getText();
	// 	const currNode = incoming.length == 1 ? incoming[0].from : undefined;
	// 	const exitNode = this.appendFlowNode('throw', statement, `throw ${truncate(txt, 80)}`, currNode?.kind == 'merge' ? currNode : undefined);
	// 	if (currNode != exitNode)
	// 		this.connect(exitNode, incoming);
	// 	return [];
	// }

	visitEnd(statement: ThrowStatement | ReturnStatement, incoming: OpenEdge[], what: 'return' | 'throw') {
		const txt = statement.getExpression()?.getText();

		const currNode = incoming.length == 1 ? incoming[0].from : undefined;
		const exitNode = this.appendFlowNode(what == 'return' ? 'exit' : what, statement, txt ? `${what} ${truncate(txt, 80)}` : ``, currNode?.kind == 'merge' ? currNode : undefined);
		if (currNode != exitNode)
			this.connect(exitNode, incoming);
		return [];
	}

	visitIf(statement: IfStatement, incoming: OpenEdge[], hasSetterAhead = false): OpenEdge[] {
		if (!isRelevant(statement, this.stateVariable.setterName, hasSetterAhead)) // omit unrelated
			return incoming;

		const conditionText = statement.getExpression().getText();
		const decisionNode = this.appendFlowNode('decision', statement, truncate(conditionText, 80));
		this.connect(decisionNode, incoming);

		const thenIncoming: OpenEdge[] = [{ from: decisionNode, kind: StateTransitionKind.Then, /*rawConditionText: conditionText*/ }];
		const thenBody = statement.getThenStatement();
		const thenOpen = this.visit(thenBody, thenIncoming, hasSetterAhead)

		const elseIncoming: OpenEdge[] = [{ from: decisionNode, kind: StateTransitionKind.Else, /*rawConditionText: `!(${conditionText})`*/ }];
		const elseBody = statement.getElseStatement();
		var elseOpen = !elseBody ? elseIncoming : Node.isIfStatement(elseBody) ? this.visitIf(elseBody, elseIncoming, hasSetterAhead) : this.visit(elseBody, elseIncoming, hasSetterAhead);

		const allOpen = [...thenOpen, ...elseOpen];
		if (!allOpen.length)
			return [];

		if (allOpen.length == 1)
			return allOpen;

		const mergeNode = this.appendFlowNode('merge', statement);
		this.connect(mergeNode, allOpen);
		return [{ from: mergeNode, kind: StateTransitionKind.Normal }];
	}

	visitTry(statement: TryStatement, incoming: OpenEdge[], hasSetterAhead = false) {
		if (!isRelevant(statement, this.stateVariable.setterName, hasSetterAhead)) // omit unrelated
			return incoming;

		const decisionNode = this.appendFlowNode('try-decision', statement, 'try');
		this.connect(decisionNode, incoming);

		const tryOpen = this.visit(statement.getTryBlock(), [{ from: decisionNode, kind: StateTransitionKind.Normal }], hasSetterAhead);

		const catchClause = statement.getCatchClause();
		let catchOpen: OpenEdge[] = [];
		if (catchClause) {
			const catchParam = catchClause.getVariableDeclaration()?.getName() ?? 'error';
			catchOpen = this.visit(catchClause.getBlock(), [{
				from: decisionNode,
				kind: StateTransitionKind.Catch,
				rawConditionText: catchParam,
			}], hasSetterAhead);
		}

		const finallyBlock = statement.getFinallyBlock();
		let finalOpen: OpenEdge[];
		if (finallyBlock) {
			const toFinally = [...tryOpen, ...catchOpen];
			const finallyIncoming = toFinally.length ? toFinally : [{ from: decisionNode, kind: StateTransitionKind.Finally }];
			finalOpen = this.visit(finallyBlock, finallyIncoming, hasSetterAhead);
		}
		else {
			finalOpen = [...tryOpen, ...catchOpen];
		}

		if (!finalOpen.length)
			return [];

		if (finalOpen.length == 1)
			return finalOpen;

		const mergeNode = this.appendFlowNode('merge', statement);
		this.connect(mergeNode, finalOpen);
		return [{ from: mergeNode, kind: StateTransitionKind.Normal }];
	}

	// TODO Later add loops and switch when time comes...

	visit(what: Statement | Block, incoming: OpenEdge[], hasSetterAhead = false) {
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
				current = this.visit(statements[i], current, hasSetterAfter[i]);
				if (!current.length)
					return current;
			}
			return current;
		}

		if (Node.isIfStatement(what))
			return this.visitIf(what, incoming, hasSetterAhead);

		if (Node.isTryStatement(what))
			return this.visitTry(what, incoming, hasSetterAhead);

		if (Node.isReturnStatement(what))
			return this.visitReturn(what, incoming);

		if (Node.isThrowStatement(what))
			return this.visitEnd(what, incoming, 'throw');

		const setterCalls = getAllCalls(what, this.stateVariable.setterName) as CallExpression[];
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
		const currNode = finalOpen.length == 1 ? finalOpen[0].from : undefined;
		const exitNode = this.appendFlowNode('exit', body, undefined, currNode?.kind == 'merge' ? currNode : undefined);
		if (currNode != exitNode)
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