import type { Edge, Node } from '@xyflow/react';
import type {
	ActivityGraphPayload,
	ActivityNodePreviewRequestPayload,
	ActivityExtensionToWebviewMessage,
} from '@react-diagrams/core/app@vscode';

export type ActivityNodeType = 'start' | 'action' | 'expandable' | 'decision' | 'loop' | 'merge' | 'end';

export type PreviewSnapshot = {
	title: string;
	sourceText?: string;
	nodes: Node[];
	edges: Edge[];
};

export type RenameDraft = {
	nodeId: string;
	value: string;
	deps?: string;
};

export type EdgeRenameDraft = {
	edgeId: string;
	value: string;
};

export type DiagramRenameDraft =
	| { kind: 'node'; draft: RenameDraft }
	| { kind: 'edge'; draft: EdgeRenameDraft };

export type ActivityWebviewMessenger = {
	postMessage: {
		(type: 'diagram/requestType'): void;
		(type: 'diagram/visibleGraph', data: ActivityGraphPayload): void;
		(type: 'diagram/generateSkeleton', data: ActivityGraphPayload): void;
		(type: 'code/request'): void;
		(type: 'code/nodePreview', data: ActivityNodePreviewRequestPayload): void;
	};
};

export type ActivityMessage = ActivityExtensionToWebviewMessage | { type?: string; data?: unknown };