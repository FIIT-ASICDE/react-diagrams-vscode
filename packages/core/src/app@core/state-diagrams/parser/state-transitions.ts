import {
	Block,
	CallExpression,
	IfStatement,
	Node,
	ReturnStatement,
	SourceFile,
	SyntaxKind,
	ThrowStatement,
	TryStatement,
	VariableDeclaration,
} from 'ts-morph';
import {
	ControlFlowNode,
	ControlFlowNodeKind,
	StateDiagram,
	StateMutatingFunction,
	StateGraphNode,
	StateTransition,
	StateTransitionKind,
	StateUpdate,
	StateUpdateKind,
	StateVariable,
} from '../types';
import { createId, getCodePos, getFuncName, normText } from './utils';
import { truncate } from '../../utils';
import { collectStateVariables } from './state-variables';
import { classifyStateUpdateKind, populateStateUpdatesAndMutators } from './state-mutators';

export function createFlowNode(kind: ControlFlowNodeKind, sourceFile: SourceFile, node: Node, label?: string): ControlFlowNode {
	const pos = getCodePos(sourceFile, node);
	return {
		id: createId('flow', `${kind}:${label ?? ''}`, pos),
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

/** Returns a per-occurrence StateUpdate graph node for a call expression, creating it if absent. */
function getOrCreateOccurrenceNode(call: CallExpression, stateVariable: StateVariable, sourceFile: SourceFile): StateUpdate {
	const pos = getCodePos(sourceFile, call);
	const arg = call.getArguments()[0];
	const expressionText = arg ? normText(arg) : undefined;
	const kind = classifyStateUpdateKind(arg);
	return {
		id: createId('update-occ', `${stateVariable.name}:${kind}:${pos.line}:${pos.column}`, pos),
		stateVariableId: stateVariable.id,
		setterName: stateVariable.setterName,
		kind,
		pos,
		expressionText,
	};
}

/**
 * Walks the body of function (component or mutating function) and builds
 * the control-flow graph (nodes + transitions) for one specific state variable.
 *
 * Handled constructs: sequential updates, if/else, try/catch/finally, early return/throw.
 */
function buildMutatorGraph(funcBody: Block, sourceFile: SourceFile, stateVariable: StateVariable, mutator: StateMutatingFunction) {
	const nodes = mutator.nodes;
	const transitions = mutator.transitions;

	const entry = createFlowNode('entry', sourceFile, funcBody, mutator.name);
	nodes.push(entry);

	type OpenEdge = { from: StateGraphNode; kind: StateTransitionKind; raw?: string };

	const wire = (to: StateGraphNode, edges: OpenEdge[]) => edges.forEach(e => transitions.push(createTransition(e.from, to, e.kind, e.raw)));

	function visitBlock(block: Block, incoming: OpenEdge[]): OpenEdge[] {
		let current = incoming;

		for (const stmt of block.getStatements()) {
			if (Node.isIfStatement(stmt)) {
				current = visitIf(stmt as IfStatement, current);
			} else if (Node.isTryStatement(stmt)) {
				current = visitTry(stmt as TryStatement, current);
			} else if (Node.isReturnStatement(stmt)) {
				return visitReturn(stmt as ReturnStatement, current);
			} else if (Node.isThrowStatement(stmt)) {
				return visitThrow(stmt as ThrowStatement, current);
			} else { // Collect any setter calls in this statement (covers expression-statement & nested inline cases).
				const calls = stmt.getDescendantsOfKind(SyntaxKind.CallExpression);
				for (const call of calls) {
					if (getFuncName(call) !== stateVariable.setterName)
						continue;
					const updateNode = getOrCreateOccurrenceNode(call, stateVariable, sourceFile);
					nodes.push(updateNode);
					wire(updateNode, current);
					current = [{ from: updateNode, kind: 'normal' }];
				}
			}
		}

		return current;
	}

	function visitIf(stmt: IfStatement, incoming: OpenEdge[]): OpenEdge[] {
		const condText = stmt.getExpression().getText();
		const decision = createFlowNode('decision', sourceFile, stmt, truncate(condText, 80));
		nodes.push(decision);
		wire(decision, incoming);

		// if {}
		const thenBody = stmt.getThenStatement();
		const thenIncoming: OpenEdge[] = [{ from: decision, kind: 'then', raw: condText }];
		const thenOpen = Node.isBlock(thenBody) ? visitBlock(thenBody, thenIncoming) : visitBlock(thenBody as unknown as Block, thenIncoming);

		// else (optional)
		const elseBody = stmt.getElseStatement();
		const elseIncoming: OpenEdge[] = [{ from: decision, kind: 'else', raw: `!(${condText})` }];
		let elseOpen: OpenEdge[];
		if (elseBody) {
			elseOpen = Node.isBlock(elseBody) ? visitBlock(elseBody, elseIncoming) : visitIf(elseBody as IfStatement, elseIncoming);
		} else {
			elseOpen = elseIncoming; // fall through from decision via the implicit else edge.
		}

		const allOpen = [...thenOpen, ...elseOpen];
		if (allOpen.length > 0) { // Only create a merge node when there are actual dangling edges (i.e. no early terminations consumed both branches).
			const merge = createFlowNode('merge', sourceFile, stmt);
			nodes.push(merge);
			wire(merge, allOpen);
			return [{ from: merge, kind: 'normal' }];
		}

		return [];
	}

	function visitTry(stmt: TryStatement, incoming: OpenEdge[]): OpenEdge[] {
		const decision = createFlowNode('decision', sourceFile, stmt, 'try');
		nodes.push(decision);
		wire(decision, incoming);

		// try
		const tryOpen = visitBlock(stmt.getTryBlock(), [{ from: decision, kind: 'normal' }]);

		// catch
		let catchOpen: OpenEdge[] = [];
		const catchClause = stmt.getCatchClause();
		if (catchClause) {
			const catchParam = catchClause.getVariableDeclaration()?.getName() ?? 'error';
			catchOpen = visitBlock(catchClause.getBlock(), [{ from: decision, kind: 'catch', raw: catchParam }]);
		}

		// finally
		let finallyOpen: OpenEdge[] = [];
		const finallyBlock = stmt.getFinallyBlock();
		if (finallyBlock) { // Finally receives edges from both try and catch exits.
			const toFinally = [...tryOpen, ...catchOpen];
			const finallyIncoming = toFinally.length > 0 ? toFinally : [{ from: decision, kind: 'finally' as StateTransitionKind }];
			finallyOpen = visitBlock(finallyBlock, finallyIncoming);
		}

		const allOpen = finallyBlock ? finallyOpen : [...tryOpen, ...catchOpen];
		if (allOpen.length > 0) {
			const merge = createFlowNode('merge', sourceFile, stmt);
			nodes.push(merge);
			wire(merge, allOpen);
			return [{ from: merge, kind: 'normal' }];
		}

		return [];
	}

	function visitReturn(stmt: ReturnStatement, incoming: OpenEdge[]): OpenEdge[] { // Wire any setter calls in the return expression before the exit.
		const calls = stmt.getDescendantsOfKind(SyntaxKind.CallExpression);
		let current = incoming;
		for (const call of calls) {
			if (getFuncName(call) !== stateVariable.setterName)
				continue;
			const updateNode = getOrCreateOccurrenceNode(call, stateVariable, sourceFile);
			nodes.push(updateNode);
			wire(updateNode, current);
			current = [{ from: updateNode, kind: 'normal' }];
		}

		const exitNode = createFlowNode('exit', sourceFile, stmt, 'return');
		nodes.push(exitNode);
		wire(exitNode, current);
		return []; // Terminates
	}

	function visitThrow(stmt: ThrowStatement, incoming: OpenEdge[]): OpenEdge[] {
		const throwText = stmt.getExpression().getText();
		const exitNode = createFlowNode('exit', sourceFile, stmt, `throw ${truncate(throwText, 40)}`);
		nodes.push(exitNode);
		wire(exitNode, incoming);
		return []; // Terminates.
	}

	const finalEdges = visitBlock(funcBody, [{ from: entry, kind: 'normal' }]); // Start traversal
	if (finalEdges.length > 0) { // Connect remaining 
		const exitNode = createFlowNode('exit', sourceFile, funcBody, 'return');
		nodes.push(exitNode);
		wire(exitNode, finalEdges);
	}
}

export function buildTransitionFlowGraph(sourceFile: SourceFile, mutatorBodies: Map<string, Block>, stateVariables: StateVariable[]) {
	for (const stateVariable of stateVariables) {
		const allMutators = [ ...(stateVariable.mutators ?? []), ...(stateVariable.inlineMutator ? [stateVariable.inlineMutator] : [])];
		for (const mutator of allMutators) {
			const body = mutatorBodies.get(mutator.id);
			if (body)
				buildMutatorGraph(body, sourceFile, stateVariable, mutator);
		}
	}
}