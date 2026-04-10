import { type Edge, type Node } from "@xyflow/react";
import { SyntaxKind, type ClassDeclaration, type SourceFile } from "ts-morph";

type FlowNodeData = {
	label: string;
	sourceText?: string;
	nodeKind?: string;
};

function compact(text: string, maxLength = 40): string {
	const cleaned = text.replace(/\s+/g, " ").trim();
	return cleaned.length <= maxLength ? cleaned : `${cleaned.slice(0, maxLength - 3)}...`;
}

function buildLinearGraph(items: Array<{ label: string; sourceText: string; nodeKind: string; nodeType: string }>): { nodes: Node[]; edges: Edge[] } {
	const nodes: Node[] = [];
	const edges: Edge[] = [];

	nodes.push({
		id: "preview-start",
		type: "initial",
		position: { x: 0, y: 0 },
		data: { label: "Start" } as FlowNodeData,
	});

	let previousId = "preview-start";
	for (let i = 0; i < items.length; i++) {
		const nodeId = `preview-item-${i}`;
		nodes.push({
			id: nodeId,
			type: items[i].nodeType,
			position: { x: 0, y: (i + 1) * 130 },
			data: {
				label: compact(items[i].label),
				sourceText: items[i].sourceText,
				nodeKind: items[i].nodeKind,
			} as FlowNodeData,
		});

		edges.push({
			id: `preview-edge-${previousId}-${nodeId}`,
			source: previousId,
			target: nodeId,
			type: "smoothstep",
		});

		previousId = nodeId;
	}

	nodes.push({
		id: "preview-end",
		type: "end",
		position: { x: 0, y: (items.length + 1) * 130 },
		data: { label: "End" } as FlowNodeData,
	});

	edges.push({
		id: `preview-edge-${previousId}-preview-end`,
		source: previousId,
		target: "preview-end",
		type: "smoothstep",
	});

	return { nodes, edges };
}

function classToItems(classDeclaration: ClassDeclaration): Array<{ label: string; sourceText: string; nodeKind: string; nodeType: string }> {
	const items: Array<{ label: string; sourceText: string; nodeKind: string; nodeType: string }> = [];

	for (const member of classDeclaration.getMembers()) {
		if (member.getKind() === SyntaxKind.MethodDeclaration) {
			const methodName = (member as { getName?: () => string }).getName?.() ?? "method";
			items.push({ label: `${methodName}()`, sourceText: member.getText(), nodeKind: "method", nodeType: "expandable" });
		}

		if (member.getKind() === SyntaxKind.Constructor) {
			items.push({ label: "constructor()", sourceText: member.getText(), nodeKind: "constructor", nodeType: "expandable" });
		}

		if (member.getKind() === SyntaxKind.GetAccessor) {
			const accessorName = (member as { getName?: () => string }).getName?.() ?? "get";
			items.push({ label: `get ${accessorName}()`, sourceText: member.getText(), nodeKind: "getter", nodeType: "expandable" });
		}

		if (member.getKind() === SyntaxKind.SetAccessor) {
			const accessorName = (member as { getName?: () => string }).getName?.() ?? "set";
			items.push({ label: `set ${accessorName}()`, sourceText: member.getText(), nodeKind: "setter", nodeType: "expandable" });
		}
	}

	return items;
}

export function buildClassMembersPreviewGraph(sourceFile: SourceFile): { nodes: Node[]; edges: Edge[] } | undefined {
	const classDeclaration = sourceFile.getClasses()[0];
	if (!classDeclaration) {
		return undefined;
	}

	const items = classToItems(classDeclaration);
	if (items.length === 0) {
		return undefined;
	}

	return buildLinearGraph(items);
}