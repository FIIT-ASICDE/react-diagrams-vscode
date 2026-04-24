import * as vscode from "vscode";

export interface ParticipantConfig {
  code: boolean;
  diagramJson: boolean;
  diagramImage: boolean;
  allowToolCall: boolean;
  maxToolIterations: number;
  diagramImageTimeoutMs: number;
  diagramRelevanceCheck: boolean;
}

export const DEFAULT_CONFIG: ParticipantConfig = {
  code: true,
  diagramJson: true,
  diagramImage: true,
  allowToolCall: true,
  maxToolIterations: 3,
  diagramImageTimeoutMs: 15000,
  diagramRelevanceCheck: true,
};

export function getConfig(): ParticipantConfig {
  const cfg = vscode.workspace.getConfiguration("reactDiagrams.chat");

  return {
    code: cfg.get("code", DEFAULT_CONFIG.code),
    diagramJson: cfg.get("diagramJson", DEFAULT_CONFIG.diagramJson),
    diagramImage: cfg.get("diagramImage", DEFAULT_CONFIG.diagramImage),
    allowToolCall: cfg.get("allowToolCall", DEFAULT_CONFIG.allowToolCall),
    maxToolIterations: cfg.get("maxToolIterations", DEFAULT_CONFIG.maxToolIterations),
    diagramImageTimeoutMs: cfg.get("diagramImageTimeoutMs", DEFAULT_CONFIG.diagramImageTimeoutMs),
    diagramRelevanceCheck: cfg.get("diagramRelevanceCheck", DEFAULT_CONFIG.diagramRelevanceCheck),
  };
}

// constants nechaj
export const MODEL_TYPE = "copilot";
export const DIAGRAM_CHAT_PARTICIPANT_ID = "vs-code-ext.diagram";
export const RESPONSE_LANGUAGE = "English";
export const DEBUG = true;
export const DIAGRAM_TOOL_NAME = "create_activity_diagram";
export const CODE_FROM_DIAGRAM_TOOL_NAME = "create_code_from_activity_diagram";