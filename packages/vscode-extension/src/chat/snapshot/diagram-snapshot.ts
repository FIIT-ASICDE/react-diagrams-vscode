import * as vscode from "vscode";
import { ComponentActivityPanel } from "../../app@panels/ComponentActivityPanel";
import { DiagramContext } from "../types";
import { getConfig } from "../config";

export async function readCurrentDiagramContext(): Promise<DiagramContext> {
  const panel = ComponentActivityPanel.currentPanel;

  let visibleGraph = ComponentActivityPanel.getCurrentVisibleActivityGraph();
  if (panel && !visibleGraph) {
    try {
      const refreshed = await panel.refreshVisibleGraph(2500);
      if (refreshed) {
        visibleGraph = { nodes: [...refreshed.nodes], edges: [...refreshed.edges] };
      }
    } catch {
      // Fall through.
    }
  }

  if (visibleGraph) {
    return buildDiagramContext("available-visible", visibleGraph.nodes, visibleGraph.edges);
  }

  const parsedGraph = ComponentActivityPanel.getCurrentActivityGraph();
  if (parsedGraph) {
    return buildDiagramContext("available-visible", parsedGraph.nodes, parsedGraph.edges);
  }

  return buildUnavailableDiagramContext();
}

function buildDiagramContext(
  availability: DiagramContext["availability"],
  nodes: unknown[],
  edges: unknown[],
): DiagramContext {
  const nodeTypes = collectNodeTypes(nodes);
  const compactGraph = compactDiagramGraph(nodes, edges);
  const mermaid = buildMermaidFromCompactGraph(compactGraph);

  return {
    availability,
    json: JSON.stringify(compactGraph, null, 2),
    mermaid,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    nodeTypes,
  };
}

function compactDiagramGraph(nodes: unknown[], edges: unknown[]): { nodes: CompactNode[]; edges: CompactEdge[] } {
  return {
    nodes: nodes.map(compactNode),
    edges: edges.map(compactEdge).filter((e): e is CompactEdge => e !== undefined),
  };
}

type CompactNode = {
  id?: string;
  type?: string;
  data?: {
    label?: string;
    sourceText?: string;
    construct?: string;
    nodeKind?: string;
    deps?: string;
    loopLabel?: string;
    loopKind?: string;
    forHeader?: string;
    forOfBinding?: string;
    forEachIterable?: string;
    forEachCallee?: string;
    forEachParams?: string;
  };
};

type CompactEdge = {
  id?: string;
  source?: string;
  target?: string;
  label?: string;
  type?: string;
  sourceHandle?: string;
  targetHandle?: string;
};

function compactNode(node: unknown): CompactNode {
  if (!node || typeof node !== "object") return {};

  const candidate = node as Record<string, unknown>;
  const data = compactNodeData(candidate.data);

  return {
    id: asOptionalString(candidate.id),
    type: asOptionalString(candidate.type),
    ...(data ? { data } : {}),
  };
}

function compactNodeData(data: unknown): CompactNode["data"] | undefined {
  if (!data || typeof data !== "object") return undefined;

  const candidate = data as Record<string, unknown>;
  const compact: NonNullable<CompactNode["data"]> = {
    label: asOptionalString(candidate.label),
    sourceText: asOptionalString(candidate.sourceText),
    construct: asOptionalString(candidate.construct),
    nodeKind: asOptionalString(candidate.nodeKind),
    deps: asOptionalString(candidate.deps),
    loopLabel: asOptionalString(candidate.loopLabel),
    loopKind: asOptionalString(candidate.loopKind),
    forHeader: asOptionalString(candidate.forHeader),
    forOfBinding: asOptionalString(candidate.forOfBinding),
    forEachIterable: asOptionalString(candidate.forEachIterable),
    forEachCallee: asOptionalString(candidate.forEachCallee),
    forEachParams: asOptionalString(candidate.forEachParams),
  };

  return removeUndefinedFields(compact);
}

function compactEdge(edge: unknown): CompactEdge | undefined {
  if (!edge || typeof edge !== "object") return {};

  const candidate = edge as Record<string, unknown>;
  return removeUndefinedFields({
    id: asOptionalString(candidate.id),
    source: asOptionalString(candidate.source),
    target: asOptionalString(candidate.target),
    label: asOptionalString(candidate.label),
    type: asOptionalString(candidate.type),
    sourceHandle: asOptionalString(candidate.sourceHandle),
    targetHandle: asOptionalString(candidate.targetHandle),
  });
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function removeUndefinedFields<T extends Record<string, unknown>>(value: T): T | undefined {
  const entries = Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined);
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries) as T;
}

function collectNodeTypes(nodes: unknown[]): string[] {
  return Array.from(
    new Set(
      nodes
        .map(extractNodeType)
        .filter((v) => v !== "unknown"),
    ),
  ).sort((a, b) => a.localeCompare(b));
}

function extractNodeType(node: unknown): string {
  if (!node || typeof node !== "object") return "unknown";
  const maybeType = (node as { type?: unknown }).type;
  return typeof maybeType === "string" && maybeType.trim() ? maybeType : "unknown";
}

function buildMermaidFromCompactGraph(graph: { nodes: CompactNode[]; edges: CompactEdge[] }): string | undefined {
  if (graph.nodes.length === 0) return undefined;

  const nodeRefById = new Map<string, string>();
  const lines: string[] = ["flowchart TD"];

  for (let i = 0; i < graph.nodes.length; i++) {
    const node = graph.nodes[i];
    const nodeId = node.id?.trim() || `node_${i + 1}`;
    const nodeRef = toMermaidIdentifier(nodeId, i);
    nodeRefById.set(nodeId, nodeRef);

    const label = pickNodeLabel(node, nodeId);
    lines.push(`  ${nodeRef}[\"${escapeMermaidText(label)}\"]`);
  }

  for (const edge of graph.edges) {
    if (!edge.source || !edge.target) continue;

    const sourceRef = nodeRefById.get(edge.source);
    const targetRef = nodeRefById.get(edge.target);
    if (!sourceRef || !targetRef) continue;

    if (edge.label?.trim()) {
      lines.push(`  ${sourceRef} -->|${escapeMermaidText(edge.label)}| ${targetRef}`);
    } else {
      lines.push(`  ${sourceRef} --> ${targetRef}`);
    }
  }

  return lines.join("\n");
}

function toMermaidIdentifier(rawId: string, index: number): string {
  const normalized = rawId.replace(/[^a-zA-Z0-9_]/g, "_");
  const withPrefix = /^[A-Za-z_]/.test(normalized) ? normalized : `n_${normalized}`;
  const safe = withPrefix || `n_${index + 1}`;
  return `${safe}_${index + 1}`;
}

function pickNodeLabel(node: CompactNode, fallback: string): string {
  const fromData =
    node.data?.label ||
    node.data?.construct ||
    node.data?.sourceText ||
    node.data?.nodeKind ||
    node.data?.loopLabel;

  return (fromData?.trim() || node.type?.trim() || fallback).slice(0, 140);
}

function escapeMermaidText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\"/g, "\\\"")
    .replace(/\n/g, " ");
}

function buildUnavailableDiagramContext(): DiagramContext {
  return {
    availability: "unavailable",
    json: JSON.stringify(
      {
        warning: "No visible activity diagram context is available. Open the activity diagram panel first.",
        nodes: [],
        edges: [],
      },
      null,
      2,
    ),
    nodeCount: 0,
    edgeCount: 0,
    nodeTypes: [],
    warning: "No visible activity diagram context is available.",
  };
}

// ── Image capture ─────────────────────────────────────────────────────

export interface CaptureResult {
  dataUrl?: string;
  reason?: string;
}

export async function captureDiagramImageWithDiagnostics(): Promise<CaptureResult> {
    const config = getConfig();
  const panel = ComponentActivityPanel.currentPanel;
  if (!panel) {
    return { reason: "diagram panel is not open" };
  }

  try {
    const dataUrl = await panel.requestDiagramImageDataUrl(config.diagramImageTimeoutMs);
    if (!dataUrl) {
      return { reason: "webview returned no image (timeout or toPng failed)" };
    }
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
      return { reason: `webview returned invalid data URL: ${String(dataUrl).slice(0, 80)}` };
    }
    return { dataUrl };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { reason: `panel.requestDiagramImageDataUrl threw: ${msg}` };
  }
}

export function dataUrlToImagePart(dataUrl?: string): vscode.LanguageModelDataPart | undefined {
  if (!dataUrl) return undefined;
  const match = dataUrl.match(/^data:(.*?);base64,(.*)$/);
  if (!match) return undefined;

  return vscode.LanguageModelDataPart.image(
    new Uint8Array(Buffer.from(match[2], "base64")),
    match[1],
  );
}