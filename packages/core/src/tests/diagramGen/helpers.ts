import assert from 'node:assert/strict';
import ts from 'typescript';
import { Project, SyntaxKind } from 'ts-morph';

import { DiagramBuilder } from '../../@react-activity-diagrams';
import { convertDiagramToCode } from '../../@react-activity-diagrams/code-snippet/main';

export function assertSyntacticallyValidTypeScript(source: string): void {
	const result = ts.transpileModule(source, {
		reportDiagnostics: true,
		compilerOptions: { target: ts.ScriptTarget.ES2020 },
	});

	const syntaxDiagnostics = (result.diagnostics ?? []).filter(
		(diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
	);

	assert.equal(
		syntaxDiagnostics.length,
		0,
		`Expected syntactically valid TypeScript, got: ${syntaxDiagnostics
			.map((d) => d.messageText)
			.join(' | ')}\n\nGenerated:\n${source}`,
	);
}

export async function buildGraphFromBody(bodySource: string) {
	const project = new Project({ compilerOptions: { allowJs: true, jsx: 2 } });
	const sourceFile = project.createSourceFile(
		'diagram-source.ts',
		`async function source(input: any) {\n${bodySource}\n}`,
		{ overwrite: true },
	);

	const fn = sourceFile.getFunctionOrThrow('source');
	const body = fn.getBodyOrThrow().asKindOrThrow(SyntaxKind.Block);
	return new DiagramBuilder().buildStatements(body.getStatements());
}

export async function generateFromFunctionBody(bodySource: string): Promise<string> {
	const graph = await buildGraphFromBody(bodySource);
	return convertDiagramToCode(graph.nodes, graph.edges, 'generatedFromDiagram', []);
}

export function nodeText(node: any): string {
	return String(node?.data?.sourceText ?? node?.data?.label ?? '');
}

export function nodesByText(graph: any, text: string) {
	return graph.nodes.filter((node: any) => nodeText(node).includes(text));
}

export function nodeByText(graph: any, text: string) {
	return nodesByText(graph, text)[0];
}

export function nodeByConstruct(graph: any, construct: string) {
	return graph.nodes.find((node: any) => node.data?.construct === construct);
}

export function nodesByConstruct(graph: any, construct: string) {
	return graph.nodes.filter((node: any) => node.data?.construct === construct);
}

export function outgoingFrom(graph: any, nodeId: string) {
	return graph.edges.filter((edge: any) => String(edge.source) === String(nodeId));
}

export function incomingTo(graph: any, nodeId: string) {
	return graph.edges.filter((edge: any) => String(edge.target) === String(nodeId));
}

export function targetNode(graph: any, edge: any) {
	return graph.nodes.find((node: any) => String(node.id) === String(edge.target));
}

export function edgeLabelsFrom(graph: any, nodeId: string): string[] {
	return outgoingFrom(graph, nodeId).map((edge: any) => String(edge.label ?? ''));
}

export function hasPath(graph: any, startId: string, endId: string, maxDepth = 60): boolean {
	if (!startId || !endId) return false;

	const queue: Array<{ id: string; depth: number }> = [{ id: String(startId), depth: 0 }];
	const visited = new Set<string>();

	while (queue.length > 0) {
		const current = queue.shift();
		if (!current) break;

		if (current.id === String(endId)) return true;
		if (current.depth >= maxDepth) continue;
		if (visited.has(current.id)) continue;
		visited.add(current.id);

		for (const edge of outgoingFrom(graph, current.id)) {
			queue.push({ id: String(edge.target), depth: current.depth + 1 });
		}
	}

	return false;
}

export function reachesTargetBeforeStop(
	graph: any,
	startId: string,
	targetId: string,
	stopIds: Set<string>,
	maxDepth = 60,
): boolean {
	if (!startId || !targetId) return false;

	const queue: Array<{ id: string; depth: number }> = [{ id: String(startId), depth: 0 }];
	const visited = new Set<string>();

	while (queue.length > 0) {
		const current = queue.shift();
		if (!current) break;

		if (current.id === String(targetId)) return true;
		if (current.depth >= maxDepth) continue;
		if (visited.has(current.id)) continue;
		visited.add(current.id);

		if (stopIds.has(current.id)) continue;

		for (const edge of outgoingFrom(graph, current.id)) {
			queue.push({ id: String(edge.target), depth: current.depth + 1 });
		}
	}

	return false;
}

export function findBranchEdge(graph: any, nodeId: string, labels: string[]) {
	return outgoingFrom(graph, nodeId).find((edge: any) => labels.includes(String(edge.label ?? '')));
}

export function assertNoDirectEdge(graph: any, sourceId: string, targetId: string, message: string): void {
	assert.equal(
		graph.edges.some(
			(edge: any) => String(edge.source) === String(sourceId) && String(edge.target) === String(targetId),
		),
		false,
		message,
	);
}
