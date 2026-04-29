import type { Edge, Node } from '@xyflow/react';
import { isLoopConstruct, isTerminatorConstruct } from '../shared/construct';

type AnyNodeData = {
	label?: unknown;
	sourceText?: unknown;
	construct?: unknown;
	loopLabel?: unknown;
	loopKind?: unknown;
	forHeader?: unknown;
	forOfBinding?: unknown;
	forEachIterable?: unknown;
	forEachCallee?: unknown;
	forEachParams?: unknown;
};

export type DiagramStructureIssueSeverity = 'error' | 'warning';

export type DiagramStructureIssue = {
	severity: DiagramStructureIssueSeverity;
	nodeId?: string;
	edgeId?: string;
	message: string;
};

export class DiagramStructureError extends Error {
	constructor(public readonly issues: DiagramStructureIssue[]) {
		super(formatDiagramStructureIssues(issues));
		this.name = 'DiagramStructureError';
	}
}

type EdgeGroups = {
	incoming: Map<string, Edge[]>;
	outgoing: Map<string, Edge[]>;
	forwardIncoming: Map<string, Edge[]>;
	forwardOutgoing: Map<string, Edge[]>;
	backIncoming: Map<string, Edge[]>;
	backOutgoing: Map<string, Edge[]>;
};

const DECISION_BRANCH_LABELS = new Set<string>([
	'yes',
	'no',
	'true',
	'false',
]);

const LOOP_BODY_LABELS = new Set<string>([
	'yes',
	'true',
	'each',
	'body',
	'next',
]);

const LOOP_EXIT_LABELS = new Set<string>([
	'no',
	'false',
	'done',
	'exit',
]);

const TRY_BODY_LABELS = new Set<string>([
	'',
	'try',
	'body',
	'next',
]);

const TRY_EXCEPTION_LABELS = new Set<string>([
	'exception',
	'catch',
	'error',
]);

const TRY_FINALLY_LABELS = new Set<string>([
	'finally',
]);

const SWITCH_POST_LABELS = new Set<string>([
	'',
	'next',
	'done',
	'exit',
]);

const DO_WHILE_REPEAT_LABELS = new Set<string>([
	'yes',
	'true',
	'body',
	'next',
]);

const DO_WHILE_EXIT_LABELS = new Set<string>([
	'no',
	'false',
	'done',
	'exit',
]);

function getData(node: Node): AnyNodeData {
	return (node.data as AnyNodeData | undefined) ?? {};
}

function getStr(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

function getConstruct(node: Node): string {
	return getStr(getData(node).construct).trim();
}

function normalizeLabel(label: unknown): string {
	if (label === undefined || label === null) return '';
	return String(label).trim().toLowerCase();
}

function isBackEdge(edge: Edge): boolean {
	return edge.type === 'back';
}

function isInitialNode(node: Node): boolean {
	return node.type === 'initial' || node.type === 'start';
}

function isEndNode(node: Node): boolean {
	return node.type === 'end';
}

function isMergeNode(node: Node): boolean {
	return node.type === 'merge';
}

function isActionLikeNode(node: Node): boolean {
	return node.type === 'action' || node.type === 'expandable';
}

function isDecisionLikeNode(node: Node): boolean {
	return node.type === 'decision';
}

function isLoopNode(node: Node): boolean {
	const construct = getConstruct(node);
	return node.type === 'loop' || isLoopConstruct(construct);
}

function isDoWhileNode(node: Node): boolean {
	const construct = getConstruct(node) || getStr(getData(node).loopKind);
	return construct === 'do-while';
}

function isSwitchNode(node: Node): boolean {
	return getConstruct(node) === 'switch';
}

function isTryNode(node: Node): boolean {
	// Legacy compatibility: new diagrams encode try structurally on edges.
	// Old saved diagrams may still carry construct:'try' on a decision node.
	return getConstruct(node) === 'try';
}

function hasIncomingTryEdge(nodeId: string, groups: EdgeGroups): boolean {
	const incoming = list(groups.forwardIncoming, nodeId);
	return incoming.some((edge) => normalizeLabel(edge.label) === 'try');
}

function isIfNode(node: Node): boolean {
	const construct = getConstruct(node);
	return node.type === 'decision' && (!construct || construct === 'if');
}

function isTerminatorNode(node: Node): boolean {
	const construct = getConstruct(node);
	if (isTerminatorConstruct(construct)) return true;

	const sourceText = getStr(getData(node).sourceText).trim();
	const label = getStr(getData(node).label).trim();
	const text = sourceText || label;

	return /^(return|throw|break|continue)\b/.test(text);
}

function isReturnLikeNode(node: Node): boolean {
	const construct = getConstruct(node);
	if (construct === 'return' || construct === 'throw') return true;

	const sourceText = getStr(getData(node).sourceText).trim();
	const label = getStr(getData(node).label).trim();
	const text = sourceText || label;

	return /^(return|throw)\b/.test(text);
}

function isBreakLikeNode(node: Node): boolean {
	const construct = getConstruct(node);
	if (construct === 'break') return true;

	const sourceText = getStr(getData(node).sourceText).trim();
	const label = getStr(getData(node).label).trim();
	const text = sourceText || label;

	return /^break\b/.test(text);
}

function isContinueLikeNode(node: Node): boolean {
	const construct = getConstruct(node);
	if (construct === 'continue') return true;

	const sourceText = getStr(getData(node).sourceText).trim();
	const label = getStr(getData(node).label).trim();
	const text = sourceText || label;

	return /^continue\b/.test(text);
}

function isSwitchCaseLabel(label: unknown): boolean {
	const normalized = normalizeLabel(label);
	if (!normalized) return false;

	return (
		normalized === 'default' ||
		normalized === 'default:' ||
		normalized.startsWith('case ')
	);
}

function groupEdges(nodes: Node[], edges: Edge[]): EdgeGroups {
	const incoming = new Map<string, Edge[]>();
	const outgoing = new Map<string, Edge[]>();
	const forwardIncoming = new Map<string, Edge[]>();
	const forwardOutgoing = new Map<string, Edge[]>();
	const backIncoming = new Map<string, Edge[]>();
	const backOutgoing = new Map<string, Edge[]>();

	for (const node of nodes) {
		const id = String(node.id);
		incoming.set(id, []);
		outgoing.set(id, []);
		forwardIncoming.set(id, []);
		forwardOutgoing.set(id, []);
		backIncoming.set(id, []);
		backOutgoing.set(id, []);
	}

	for (const edge of edges) {
		const source = String(edge.source);
		const target = String(edge.target);

		outgoing.get(source)?.push(edge);
		incoming.get(target)?.push(edge);

		if (isBackEdge(edge)) {
			backOutgoing.get(source)?.push(edge);
			backIncoming.get(target)?.push(edge);
		} else {
			forwardOutgoing.get(source)?.push(edge);
			forwardIncoming.get(target)?.push(edge);
		}
	}

	return {
		incoming,
		outgoing,
		forwardIncoming,
		forwardOutgoing,
		backIncoming,
		backOutgoing,
	};
}

function addIssue(
	issues: DiagramStructureIssue[],
	severity: DiagramStructureIssueSeverity,
	message: string,
	meta?: { nodeId?: string; edgeId?: string },
): void {
	issues.push({
		severity,
		message,
		...meta,
	});
}

function count(map: Map<string, Edge[]>, id: string): number {
	return map.get(id)?.length ?? 0;
}

function list(map: Map<string, Edge[]>, id: string): Edge[] {
	return map.get(id) ?? [];
}

function hasEdgeToNodeType(
	edges: Edge[],
	nodesById: Map<string, Node>,
	type: string,
): boolean {
	return edges.some((edge) => nodesById.get(String(edge.target))?.type === type);
}

function validateGraphBasics(
	nodes: Node[],
	edges: Edge[],
	issues: DiagramStructureIssue[],
): void {
	const nodeIds = new Set<string>();
	const edgeIds = new Set<string>();

	for (const node of nodes) {
		const id = String(node.id);

		if (!id) {
			addIssue(issues, 'error', 'Node has empty id.');
			continue;
		}

		if (nodeIds.has(id)) {
			addIssue(issues, 'error', `Duplicate node id "${id}".`, { nodeId: id });
		}

		nodeIds.add(id);
	}

	for (const edge of edges) {
		const id = String(edge.id);

		if (!id) {
			addIssue(issues, 'error', 'Edge has empty id.');
		} else if (edgeIds.has(id)) {
			addIssue(issues, 'error', `Duplicate edge id "${id}".`, { edgeId: id });
		}

		edgeIds.add(id);

		const source = String(edge.source);
		const target = String(edge.target);

		if (!nodeIds.has(source)) {
			addIssue(
				issues,
				'error',
				`Edge "${id}" references missing source node "${source}".`,
				{ edgeId: id },
			);
		}

		if (!nodeIds.has(target)) {
			addIssue(
				issues,
				'error',
				`Edge "${id}" references missing target node "${target}".`,
				{ edgeId: id },
			);
		}

		if (source === target) {
			addIssue(
				issues,
				'warning',
				`Edge "${id}" is a self-edge. Prefer an explicit back edge to a loop node.`,
				{ edgeId: id, nodeId: source },
			);
		}
	}

	const initialNodes = nodes.filter(isInitialNode);

	if (initialNodes.length === 0) {
		addIssue(issues, 'error', 'Diagram must contain one initial/start node.');
	}

	if (initialNodes.length > 1) {
		addIssue(
			issues,
			'error',
			`Diagram must contain exactly one initial/start node, found ${initialNodes.length}.`,
		);
	}

	const endNodes = nodes.filter(isEndNode);

	if (endNodes.length === 0) {
		addIssue(
			issues,
			'warning',
			'Diagram has no end node. This is allowed for partial diagrams, but generated control flow may be incomplete.',
		);
	}
}

function validateInitialNode(
	node: Node,
	groups: EdgeGroups,
	issues: DiagramStructureIssue[],
): void {
	const id = String(node.id);

	if (count(groups.incoming, id) !== 0) {
		addIssue(
			issues,
			'error',
			'Initial/start node must not have incoming edges.',
			{ nodeId: id },
		);
	}

	if (count(groups.outgoing, id) !== 1) {
		addIssue(
			issues,
			'error',
			`Initial/start node must have exactly one outgoing edge, found ${count(groups.outgoing, id)}.`,
			{ nodeId: id },
		);
	}

	if (count(groups.backOutgoing, id) > 0) {
		addIssue(
			issues,
			'error',
			'Initial/start node must not have back edges.',
			{ nodeId: id },
		);
	}
}

function validateEndNode(
	node: Node,
	groups: EdgeGroups,
	issues: DiagramStructureIssue[],
): void {
	const id = String(node.id);

	if (count(groups.outgoing, id) !== 0) {
		addIssue(
			issues,
			'error',
			`End node must not have outgoing edges, found ${count(groups.outgoing, id)}.`,
			{ nodeId: id },
		);
	}

	if (count(groups.incoming, id) === 0) {
		addIssue(
			issues,
			'warning',
			'End node has no incoming edge.',
			{ nodeId: id },
		);
	}
}

function validateActionNode(
	node: Node,
	groups: EdgeGroups,
	nodesById: Map<string, Node>,
	issues: DiagramStructureIssue[],
): void {
	const id = String(node.id);
	const incoming = count(groups.incoming, id);
	const outgoing = count(groups.outgoing, id);

	if (incoming < 1) {
		addIssue(
			issues,
			'error',
			`Action node must have at least one incoming edge, found ${incoming}.`,
			{ nodeId: id },
		);
	}

	if (outgoing !== 1) {
		addIssue(
			issues,
			'error',
			`Action node must have exactly one outgoing edge, found ${outgoing}.`,
			{ nodeId: id },
		);
	}

	if (isReturnLikeNode(node)) {
		const outgoingEdges = list(groups.outgoing, id);

		if (!hasEdgeToNodeType(outgoingEdges, nodesById, 'end')) {
			addIssue(
				issues,
				'warning',
				'Return/throw node should point to an end node.',
				{ nodeId: id },
			);
		}
	}

	if (isBreakLikeNode(node)) {
		const outgoingEdges = list(groups.outgoing, id);

		if (hasEdgeToNodeType(outgoingEdges, nodesById, 'end')) {
			addIssue(
				issues,
				'error',
				'Break node must not point directly to an end node. It should exit to the nearest loop/switch merge.',
				{ nodeId: id },
			);
		}
	}

	if (isContinueLikeNode(node)) {
		const outgoingEdges = list(groups.outgoing, id);

		if (hasEdgeToNodeType(outgoingEdges, nodesById, 'end')) {
			addIssue(
				issues,
				'error',
				'Continue node must not point directly to an end node. It should point back to a loop or to the labelled loop target.',
				{ nodeId: id },
			);
		}

		const hasBackEdge = outgoingEdges.some(isBackEdge);

		if (!hasBackEdge) {
			addIssue(
				issues,
				'warning',
				'Continue node usually should have a back edge to a loop node.',
				{ nodeId: id },
			);
		}
	}
}

function validateDoWhileNode(
	node: Node,
	groups: EdgeGroups,
	issues: DiagramStructureIssue[],
): void {
	const id = String(node.id);

	// Correct do-while shape:
	//
	// body entry -> ...body exits... -> condition node
	// condition --yes/back--> body entry
	// condition --no/forward--> post-loop continuation

	const incoming = count(groups.incoming, id);
	const forwardIncoming = count(groups.forwardIncoming, id);
	const backIncoming = count(groups.backIncoming, id);

	const forwardOutgoing = list(groups.forwardOutgoing, id);
	const backOutgoing = list(groups.backOutgoing, id);

	if (incoming < 1) {
		addIssue(
			issues,
			'error',
			'do-while condition node must have at least one incoming edge from the body.',
			{ nodeId: id },
		);
	}

	if (forwardIncoming < 1) {
		addIssue(
			issues,
			'warning',
			'do-while condition node should have at least one forward incoming edge from the body fallthrough.',
			{ nodeId: id },
		);
	}

	const repeatEdges = backOutgoing.filter((edge) =>
		DO_WHILE_REPEAT_LABELS.has(normalizeLabel(edge.label)),
	);

	const exitEdges = forwardOutgoing.filter((edge) =>
		DO_WHILE_EXIT_LABELS.has(normalizeLabel(edge.label)),
	);

	if (repeatEdges.length !== 1) {
		addIssue(
			issues,
			'error',
			`do-while condition node must have exactly one back repeat edge labelled yes/true/body/next to the body entry, found ${repeatEdges.length}.`,
			{ nodeId: id },
		);
	}

	if (exitEdges.length !== 1) {
		addIssue(
			issues,
			'error',
			`do-while condition node must have exactly one forward exit edge labelled no/false/done/exit, found ${exitEdges.length}.`,
			{ nodeId: id },
		);
	}

	for (const edge of backOutgoing) {
		const label = normalizeLabel(edge.label);

		if (!DO_WHILE_REPEAT_LABELS.has(label)) {
			addIssue(
				issues,
				'warning',
				`do-while condition has unusual back edge label "${String(edge.label ?? '')}". Expected yes/true/body/next.`,
				{ nodeId: id, edgeId: String(edge.id) },
			);
		}
	}

	for (const edge of forwardOutgoing) {
		const label = normalizeLabel(edge.label);

		if (!DO_WHILE_EXIT_LABELS.has(label)) {
			addIssue(
				issues,
				'warning',
				`do-while condition has unusual forward edge label "${String(edge.label ?? '')}". Expected no/false/done/exit.`,
				{ nodeId: id, edgeId: String(edge.id) },
			);
		}
	}

	if (backIncoming > 0) {
		addIssue(
			issues,
			'warning',
			'do-while condition node has incoming back edges. Continue edges may target the condition, but normal body fallthrough should be a forward incoming edge.',
			{ nodeId: id },
		);
	}
}

function validateMergeNode(
	node: Node,
	groups: EdgeGroups,
	issues: DiagramStructureIssue[],
): void {
	const id = String(node.id);
	const incoming = count(groups.incoming, id);
	const outgoing = count(groups.outgoing, id);

	if (incoming < 2) {
		addIssue(
			issues,
			'warning',
			`Merge node should usually have at least two incoming edges, found ${incoming}.`,
			{ nodeId: id },
		);
	}

	if (outgoing > 1) {
		addIssue(
			issues,
			'error',
			`Merge node must have at most one outgoing edge, found ${outgoing}.`,
			{ nodeId: id },
		);
	}
}

function validateIfNode(
	node: Node,
	groups: EdgeGroups,
	issues: DiagramStructureIssue[],
): void {
	const id = String(node.id);
	const incoming = count(groups.incoming, id);
	const outgoing = list(groups.outgoing, id);

	if (incoming < 1) {
		addIssue(
			issues,
			'error',
			'If decision must have at least one incoming edge.',
			{ nodeId: id },
		);
	}

	if (outgoing.length !== 2) {
		addIssue(
			issues,
			'error',
			`If decision must have exactly two outgoing forward edges, found ${outgoing.length}.`,
			{ nodeId: id },
		);
		return;
	}

	const labels = outgoing.map((edge) => normalizeLabel(edge.label));
	const hasYes = labels.some((label) => label === 'yes' || label === 'true');
	const hasNo = labels.some((label) => label === 'no' || label === 'false');

	if (!hasYes || !hasNo) {
		addIssue(
			issues,
			'error',
			'If decision must have one yes/true edge and one no/false edge.',
			{ nodeId: id },
		);
	}

	for (const edge of outgoing) {
		const label = normalizeLabel(edge.label);

		if (!DECISION_BRANCH_LABELS.has(label)) {
			addIssue(
				issues,
				'warning',
				`If decision has unusual edge label "${String(edge.label ?? '')}". Expected yes/no or true/false.`,
				{ nodeId: id, edgeId: String(edge.id) },
			);
		}
	}
}

function validateLoopNode(
	node: Node,
	groups: EdgeGroups,
	issues: DiagramStructureIssue[],
): void {
	const id = String(node.id);
	const construct = getConstruct(node) || getStr(getData(node).loopKind) || 'while';

	if (construct === 'do-while') {
		validateDoWhileNode(node, groups, issues);
		return;
	}

	const incoming = count(groups.incoming, id);
	const outgoing = list(groups.forwardOutgoing, id);

	if (incoming < 1) {
		addIssue(
			issues,
			'error',
			`${construct} loop must have at least one incoming edge.`,
			{ nodeId: id },
		);
	}

	if (outgoing.length < 1) {
		addIssue(
			issues,
			'error',
			`${construct} loop must have outgoing edges.`,
			{ nodeId: id },
		);
		return;
	}

	const bodyEdges = outgoing.filter((edge) =>
		LOOP_BODY_LABELS.has(normalizeLabel(edge.label)),
	);

	const exitEdges = outgoing.filter((edge) =>
		LOOP_EXIT_LABELS.has(normalizeLabel(edge.label)),
	);

	if (bodyEdges.length !== 1) {
		addIssue(
			issues,
			'error',
			`${construct} loop must have exactly one body edge labelled yes/true/each/body/next, found ${bodyEdges.length}.`,
			{ nodeId: id },
		);
	}

	if (exitEdges.length !== 1) {
		addIssue(
			issues,
			'error',
			`${construct} loop must have exactly one exit edge labelled no/false/done/exit, found ${exitEdges.length}.`,
			{ nodeId: id },
		);
	}

	const backIncoming = count(groups.backIncoming, id);

	if (backIncoming === 0 && construct !== 'foreach') {
		addIssue(
			issues,
			'warning',
			`${construct} loop has no incoming back edge. This can be valid for partial diagrams, but usually loop body should cycle back to the loop node.`,
			{ nodeId: id },
		);
	}
}

function validateSwitchNode(
	node: Node,
	groups: EdgeGroups,
	issues: DiagramStructureIssue[],
): void {
	const id = String(node.id);
	const incoming = count(groups.incoming, id);

	if (incoming < 1) {
		addIssue(
			issues,
			'error',
			'Switch decision must have at least one incoming edge.',
			{ nodeId: id },
		);
	}

	const outgoing = list(groups.forwardOutgoing, id);

	const caseEdges = outgoing.filter((edge) => isSwitchCaseLabel(edge.label));
	const postSwitchEdges = outgoing.filter((edge) =>
		SWITCH_POST_LABELS.has(normalizeLabel(edge.label)) &&
		!isSwitchCaseLabel(edge.label),
	);

	if (caseEdges.length === 0) {
		addIssue(
			issues,
			'error',
			'Switch decision must have at least one case/default outgoing edge.',
			{ nodeId: id },
		);
	}

	const defaultEdges = caseEdges.filter((edge) => {
		const label = normalizeLabel(edge.label);
		return label === 'default' || label === 'default:';
	});

	if (defaultEdges.length > 1) {
		addIssue(
			issues,
			'error',
			`Switch decision must have at most one default edge, found ${defaultEdges.length}.`,
			{ nodeId: id },
		);
	}

	if (postSwitchEdges.length > 1) {
		addIssue(
			issues,
			'error',
			`Switch decision must have at most one unlabeled post-switch marker edge, found ${postSwitchEdges.length}.`,
			{ nodeId: id },
		);
	}

	for (const edge of outgoing) {
		const label = normalizeLabel(edge.label);

		if (!isSwitchCaseLabel(edge.label) && !SWITCH_POST_LABELS.has(label)) {
			addIssue(
				issues,
				'warning',
				`Switch decision has unusual outgoing edge label "${String(edge.label ?? '')}". Expected case/default or an unlabeled post-switch marker.`,
				{ nodeId: id, edgeId: String(edge.id) },
			);
		}
	}
}

function validateTryNode(
	node: Node,
	groups: EdgeGroups,
	issues: DiagramStructureIssue[],
): void {
	const id = String(node.id);
	const incoming = count(groups.incoming, id);

	if (incoming < 1) {
		addIssue(
			issues,
			'error',
			'[Legacy] Try node must have at least one incoming edge.',
			{ nodeId: id },
		);
	}

	const outgoing = list(groups.forwardOutgoing, id);

	const bodyEdges = outgoing.filter((edge) =>
		TRY_BODY_LABELS.has(normalizeLabel(edge.label)),
	);

	const exceptionEdges = outgoing.filter((edge) =>
		TRY_EXCEPTION_LABELS.has(normalizeLabel(edge.label)),
	);

	const finallyEdges = outgoing.filter((edge) =>
		TRY_FINALLY_LABELS.has(normalizeLabel(edge.label)),
	);

	if (bodyEdges.length !== 1) {
		addIssue(
			issues,
			'error',
			`[Legacy] Try node must have exactly one try-body edge, found ${bodyEdges.length}.`,
			{ nodeId: id },
		);
	}

	if (exceptionEdges.length > 1) {
		addIssue(
			issues,
			'error',
			`[Legacy] Try node must have at most one exception/catch edge, found ${exceptionEdges.length}.`,
			{ nodeId: id },
		);
	}

	if (finallyEdges.length > 1) {
		addIssue(
			issues,
			'error',
			`[Legacy] Try node must have at most one finally edge, found ${finallyEdges.length}.`,
			{ nodeId: id },
		);
	}

	for (const edge of outgoing) {
		const label = normalizeLabel(edge.label);

		if (
			!TRY_BODY_LABELS.has(label) &&
			!TRY_EXCEPTION_LABELS.has(label) &&
			!TRY_FINALLY_LABELS.has(label)
		) {
			addIssue(
				issues,
				'warning',
				`[Legacy] Try node has unusual outgoing edge label "${String(edge.label ?? '')}". Expected try/body, exception/catch/error, or finally.`,
				{ nodeId: id, edgeId: String(edge.id) },
			);
		}
	}
}

function validateEdgeLabeledTryEntry(
	node: Node,
	groups: EdgeGroups,
	issues: DiagramStructureIssue[],
): void {
	const id = String(node.id);
	const tryIncoming = list(groups.forwardIncoming, id).filter(
		(edge) => normalizeLabel(edge.label).toLowerCase() === 'try'
	);

	if (tryIncoming.length !== 1) {
		addIssue(
			issues,
			'warning',
			`Expected exactly one incoming 'try' edge for try body entry, found ${tryIncoming.length}.`,
			{ nodeId: id },
		);
	}
}

function validateUnknownDecisionNode(
	node: Node,
	groups: EdgeGroups,
	issues: DiagramStructureIssue[],
): void {
	const id = String(node.id);
	const construct = getConstruct(node);

	addIssue(
		issues,
		'warning',
		`Decision node has unknown construct "${construct || '(empty)'}". Validating it as a generic if decision.`,
		{ nodeId: id },
	);

	validateIfNode(node, groups, issues);
}

function validateReachability(
	nodes: Node[],
	edges: Edge[],
	issues: DiagramStructureIssue[],
): void {
	const initial = nodes.find(isInitialNode);
	if (!initial) return;

	const nodeIds = new Set(nodes.map((node) => String(node.id)));
	const outgoingBySource = new Map<string, Edge[]>();

	for (const edge of edges) {
		const source = String(edge.source);
		const list = outgoingBySource.get(source) ?? [];
		list.push(edge);
		outgoingBySource.set(source, list);
	}

	const reachable = new Set<string>();
	const queue: string[] = [String(initial.id)];

	while (queue.length > 0) {
		const id = queue.shift()!;
		if (reachable.has(id)) continue;

		reachable.add(id);

		for (const edge of outgoingBySource.get(id) ?? []) {
			const target = String(edge.target);
			if (nodeIds.has(target)) queue.push(target);
		}
	}

	for (const node of nodes) {
		const id = String(node.id);

		if (!reachable.has(id)) {
			addIssue(
				issues,
				'warning',
				`Node "${id}" is not reachable from the initial/start node.`,
				{ nodeId: id },
			);
		}
	}
}

export function validateDiagramStructure(
	nodes: Node[],
	edges: Edge[],
): DiagramStructureIssue[] {
	const issues: DiagramStructureIssue[] = [];

	validateGraphBasics(nodes, edges, issues);

	const nodesById = new Map(nodes.map((node) => [String(node.id), node]));
	const groups = groupEdges(nodes, edges);

	for (const node of nodes) {
		const id = String(node.id);

		if (isInitialNode(node)) {
			validateInitialNode(node, groups, issues);
			continue;
		}

		if (isEndNode(node)) {
			validateEndNode(node, groups, issues);
			continue;
		}

		if (isMergeNode(node)) {
			validateMergeNode(node, groups, issues);
			continue;
		}

		if (isSwitchNode(node)) {
			validateSwitchNode(node, groups, issues);
			continue;
		}

		if (isTryNode(node)) {
			validateTryNode(node, groups, issues);
			continue;
		}

		if (hasIncomingTryEdge(id, groups)) {
			validateEdgeLabeledTryEntry(node, groups, issues);
		}

		if (isLoopNode(node)) {
			validateLoopNode(node, groups, issues);
			continue;
		}

		if (isIfNode(node)) {
			validateIfNode(node, groups, issues);
			continue;
		}

		if (isDecisionLikeNode(node)) {
			validateUnknownDecisionNode(node, groups, issues);
			continue;
		}

		if (isActionLikeNode(node) || isTerminatorNode(node)) {
			validateActionNode(node, groups, nodesById, issues);
			continue;
		}

		if (count(groups.incoming, id) === 0 && !isInitialNode(node)) {
			addIssue(
				issues,
				'warning',
				`Node type "${String(node.type)}" has no incoming edge.`,
				{ nodeId: id },
			);
		}

		if (count(groups.outgoing, id) === 0 && !isEndNode(node)) {
			addIssue(
				issues,
				'warning',
				`Node type "${String(node.type)}" has no outgoing edge.`,
				{ nodeId: id },
			);
		}
	}

	validateReachability(nodes, edges, issues);

	return issues;
}

export function checkStructure(nodes: Node[], edges: Edge[]): void {
	const issues = validateDiagramStructure(nodes, edges);
	const errors = issues.filter((issue) => issue.severity === 'error');

	if (errors.length > 0) {
		throw new DiagramStructureError(errors);
	}
}

export function checkStructureStrict(nodes: Node[], edges: Edge[]): void {
	const issues = validateDiagramStructure(nodes, edges);

	if (issues.length > 0) {
		throw new DiagramStructureError(issues);
	}
}

export function formatDiagramStructureIssues(
	issues: DiagramStructureIssue[],
): string {
	if (issues.length === 0) return 'Diagram structure is valid.';

	return [
		'Diagram structure is invalid:',
		...issues.map((issue, index) => {
			const location = [
				issue.nodeId ? `node=${issue.nodeId}` : undefined,
				issue.edgeId ? `edge=${issue.edgeId}` : undefined,
			]
				.filter(Boolean)
				.join(', ');

			return `${index + 1}. [${issue.severity}] ${
				location ? `${location}: ` : ''
			}${issue.message}`;
		}),
	].join('\n');
}

export function hasStructureErrors(nodes: Node[], edges: Edge[]): boolean {
	return validateDiagramStructure(nodes, edges).some(
		(issue) => issue.severity === 'error',
	);
}

export function getStructureErrors(
	nodes: Node[],
	edges: Edge[],
): DiagramStructureIssue[] {
	return validateDiagramStructure(nodes, edges).filter(
		(issue) => issue.severity === 'error',
	);
}

export function getStructureWarnings(
	nodes: Node[],
	edges: Edge[],
): DiagramStructureIssue[] {
	return validateDiagramStructure(nodes, edges).filter(
		(issue) => issue.severity === 'warning',
	);
}