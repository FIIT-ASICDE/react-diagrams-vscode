export type DiagramType = "activity";

export type ActivityGraphPayload = {
	nodes: unknown[];
	edges: unknown[];
	sourceFile?: string;
};

export type ActivityNodePreviewRequestPayload = {
	title: string;
	sourceText: string;
};

export type ActivityNodePreviewDataPayload = {
	title: string;
	sourceText?: string;
	nodes: unknown[];
	edges: unknown[];
};

export type ActivityWebviewToExtensionMessage =
	| { type: "diagram/requestType" }
	| { type: "diagram/visibleGraph"; data: ActivityGraphPayload }
	| { type: "diagram/generateSkeleton"; data: ActivityGraphPayload }
	| { type: "code/request" }
	| { type: "code/nodePreview"; data: ActivityNodePreviewRequestPayload };

export type ActivityExtensionToWebviewMessage =
	| { type: "diagram/type"; data: { diagramType: DiagramType } }
	| { type: "code/data"; data: ActivityGraphPayload }
	| { type: "code/error"; data: { message: string } }
	| { type: "code/nodePreviewData"; data: ActivityNodePreviewDataPayload }
	| { type: "code/nodePreviewError"; data: { message: string } };

const ACTIVITY_WEBVIEW_TO_EXTENSION_TYPES = new Set<string>([
	"diagram/requestType",
	"diagram/visibleGraph",
	"diagram/generateSkeleton",
	"code/request",
	"code/nodePreview",
]);

export function isActivityWebviewToExtensionMessage(
	message: unknown,
): message is ActivityWebviewToExtensionMessage {
	if (!message || typeof message !== "object")
		return false;

	const maybeType = (message as { type?: unknown }).type;
	return typeof maybeType === "string" && ACTIVITY_WEBVIEW_TO_EXTENSION_TYPES.has(maybeType);
}