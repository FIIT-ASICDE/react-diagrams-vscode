import * as vscode from "vscode";
import { ComponentActivityPanel } from "../app@panels/ComponentActivityPanel";
import {ChatContextSnapshot, DiagramContext} from "./types";
import {selectModelByType, MODEL_TYPE} from "./utils";
const DIAGRAM_CHAT_PARTICIPANT_ID = "vs-code-ext.diagram";
const RESPONSE_LANGUAGE = "English";



export function registerDiagramChatParticipant(context: vscode.ExtensionContext): vscode.Disposable {
	const participant = vscode.chat.createChatParticipant(
		DIAGRAM_CHAT_PARTICIPANT_ID,
		async (request, _chatContext, stream, token) => {
			const snapshot = await getChatContextSnapshot(request.prompt);
			const promptWasVague = isPromptHelp(snapshot.userPrompt);

			if (promptWasVague) {
				stream.markdown(buildCapabilitiesIntro());
                return;
            }

			stream.markdown(buildContextHeader(snapshot));

			const model = await selectModelByType(MODEL_TYPE);
			if (!model) {
				stream.markdown(`No chat model is available for MODEL_TYPE='${MODEL_TYPE}'. Ensure Copilot Chat is enabled and the configured model is accessible.`);
				return;
			}

			const messages = buildLanguageModelMessages(snapshot, promptWasVague);
			const response = await model.sendRequest(messages, {}, token);

			for await (const part of response.text) {
				stream.markdown(part);
			}
		},
	);

	participant.iconPath = new vscode.ThemeIcon("graph-line");
	context.subscriptions.push(participant);
	return participant;
}

async function getChatContextSnapshot(userPrompt: string): Promise<ChatContextSnapshot> {
	const editor = vscode.window.activeTextEditor;
	const document = editor?.document;
	const hasSelection = Boolean(editor && !editor.selection.isEmpty);

	const selectedOrFullCode = editor && !editor.selection.isEmpty
		? editor.document.getText(editor.selection)
		: ""
	const codeContextKind: ChatContextSnapshot["codeContextKind"] = hasSelection
		? "selected"
		: "none"

	const activeFilePath = document?.uri.fsPath;
	const diagramContext = await getCurrentActivityDiagramJson();

	return {
		userPrompt,
		activeFilePath,
		selectedOrFullCode,
		codeContextKind,
		diagramContext,
	};
}

function buildLanguageModelMessages(snapshot: ChatContextSnapshot, promptWasVague: boolean): vscode.LanguageModelChatMessage[] {
	const systemInstruction = [
	"Role: expert assistant for TypeScript, TSX, and activity diagrams.",
	`You must answer in this language: ${RESPONSE_LANGUAGE}.`,
	"Analyze all available context (code and diagram) together and provide the best possible answer.",
	"Do not explicitly compare code and diagram during the answer.",
	"Answer strictly only what the user asks (e.g. if the prompt is 'explain', only explain the behavior).",
	"Do not add extra sections, suggestions, or information unless explicitly requested.",
	"Style the answer nicely and use markdown formatting where appropriate, especially for code snippets.",
	"At the very end, briefly state how the diagram influenced your reasoning (or that it had no impact).",
	"Keep the answer practical, concise, and implementation-focused."
	].join("\n");


	const effectiveTask = promptWasVague
		? "Provide a short capabilities intro, suggest concrete next prompts, then give best-effort analysis from available context."
		: snapshot.userPrompt;

	const userContext = [
		"Task request:",
		effectiveTask,
		"",
		"Context receipt:",
		`- code context kind: ${snapshot.codeContextKind}`,
		`Active file: ${snapshot.activeFilePath ?? "<no active file>"}`,
		`Diagram availability: ${snapshot.diagramContext.availability}`,
		`Diagram summary: nodes=${snapshot.diagramContext.nodeCount}, edges=${snapshot.diagramContext.edgeCount}, nodeTypes=${snapshot.diagramContext.nodeTypes.join(", ") || "<none>"}`,
		...(snapshot.diagramContext.warning ? [`Diagram warning: ${snapshot.diagramContext.warning}`] : []),
		"",
		"Code context (selection if present, otherwise full file):",
		snapshot.selectedOrFullCode || "<no code available>",
		"",
		"Current activity diagram JSON:",
		snapshot.diagramContext.json,
	].join("\n\n");

	return [
		vscode.LanguageModelChatMessage.User(systemInstruction),
		vscode.LanguageModelChatMessage.User(userContext),
	];
}

function buildContextHeader(snapshot: ChatContextSnapshot): string {
	const diagramAvailability = snapshot.diagramContext.availability;
	const fileAvailability = snapshot.activeFilePath ? "yes" : "no";

	return [
		"### Context received",
		`- code: ${snapshot.codeContextKind === "selected" ? "selected snippet" : snapshot.codeContextKind === "full-file" ? "full file" : "unavailable"}`,
		`- diagram: ${diagramAvailability}`,
		`- active file: ${fileAvailability}${snapshot.activeFilePath ? ` (${snapshot.activeFilePath})` : ""}`,
		`- diagram summary: ${snapshot.diagramContext.nodeCount} nodes, ${snapshot.diagramContext.edgeCount} edges${snapshot.diagramContext.nodeTypes.length ? `, node types: ${snapshot.diagramContext.nodeTypes.join(", ")}` : ""}`,
		...(snapshot.diagramContext.warning ? [`- warning: ${snapshot.diagramContext.warning}`] : []),
		"",
	].join("\n");
}

function isPromptHelp(prompt: string): boolean {
	const normalized = prompt.trim().toLowerCase();
	return ["?", "help", "", "what"].includes(normalized);
}


function buildCapabilitiesIntro(): string {
	return [
		"### What you can ask",
		"- @diagram explain this flow",
		"- @diagram suggest a refactor",
		"- @diagram compare the code with the diagram",
		"- @diagram find inconsistencies",
		"- @diagram improve the generated skeleton",
		"- @diagram tell me whether the diagram changes your recommendation",
		"",
	].join("\n");
}

async function getCurrentActivityDiagramJson(): Promise<DiagramContext> {
	const visibleGraph = ComponentActivityPanel.getCurrentVisibleActivityGraph();
	if (visibleGraph) {
		return buildDiagramContext("available-visible", visibleGraph.nodes, visibleGraph.edges);
	}

	return buildFallbackDiagramContext("No visible activity diagram context is available. Open the activity diagram panel and generate/open a diagram first.");
}

function buildDiagramContext(
	availability: DiagramContext["availability"],
	nodes: unknown[],
	edges: unknown[],
): DiagramContext {
	const nodeTypes = Array.from(new Set(nodes
		.map((node) => {
			if (!node || typeof node !== "object")
				return "unknown";

			const maybeType = (node as { type?: unknown }).type;
			return typeof maybeType === "string" && maybeType.trim() ? maybeType : "unknown";
		})
		.filter((value) => value !== "unknown")))
		.sort((left, right) => left.localeCompare(right));

	const json = JSON.stringify({ nodes, edges }, null, 2);

	return {
		availability,
		json,
		nodeCount: nodes.length,
		edgeCount: edges.length,
		nodeTypes,
	};
}

function buildFallbackDiagramContext(warning: string): DiagramContext {
	const fallbackPayload = {
		warning,
		nodes: [],
		edges: [],
	};

	return {
		availability: "unavailable",
		json: JSON.stringify(fallbackPayload, null, 2),
		nodeCount: 0,
		edgeCount: 0,
		nodeTypes: [],
		warning,
	};
}
