import * as vscode from "vscode";
import { ChatContextSnapshot } from "../types";
import { getConfig } from "../config";
import { captureDiagramImageWithDiagnostics, dataUrlToImagePart } from "../snapshot/diagram-snapshot";



export interface AgentContext {
  code: { text: string; present: boolean; reason?: string };
  diagramJson: { text: string; present: boolean; reason?: string };
  diagramImage: { part?: vscode.LanguageModelDataPart; present: boolean; reason?: string };
  hasAnything: boolean;
}

export async function collectAgentContext(snapshot: ChatContextSnapshot): Promise<AgentContext> {
  const code = buildCodeContext(snapshot);
  const diagramJson = buildDiagramJsonContext(snapshot);
  const diagramImage = await buildDiagramImageContext(snapshot);

  return {
    code,
    diagramJson,
    diagramImage,
    hasAnything: code.present || diagramJson.present || diagramImage.present,
  };
}

function buildCodeContext(snapshot: ChatContextSnapshot): AgentContext["code"] {
    const config = getConfig();
  const codeOnScreen =
    snapshot.codeContextKind !== "none" &&
    snapshot.selectedOrFullCode.trim().length > 0;

  if (config.code && codeOnScreen) {
    return { text: snapshot.selectedOrFullCode, present: true };
  }

  return {
    text: "",
    present: false,
    reason: !config.code ? "code is disabled in config" : "no code is open or selected",
  };
}

function buildDiagramJsonContext(snapshot: ChatContextSnapshot): AgentContext["diagramJson"] {
    const config = getConfig();
  const diagramOnScreen = snapshot.diagramContext.availability !== "unavailable";

  if (config.diagramJson && diagramOnScreen) {
    return { text: snapshot.diagramContext.json, present: true };
  }

  return {
    text: "",
    present: false,
    reason: !config.diagramJson ? "diagram JSON is disabled in config" : "no activity diagram is open",
  };
}

async function buildDiagramImageContext(snapshot: ChatContextSnapshot): Promise<AgentContext["diagramImage"]> {
    const config = getConfig();
  if (!config.diagramImage) {
    return { present: false, reason: "diagram image is disabled in config" };
  }

  const diagramOnScreen = snapshot.diagramContext.availability !== "unavailable";
  if (!diagramOnScreen) {
    return { present: false, reason: "no diagram is open, so nothing to capture" };
  }

  const captureResult = await captureDiagramImageWithDiagnostics();

  if (!captureResult.dataUrl) {
    return { present: false, reason: captureResult.reason ?? "unknown capture failure" };
  }

  const part = dataUrlToImagePart(captureResult.dataUrl);
  if (!part) {
    return { present: false, reason: "data URL received but could not be parsed into an image" };
  }

  return { part, present: true };
}

export function describeMissing(context: AgentContext): string {
  const parts: string[] = [];
  if (!context.code.present && context.code.reason) parts.push(`Code: ${context.code.reason}.`);
  if (!context.diagramJson.present && context.diagramJson.reason) parts.push(`Diagram: ${context.diagramJson.reason}.`);
  if (!context.diagramImage.present && context.diagramImage.reason) parts.push(`Diagram Image: ${context.diagramImage.reason}.`);
  return parts.join(" ");
}