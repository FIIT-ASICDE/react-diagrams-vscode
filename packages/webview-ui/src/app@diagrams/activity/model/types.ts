import type {
	ActivityGraphPayload,
	ActivityNodePreviewRequestPayload,
	ActivityExtensionToWebviewMessage,
} from '@react-diagrams/core/app@vscode';

/** Node "types" the user can add via the toolbar. */
export type ActivityNodeType =
	| 'start'
	| 'action'
	| 'expandable'
	| 'decision'
	| 'loop'
	| 'merge'
	| 'end';

/**
 * In-flight rename for a node. `value` is what the user is typing.
 * `fullText` is the original sourceText (or label, if no sourceText) —
 * used to seed the textarea when the user opens the dialog.
 */
export type RenameDraft = {
	nodeId: string;
	value: string;
	fullText: string;
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
		(type: 'diagram/requestImage', data: {}): void;
		(type: 'diagram/requestGraph', data: {}): void;
	};
};

export type ActivityMessage =
	| ActivityExtensionToWebviewMessage
	| { type?: string; data?: unknown };