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
} from '../types';
import { codePosStr, createId, getAllCalls, getCodePos, getFuncName, normText } from './utils';
import { truncate } from '../../utils';
import { classifyStateUpdateKind } from './state-mutators';

export function createFlowNode(kind: ControlFlowNodeKind, sourceFile: SourceFile, node: Node, label?: string): ControlFlowNode {
	const pos = getCodePos(sourceFile, node);
	return {
		id: createId('flow', `${label ?? ''}:${kind}`, pos),
		nodeType: StateGraphNodeType.ControlFlow,
		kind,
		label,
		pos,
	};
}

export function createTransition(from: StateGraphNode, to: StateGraphNode, kind: StateTransitionKind, rawConditionText?: string): StateTransition {
	const label = rawConditionText ? `[${kind}] ${truncate(rawConditionText, 60)}` : kind;
	return {
		id: createId('transition', `${from.id}->${to.id}:${kind}`, from.pos),
		fromNodeId: from.id,
		toNodeId: to.id,
		kind,
		label,
		rawConditionText,
	};
}

export function createOccurrenceUpdateNode(call: CallExpression, stateVariable: StateVariable, sourceFile: SourceFile): StateUpdate {
	const pos = getCodePos(sourceFile, call);
	const arg = call.getArguments()[0];
	const expressionText = arg ? normText(arg) : undefined;
	const kind = classifyStateUpdateKind(arg);

	return {
		id: createId('update-occ', `${stateVariable.name}:${kind}`, pos),
		nodeType: StateGraphNodeType.StateUpdate,
		stateVariableId: stateVariable.id,
		setterName: stateVariable.setterName,
		kind,
		pos,
		expressionText,
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
		private readonly sourceFile: SourceFile,
		private readonly stateVariable: StateVariable,
		private readonly mutator: StateMutatingFunction,
		private readonly nodes: StateGraphNode[],
		private readonly transitions: StateTransition[],
		
	) {
		for (const node of nodes) {
			if (node.nodeType != StateGraphNodeType.StateUpdate || node.stateVariableId != stateVariable.id)
				continue;
			this.updateNodesByPos.set(codePosStr(node.pos), node);
		}
	}

	private connect(to: StateGraphNode, edges: OpenEdge[]) {
		for (const edge of edges)
			this.transitions.push(createTransition(edge.from, to, edge.kind, edge.rawConditionText));
	}

	private appendFlowNode(kind: ControlFlowNodeKind, node: Node, label?: string) {
		const flowNode = createFlowNode(kind, this.sourceFile, node, label);
		this.nodes.push(flowNode);
		return flowNode;
	}

	private appendUpdateNode(call: CallExpression) {
		const pos = getCodePos(this.sourceFile, call);
		const key = codePosStr(pos);

		const existing = this.updateNodesByPos.get(key);
		if (existing)
			return existing;

		const created = createOccurrenceUpdateNode(call, this.stateVariable, this.sourceFile);
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

		const exitNode = this.appendFlowNode(ControlFlowNodeKind.Exit, statement, 'return');
		this.connect(exitNode, current);
		return [];
	}

	visitThrow(statement: ThrowStatement, incoming: OpenEdge[]) {
		const throwText = statement.getExpression().getText();
		const exitNode = this.appendFlowNode(ControlFlowNodeKind.Exit, statement, `throw ${truncate(throwText, 40)}`);
		this.connect(exitNode, incoming);
		return [];
	}

	visitIf(statement: IfStatement, incoming: OpenEdge[]) {
		const conditionText = statement.getExpression().getText();
		const decisionNode = this.appendFlowNode(ControlFlowNodeKind.Decision, statement, truncate(conditionText, 80));
		this.connect(decisionNode, incoming);

		const thenIncoming: OpenEdge[] = [{ from: decisionNode, kind: StateTransitionKind.Then, rawConditionText: conditionText }];
		const thenBody = statement.getThenStatement();
		const thenOpen = Node.isBlock(thenBody)
			? this.visitBlock(thenBody, thenIncoming)
			: this.visitStatement(thenBody as Statement, thenIncoming);

		const elseIncoming: OpenEdge[] = [{ from: decisionNode, kind: StateTransitionKind.Else, rawConditionText: `!(${conditionText})` }];
		const elseBody = statement.getElseStatement();
		const elseOpen = !elseBody
			? elseIncoming
			: Node.isIfStatement(elseBody)
				? this.visitIf(elseBody, elseIncoming)
				: Node.isBlock(elseBody)
					? this.visitBlock(elseBody, elseIncoming)
					: this.visitStatement(elseBody as Statement, elseIncoming);

		const allOpen = [...thenOpen, ...elseOpen];
		if (!allOpen.length)
			return [];

		const mergeNode = this.appendFlowNode(ControlFlowNodeKind.Merge, statement);
		this.connect(mergeNode, allOpen);
		return [{ from: mergeNode, kind: StateTransitionKind.Normal }];
	}

	visitTry(statement: TryStatement, incoming: OpenEdge[]) {
		const decisionNode = this.appendFlowNode(ControlFlowNodeKind.Decision, statement, 'try');
		this.connect(decisionNode, incoming);

		const tryOpen = this.visitBlock(statement.getTryBlock(), [{ from: decisionNode, kind: StateTransitionKind.Normal }]);

		const catchClause = statement.getCatchClause();
		let catchOpen: OpenEdge[] = [];
		if (catchClause) {
			const catchParam = catchClause.getVariableDeclaration()?.getName() ?? 'error';
			catchOpen = this.visitBlock(catchClause.getBlock(), [{
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
			finalOpen = this.visitBlock(finallyBlock, finallyIncoming);
		}
		else {
			finalOpen = [...tryOpen, ...catchOpen];
		}

		if (!finalOpen.length)
			return [];

		const mergeNode = this.appendFlowNode(ControlFlowNodeKind.Merge, statement);
		this.connect(mergeNode, finalOpen);
		return [{ from: mergeNode, kind: StateTransitionKind.Normal }];
	}

	visitStatement(statement: Statement, incoming: OpenEdge[]) {
		if (Node.isIfStatement(statement))
			return this.visitIf(statement, incoming);

		if (Node.isTryStatement(statement))
			return this.visitTry(statement, incoming);

		if (Node.isReturnStatement(statement))
			return this.visitReturn(statement, incoming);

		if (Node.isThrowStatement(statement))
			return this.visitThrow(statement, incoming);

		let current = incoming;
		const setterCalls = getAllCalls(statement, this.stateVariable.setterName);
		for (const call of setterCalls) {
			const updateNode = this.appendUpdateNode(call);
			this.connect(updateNode, current);
			current = [{ from: updateNode, kind: StateTransitionKind.Normal }];
		}

		return current;
	}

	visitBlock(block: Block, incoming: OpenEdge[]) {
		let current = incoming;
		for (const statement of block.getStatements()) {
			current = this.visitStatement(statement, current);
			if (!current.length)
				return current;
		}
		return current;
	}

	build(body: Block) {
		const entryNode = this.appendFlowNode(ControlFlowNodeKind.Entry, body, this.mutator.name);
		const finalOpen = this.visitBlock(body, [{ from: entryNode, kind: StateTransitionKind.Normal }]);
		if (!finalOpen.length)
			return;

		const exitNode = this.appendFlowNode(ControlFlowNodeKind.Exit, body, 'return');
		this.connect(exitNode, finalOpen);
	}
}

export function buildTransitionFlowGraph(sourceFile: SourceFile, mutatorBodies: Map<Id, Block>, stateVariables: StateVariable[]) {
	for (const stateVariable of stateVariables) {
		const mutators = [...(stateVariable.mutators ?? []), ...(stateVariable.inlineMutator ? [stateVariable.inlineMutator] : [])]; // remember obj instances are shared
		for (const mutator of mutators) {
			const body = mutatorBodies.get(mutator.id);
			if (!body)
				continue;

			mutator.nodes = mutator.nodes.filter(({nodeType}) => nodeType == StateGraphNodeType.StateUpdate);
			mutator.transitions = [];

			const builder = new GraphBuilder(
				sourceFile,
				stateVariable,
				mutator,
				mutator.nodes,
				mutator.transitions
			);

			builder.build(body);
		}
	}
}