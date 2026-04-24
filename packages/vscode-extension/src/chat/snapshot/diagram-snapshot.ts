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

  return {
    availability,
    json: JSON.stringify({ nodes, edges }, null, 2),
    nodeCount: nodes.length,
    edgeCount: edges.length,
    nodeTypes,
  };
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