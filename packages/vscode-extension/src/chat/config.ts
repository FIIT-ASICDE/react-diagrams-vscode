import * as vscode from "vscode";

export interface ParticipantConfig {
  code: boolean;
  diagramJson: boolean;
  diagramMermaid: boolean;
  diagramImage: boolean;
  debug: boolean;
  allowToolCall: boolean;
  maxToolIterations: number;
  diagramImageTimeoutMs: number;
}

export const DEFAULT_CONFIG: ParticipantConfig = {
  code: true,
  diagramJson: true,
  diagramMermaid: true,
  diagramImage: true,
  debug: true,
  allowToolCall: true,
  maxToolIterations: 3,
  diagramImageTimeoutMs: 15000,
};

export function getConfig(): ParticipantConfig {
  const cfg = vscode.workspace.getConfiguration("reactDiagrams.chat");

  return {
    code: cfg.get("code", DEFAULT_CONFIG.code),
    diagramJson: cfg.get("diagramJson", DEFAULT_CONFIG.diagramJson),
    diagramMermaid: cfg.get("diagramMermaid", DEFAULT_CONFIG.diagramMermaid),
    diagramImage: cfg.get("diagramImage", DEFAULT_CONFIG.diagramImage),
    debug: cfg.get("debug", DEFAULT_CONFIG.debug),
    allowToolCall: cfg.get("allowToolCall", DEFAULT_CONFIG.allowToolCall),
    maxToolIterations: cfg.get("maxToolIterations", DEFAULT_CONFIG.maxToolIterations),
    diagramImageTimeoutMs: cfg.get("diagramImageTimeoutMs", DEFAULT_CONFIG.diagramImageTimeoutMs),
  };
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function sanitizeConfig(input: unknown): ParticipantConfig {
  const candidate = (input && typeof input === "object") ? input as Record<string, unknown> : {};

  return {
    code: isBoolean(candidate.code) ? candidate.code : DEFAULT_CONFIG.code,
    diagramJson: isBoolean(candidate.diagramJson) ? candidate.diagramJson : DEFAULT_CONFIG.diagramJson,
    diagramMermaid: isBoolean(candidate.diagramMermaid) ? candidate.diagramMermaid : DEFAULT_CONFIG.diagramMermaid,
    diagramImage: isBoolean(candidate.diagramImage) ? candidate.diagramImage : DEFAULT_CONFIG.diagramImage,
    debug: isBoolean(candidate.debug) ? candidate.debug : DEFAULT_CONFIG.debug,
    allowToolCall: isBoolean(candidate.allowToolCall) ? candidate.allowToolCall : DEFAULT_CONFIG.allowToolCall,
    maxToolIterations: isNumber(candidate.maxToolIterations) ? candidate.maxToolIterations : DEFAULT_CONFIG.maxToolIterations,
    diagramImageTimeoutMs: isNumber(candidate.diagramImageTimeoutMs) ? candidate.diagramImageTimeoutMs : DEFAULT_CONFIG.diagramImageTimeoutMs,
  };
}

export async function updateConfig(input: unknown): Promise<ParticipantConfig> {
  const next = sanitizeConfig(input);
  const cfg = vscode.workspace.getConfiguration("reactDiagrams.chat");

  await cfg.update("code", next.code, vscode.ConfigurationTarget.Workspace);
  await cfg.update("diagramJson", next.diagramJson, vscode.ConfigurationTarget.Workspace);
  await cfg.update("diagramMermaid", next.diagramMermaid, vscode.ConfigurationTarget.Workspace);
  await cfg.update("diagramImage", next.diagramImage, vscode.ConfigurationTarget.Workspace);
  await cfg.update("debug", next.debug, vscode.ConfigurationTarget.Workspace);
  await cfg.update("allowToolCall", next.allowToolCall, vscode.ConfigurationTarget.Workspace);
  await cfg.update("maxToolIterations", next.maxToolIterations, vscode.ConfigurationTarget.Workspace);
  await cfg.update("diagramImageTimeoutMs", next.diagramImageTimeoutMs, vscode.ConfigurationTarget.Workspace);

  return next;
}

export const DIAGRAM_CHAT_PARTICIPANT_ID = "vs-code-ext.diagram";
export const RESPONSE_LANGUAGE = "Slovak";
export const DIAGRAM_TOOL_NAME = "create_activity_diagram";
export const CODE_FROM_DIAGRAM_TOOL_NAME = "create_code_from_activity_diagram";