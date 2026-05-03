export type DiagramContext = {
    availability: "available-visible" | "unavailable";
    json: string;
    mermaid?: string;
    nodeCount: number;
    edgeCount: number;
    nodeTypes: string[];
    warning?: string;
};