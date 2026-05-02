import * as vscode from "vscode";
import { componentStateCache } from "@/app@utils/cache";

const DIAGRAM_CHAT_PARTICIPANT_ID = "react-diagrams.diagram";
const MODEL_TYPE = "copilot";
const RESPONSE_LANGUAGE = "English";

type ChatContextSnapshot = {
	userPrompt: string;
	activeFilePath?: string;
	selectedOrFullCode: string;
	codeContextKind: "selected" | "full-file" | "none";
	diagramContext: DiagramContext;
};

type DiagramContext = {
	availability: "available-visible" | "unavailable";
	json: string;
};

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

async function selectModelByType(modelType: string): Promise<vscode.LanguageModelChat | undefined> {
	const normalized = modelType.trim();

	if (!normalized || normalized === "copilot") {
		const [defaultModel] = await vscode.lm.selectChatModels({ vendor: "copilot" });
		return defaultModel;
	}

	if (normalized.includes(":")) {
		const [vendorPart, familyPart] = normalized.split(":", 2);
		const vendor = vendorPart?.trim();
		const family = familyPart?.trim();

		if (vendor && family) {
			const [exactModel] = await vscode.lm.selectChatModels({ vendor, family });
			if (exactModel)
				return exactModel;
		}
	}

	const [familyModel] = await vscode.lm.selectChatModels({ vendor: "copilot", family: normalized });
	if (familyModel)
		return familyModel;

	const [fallbackModel] = await vscode.lm.selectChatModels({ vendor: "copilot" });
	return fallbackModel;
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
	const diagramContext = await getCurrentDiagramJson();

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
		"Always analyze code together with activity diagram context.",
		"You can explain behavior, suggest refactors, compare code and diagram, and detect inconsistencies.",
		"Always state whether and how the diagram influenced your answer.",
		"If diagram updates would improve the outcome, propose concrete diagram changes.",
		"Keep answers practical, structured, and implementation-focused."
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
		`Diagram summary: "component" = component the diagram is generated for, stateVariables = list of components state variables with their mutators representing functions that mutate the state variables. 
		Theese mutators are sub-diagrams that contain the state updates and control flow structures of the mutating function.`,
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
		``,
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
		"- @diagram point out potential design issues, unnecessary complexity and how to improve them",
		// "- @diagram improve the generated skeleton",
		// "- @diagram tell me whether the diagram changes your recommendation",
		"",
	].join("\n");
}

async function getCurrentDiagramJson(): Promise<DiagramContext> {
	const visibleGraph = componentStateCache.get(componentStateCache.getCurrentDocument());
	if (visibleGraph) {
		return buildDiagramContext("available-visible", visibleGraph.data);
	}

	return buildFallbackDiagramContext("No visible activity diagram context is available. Open the activity diagram panel and generate/open a diagram first.");
}

function buildDiagramContext(
	availability: DiagramContext["availability"],
	data: any,
): DiagramContext {
	const json = JSON.stringify({ data }, null, 2);
		
	return {
		availability,
		json,
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
	};
}