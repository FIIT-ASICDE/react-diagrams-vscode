import type { Edge, Node } from '@xyflow/react';
import type {
	ActivityGraphPayload,
	ActivityNodePreviewRequestPayload,
	ActivityExtensionToWebviewMessage,
} from '@react-diagrams/core/app@vscode';

export type ActivityNodeType = 'start' | 'action' | 'expandable' | 'decision' | 'merge' | 'end';

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

export type ActivityWebviewMessenger = {
	postMessage: {
		(type: 'diagram/requestType'): void;
		(type: 'code/request'): void;
		(type: 'code/generateSkeleton', data: ActivityGraphPayload): void;
		(type: 'code/nodePreview', data: ActivityNodePreviewRequestPayload): void;
	};
};

export type ActivityMessage = ActivityExtensionToWebviewMessage | { type?: string; data?: unknown };