import { Edge, Node } from "@xyflow/react";

type OutEdge = {
	source: string;
	target: string;
	label: string;
};

type NormalizedNode = {
	id: string;
	type: string;
	label: string;
};

type BuildContext = {
	nodeMap: Map<string, NormalizedNode>;
	outgoing: Map<string, OutEdge[]>;
	indegree: Map<string, number>;
	globalVisited: Set<string>;
	maxSteps: number;
	steps: number;
};

function normalizeLabel(value: unknown): string {
	if (typeof value === "string") {
		return value.trim();
	}

	return "";
}

function normalizeNodeType(value: unknown): string {
	if (typeof value !== "string") {
		return "action";
	}

	const normalized = value.trim().toLowerCase();
	if (normalized === "terminator") {
		return "terminator";
	}

	return normalized || "action";
}

function normalizeNodes(nodes: Node[]): NormalizedNode[] {
	return nodes.map((node) => ({
		id: String(node.id),
		type: normalizeNodeType(node.type),
		label: normalizeLabel((node.data as { label?: unknown } | undefined)?.label),
	}));
}

function normalizeEdges(edges: Edge[]): OutEdge[] {
	return edges
		.filter((edge) => edge.source && edge.target)
		.map((edge) => ({
			source: String(edge.source),
			target: String(edge.target),
			label: normalizeLabel(edge.label),
		}));
}

function createOutgoingMap(edges: OutEdge[]): Map<string, OutEdge[]> {
	const outMap = new Map<string, OutEdge[]>();

	for (const edge of edges) {
		const existing = outMap.get(edge.source) ?? [];
		existing.push(edge);
		outMap.set(edge.source, existing);
	}

	return outMap;
}

function createIndegreeMap(nodes: NormalizedNode[], edges: OutEdge[]): Map<string, number> {
	const indegree = new Map<string, number>();

	for (const node of nodes) {
		indegree.set(node.id, 0);
	}

	for (const edge of edges) {
		indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
	}

	return indegree;
}

function pickStartNodeId(nodes: NormalizedNode[], edges: OutEdge[]): string {
	const byType = nodes.find((node) => node.type === "start" || node.type === "initial");
	if (byType) {
		return byType.id;
	}

	const byLabel = nodes.find((node) => /^start\b/i.test(node.label));
	if (byLabel) {
		return byLabel.id;
	}

	const indegree = createIndegreeMap(nodes, edges);
	const noIncoming = nodes.find((node) => (indegree.get(node.id) ?? 0) === 0);
	if (noIncoming) {
		return noIncoming.id;
	}

	return nodes[0]?.id ?? "";
}

function escapeSingleQuotes(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function targetForLabel(outgoing: OutEdge[], wanted: RegExp): string | undefined {
	for (const edge of outgoing) {
		if (wanted.test(edge.label.toLowerCase())) {
			return edge.target;
		}
	}

	return undefined;
}

function findNextTargets(outgoing: OutEdge[]): { yesTarget?: string; noTarget?: string; fallbackTarget?: string } {
	const yesTarget = targetForLabel(outgoing, /^(yes|true|y|t)$/);
	const noTarget = targetForLabel(outgoing, /^(no|false|n|f)$/);

	const fallbackTarget = outgoing[0]?.target;

	return {
		yesTarget,
		noTarget,
		fallbackTarget,
	};
}

function isEndNode(node: NormalizedNode): boolean {
	if (node.type === "end" || node.type === "final") {
		return true;
	}

	if (node.type === "terminator" && /^end\b/i.test(node.label)) {
		return true;
	}

	return /^end\b/i.test(node.label);
}

function isDecisionNode(node: NormalizedNode): boolean {
	return node.type === "decision";
}

function isActionNode(node: NormalizedNode): boolean {
	return node.type === "action";
}

function isMergeNode(node: NormalizedNode): boolean {
	return node.type === "merge";
}

function isStartNode(node: NormalizedNode): boolean {
	if (node.type === "start" || node.type === "initial") {
		return true;
	}

	if (node.type === "terminator" && /^start\b/i.test(node.label)) {
		return true;
	}

	return /^start\b/i.test(node.label);
}

function collectReachableNodeIds(startNodeId: string, outgoing: Map<string, OutEdge[]>): string[] {
	if (!startNodeId) {
		return [];
	}

	const queue: string[] = [startNodeId];
	const visited = new Set<string>();
	const order: string[] = [];

	while (queue.length > 0) {
		const current = queue.shift();
		if (!current || visited.has(current)) {
			continue;
		}

		visited.add(current);
		order.push(current);

		const nextEdges = outgoing.get(current) ?? [];
		for (const edge of nextEdges) {
			if (!visited.has(edge.target)) {
				queue.push(edge.target);
			}
		}
	}

	return order;
}

function makeIndent(level: number): string {
	return "\t".repeat(Math.max(0, level));
}

function toCodeStatement(raw: string): string {
	const trimmed = raw.trim();
	if (!trimmed) {
		return "// TODO: add action";
	}

	if (/^[a-zA-Z_$][\w$.]*\s*\(/.test(trimmed) || /(=|\+\+|--|return\b|await\b|const\b|let\b|var\b)/.test(trimmed)) {
		return /[;{}]$/.test(trimmed) ? trimmed : `${trimmed};`;
	}

	return `${trimmed}`;
}

function collectReachableSet(startId: string, outgoing: Map<string, OutEdge[]>, max = 2000): Set<string> {
	const visited = new Set<string>();
	const queue: string[] = [startId];
	let steps = 0;

	while (queue.length > 0 && steps < max) {
		steps += 1;
		const current = queue.shift();
		if (!current || visited.has(current)) {
			continue;
		}

		visited.add(current);
		for (const edge of outgoing.get(current) ?? []) {
			if (!visited.has(edge.target)) {
				queue.push(edge.target);
			}
		}
	}

	return visited;
}

function findMergeNode(yesTarget: string | undefined, noTarget: string | undefined, ctx: BuildContext): string | undefined {
	if (!yesTarget || !noTarget) {
		return undefined;
	}

	const yesReachable = collectReachableSet(yesTarget, ctx.outgoing);
	const noReachable = collectReachableSet(noTarget, ctx.outgoing);

	let best: string | undefined;
	let bestScore = -1;

	for (const candidate of yesReachable) {
		if (!noReachable.has(candidate)) {
			continue;
		}

		const node = ctx.nodeMap.get(candidate);
		if (!node) {
			continue;
		}

		let score = 0;
		if (isMergeNode(node)) {
			score += 3;
		}
		if ((ctx.indegree.get(candidate) ?? 0) > 1) {
			score += 2;
		}
		if (isEndNode(node)) {
			score -= 1;
		}

		if (score > bestScore) {
			best = candidate;
			bestScore = score;
		}
	}

	return best;
}

function emitPath(startId: string | undefined, ctx: BuildContext, indentLevel: number, stopAt?: string): string[] {
	if (!startId) {
		return [];
	}

	const lines: string[] = [];
	let current: string | undefined = startId;
	const localVisited = new Set<string>();

	while (current) {
		if (stopAt && current === stopAt) {
			return lines;
		}

		if (ctx.steps >= ctx.maxSteps) {
			lines.push(`${makeIndent(indentLevel)}// Stopped: flow is too large or cyclic.`);
			return lines;
		}

		ctx.steps += 1;
		const node = ctx.nodeMap.get(current);
		if (!node) {
			lines.push(`${makeIndent(indentLevel)}// Unknown node '${escapeSingleQuotes(current)}'.`);
			return lines;
		}

		if (localVisited.has(current)) {
			lines.push(`${makeIndent(indentLevel)}// Loop detected back to '${escapeSingleQuotes(current)}'.`);
			return lines;
		}

		localVisited.add(current);
		ctx.globalVisited.add(current);

		const outgoing = ctx.outgoing.get(current) ?? [];

		if (isStartNode(node) || isMergeNode(node)) {
			current = outgoing[0]?.target;
			continue;
		}

		if (isEndNode(node)) {
			return lines;
		}

		if (isDecisionNode(node)) {
			const nextTargets = findNextTargets(outgoing);
			const yesTarget = nextTargets.yesTarget ?? outgoing[0]?.target;
			const noTarget = nextTargets.noTarget ?? outgoing[1]?.target;
			const mergeTarget = findMergeNode(yesTarget, noTarget, ctx);

			const condition = node.label.trim() || "condition";
			lines.push(`${makeIndent(indentLevel)}if (${condition}) {`);
			lines.push(...emitPath(yesTarget, ctx, indentLevel + 1, mergeTarget));
			lines.push(`${makeIndent(indentLevel)}} else {`);
			lines.push(...emitPath(noTarget ?? yesTarget, ctx, indentLevel + 1, mergeTarget));
			lines.push(`${makeIndent(indentLevel)}}`);

			current = mergeTarget;
			continue;
		}

		if (isActionNode(node)) {
			lines.push(`${makeIndent(indentLevel)}${toCodeStatement(node.label)}`);
			current = outgoing[0]?.target;
			if (outgoing.length > 1) {
				lines.push(`${makeIndent(indentLevel)}// Multiple outgoing edges found; using the first edge.`);
			}
			continue;
		}

		const fallbackLabel = node.label || node.type;
		lines.push(`${makeIndent(indentLevel)}// TODO handle node: ${fallbackLabel}`);
		current = outgoing[0]?.target;
	}

	return lines;
}

export function generateActivitySkeletonFromGraph(nodes: Node[], edges: Edge[]): string {
	const normalizedNodes = normalizeNodes(nodes);
	const normalizedEdges = normalizeEdges(edges);

	if (normalizedNodes.length === 0) {
		return [
			"export function runActivitySkeleton(): void {",
			"\t// Empty diagram: add nodes and edges in the activity editor first.",
			"}",
		].join("\n");
	}

	const startNodeId = pickStartNodeId(normalizedNodes, normalizedEdges);
	const outgoing = createOutgoingMap(normalizedEdges);
	const indegree = createIndegreeMap(normalizedNodes, normalizedEdges);
	const nodeMap = new Map(normalizedNodes.map((node) => [node.id, node]));
	const reachableNodeIds = collectReachableNodeIds(startNodeId, outgoing);
	const unreachableCount = normalizedNodes.length - reachableNodeIds.length;

	const ctx: BuildContext = {
		nodeMap,
		outgoing,
		indegree,
		globalVisited: new Set<string>(),
		maxSteps: Math.max(200, normalizedNodes.length * 8),
		steps: 0,
	};

	const flowLines = emitPath(startNodeId, ctx, 1);

	const lines: string[] = [];
	lines.push("/**");
	lines.push(" * Generated skeleton from Activity Diagram.");
	lines.push(" * Start node: " + escapeSingleQuotes(startNodeId || "<not-found>") + ".");
	if (unreachableCount > 0) {
		lines.push(" * Note: " + unreachableCount + " disconnected node(s) were ignored.");
	}
	lines.push(" * Replace TODO sections with real application logic.");
	lines.push(" */");
	lines.push("export function runActivitySkeleton(): void {");

	if (flowLines.length > 0) {
		lines.push(...flowLines);
	} else {
		lines.push("\t// No executable flow found from start node.");
	}

	if (unreachableCount > 0) {
		lines.push("");
		lines.push(`\t// ${unreachableCount} disconnected node(s) were ignored.`);
	}
	lines.push("}");

	return lines.join("\n");
}