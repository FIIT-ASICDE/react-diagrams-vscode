import * as vscode from "vscode";
export type EnrichSkeletonInput = {
    code: string;
    activeFilePath?: string;
    diagramContext: DiagramContext;
    token: vscode.CancellationToken;
};

export type ChatContextSnapshot = {
    userPrompt: string;
    activeFilePath?: string;
    selectedOrFullCode: string;
    codeContextKind: "selected" | "full-file" | "none";
    diagramContext: DiagramContext;
};

export type DiagramContext = {
    availability: "available-visible" | "unavailable";
    json: string;
    nodeCount: number;
    edgeCount: number;
    nodeTypes: string[];
    warning?: string;
};