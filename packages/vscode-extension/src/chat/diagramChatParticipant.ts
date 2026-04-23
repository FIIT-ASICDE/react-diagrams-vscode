import * as vscode from "vscode";
import { ComponentActivityPanel } from "../app@panels/ComponentActivityPanel";
import { ChatContextSnapshot, DiagramContext } from "./types";
import { selectModelByType, MODEL_TYPE } from "./utils";

// ===========================================================================
// CONFIG — controls what is sent to the model
// ===========================================================================
// Each flag decides whether that piece of context is made available.
// If a flag is true but the thing isn't actually on screen, it's simply skipped.
// If everything is missing after filtering, the agent tells the user.

interface ParticipantConfig {
	code: boolean;          // send source code (selection or full file)
	diagramJson: boolean;   // send activity diagram JSON
	diagramImage: boolean;  // send rendered diagram image
	allowToolCall: boolean; // let the model call create_activity_diagram when useful
}

const CONFIG: ParticipantConfig = {
	code: true,
	diagramJson: true,
	diagramImage: true,
	allowToolCall: true,
};

const DIAGRAM_CHAT_PARTICIPANT_ID = "vs-code-ext.diagram";
const RESPONSE_LANGUAGE = "English";
const DEBUG_TOOLS = true;

// ===========================================================================
// Entry point
// ===========================================================================

export function registerDiagramChatParticipant(
	context: vscode.ExtensionContext
): vscode.Disposable {
	registerRefactorCommands(context);

	const participant = vscode.chat.createChatParticipant(
		DIAGRAM_CHAT_PARTICIPANT_ID,
		handleChatRequest
	);

	participant.iconPath = new vscode.ThemeIcon("graph-line");
	context.subscriptions.push(participant);
	return participant;
}

// ===========================================================================
// Commands (Apply / Show Diff)
// ===========================================================================

function registerRefactorCommands(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.commands.registerCommand(
			"vs-code-ext.applyRefactor",
			async (
				filePath: string,
				contextKind: string,
				newCode: string,
				startLine?: number | null,
				endLine?: number | null
			) => {
				const uri = vscode.Uri.file(filePath);
				const document = await vscode.workspace.openTextDocument(uri);

				// != catches both null and undefined (JSON serialization turns undefined → null)
				const hasRange = startLine != null && endLine != null;

				let range: vscode.Range;
				if (hasRange) {
					range = new vscode.Range(startLine!, 0, endLine! + 1, 0);
				} else {
					const editor = vscode.window.visibleTextEditors.find(
						(e) => e.document.uri.toString() === uri.toString()
					);
					range =
						contextKind === "selected" && editor && !editor.selection.isEmpty
							? editor.selection
							: new vscode.Range(0, 0, document.lineCount, 0);
				}

				const edit = new vscode.WorkspaceEdit();
				edit.replace(uri, range, newCode);

				const ok = await vscode.workspace.applyEdit(edit);
				if (ok) {
					vscode.window.showInformationMessage("✅ Refactoring applied!");
				} else {
					vscode.window.showErrorMessage("❌ Failed to apply changes.");
				}
			}
		),

		vscode.commands.registerCommand(
			"vs-code-ext.showRefactorDiff",
			async (filePath: string, _contextKind: string, newCode: string) => {
				const originalUri = vscode.Uri.file(filePath);
				const newDoc = await vscode.workspace.openTextDocument({
					content: newCode,
					language: "typescript",
				});
				await vscode.commands.executeCommand(
					"vscode.diff",
					originalUri,
					newDoc.uri,
					"Original ↔ Refactored"
				);
			}
		)
	);
}

// ===========================================================================
// Main handler — one unified agentic flow
// ===========================================================================

async function handleChatRequest(
	request: vscode.ChatRequest,
	_chatContext: vscode.ChatContext,
	stream: vscode.ChatResponseStream,
	token: vscode.CancellationToken
): Promise<void> {
	const snapshot = await getChatContextSnapshot(request.prompt);

	if (isPromptHelp(snapshot.userPrompt)) {
		stream.markdown(buildCapabilitiesIntro());
		return;
	}

	// Build what the agent will actually see, filtered by CONFIG and by what
	// is really on the screen.
	const available = resolveAvailableContext(snapshot);
	const payload = await buildAgentPayload(available, snapshot);

	if (DEBUG_TOOLS) {
		printDebugContext(stream, snapshot, available, payload);
	}

	if (!payload.hasAnything) {
		stream.markdown(
			"I don't have any context to work with. " +
			describeWhatIsMissing(available) +
			" Adjust the participant config or open/select the relevant content, then ask again."
		);
		return;
	}

	const model = request.model ?? (await selectModelByType(MODEL_TYPE));
	if (!model) {
		stream.markdown(
			`No chat model is available for MODEL_TYPE='${MODEL_TYPE}'. Ensure Copilot Chat is enabled.`
		);
		return;
	}

	const tool =
		CONFIG.allowToolCall && available.code
			? vscode.lm.tools.find((c) => c.name === "create_activity_diagram")
			: undefined;

	// --- Single agent call. The agent decides: explain / refactor / tool call.
	const initialMessages = buildAgentMessages(snapshot, payload);

	const first = await runFirstCall(
		model,
		tool,
		initialMessages,
		token
	);

	// Case A — agent answered directly (no tool call needed)
	if (first.kind === "direct") {
		await renderAgentResponse(first.text, snapshot, stream);
		return;
	}

	// Case B — agent requested a tool call (only create_activity_diagram is wired)
	if (!tool || first.toolCallPart.name !== "create_activity_diagram") {
		await renderAgentResponse(
			first.textSoFar,
			snapshot,
			stream,
			"Tooling isn't available right now; answering from the available context."
		);
		return;
	}

	// Case C — run the tool, then let the agent continue
	stream.markdown("🧩 Generating diagram to help answer your question...\n\n");

	const toolResult = await vscode.lm.invokeTool(
		first.toolCallPart.name,
		{
			input: buildSafeDiagramToolInput(snapshot),
			toolInvocationToken: request.toolInvocationToken,
		},
		token
	);

	await runSecondCall({
		model,
		snapshot,
		payload,
		initialMessages,
		toolCallPart: first.toolCallPart,
		toolResult,
		token,
		stream,
	});
}

// ===========================================================================
// Context resolution — decide what the agent may see
// ===========================================================================

interface AvailableContext {
	code: boolean;           // code allowed by config AND present on screen
	diagramJson: boolean;    // diagram JSON allowed AND present
	diagramImage: boolean;   // diagram image allowed AND present
	reasons: {
		codeMissing?: string;
		diagramMissing?: string;
	};
}

function resolveAvailableContext(snapshot: ChatContextSnapshot): AvailableContext {
	const codeOnScreen =
		snapshot.codeContextKind !== "none" &&
		snapshot.selectedOrFullCode.trim().length > 0;
	const diagramOnScreen = snapshot.diagramContext.availability !== "unavailable";

	const result: AvailableContext = {
		code: CONFIG.code && codeOnScreen,
		diagramJson: CONFIG.diagramJson && diagramOnScreen,
		diagramImage: CONFIG.diagramImage && diagramOnScreen, // actual image fetched later
		reasons: {},
	};

	if (!CONFIG.code) {
		result.reasons.codeMissing = "code is disabled in the config";
	} else if (!codeOnScreen) {
		result.reasons.codeMissing = "no code is open or selected";
	}

	if (!CONFIG.diagramJson && !CONFIG.diagramImage) {
		result.reasons.diagramMissing = "diagram is disabled in the config";
	} else if (!diagramOnScreen) {
		result.reasons.diagramMissing = "no activity diagram is open";
	}

	return result;
}

function describeWhatIsMissing(available: AvailableContext): string {
	const parts: string[] = [];
	if (!available.code && available.reasons.codeMissing) {
		parts.push(`Code: ${available.reasons.codeMissing}.`);
	}
	if (!available.diagramJson && !available.diagramImage && available.reasons.diagramMissing) {
		parts.push(`Diagram: ${available.reasons.diagramMissing}.`);
	}
	return parts.join(" ");
}

// ===========================================================================
// Payload assembly — what actually gets packaged into the agent message
// ===========================================================================

interface AgentPayload {
	hasAnything: boolean;
	codeText: string;           // "" if not used
	diagramJsonText: string;    // "" if not used
	imagePart?: vscode.LanguageModelDataPart;
}

async function buildAgentPayload(
	available: AvailableContext,
	snapshot: ChatContextSnapshot
): Promise<AgentPayload> {
	const codeText = available.code ? snapshot.selectedOrFullCode : "";
	const diagramJsonText = available.diagramJson ? snapshot.diagramContext.json : "";

	let imagePart: vscode.LanguageModelDataPart | undefined;
	if (available.diagramImage) {
		const dataUrl = await requestCurrentDiagramImageDataUrl();
		imagePart = dataUrlToImagePart(dataUrl);
	}

	return {
		hasAnything: Boolean(codeText || diagramJsonText || imagePart),
		codeText,
		diagramJsonText,
		imagePart,
	};
}

// ===========================================================================
// Agent messages — one prompt that handles refactor, explanation, anything
// ===========================================================================

function buildAgentMessages(
	snapshot: ChatContextSnapshot,
	payload: AgentPayload
): vscode.LanguageModelChatMessage[] {
	const systemLines = [
		"Role: expert assistant for TypeScript, TSX, and activity diagrams.",
		`You must answer in this language: ${RESPONSE_LANGUAGE}.`,
		"",
		"Decide the appropriate response type from the user's prompt:",
		"",
		"1. REFACTOR — if the user asks to refactor, rewrite, restructure, or clean up code.",
		"   Return the refactored code inside a single fenced code block (```typescript ... ```).",
		"   The code block will be inserted directly into the source file via a workspace edit,",
		"   so it must contain ONLY valid code — no comments like '// rest unchanged'.",
		"   If the user names a specific function (e.g. 'refactor foo', 'refactor the function the diagram shows'),",
		"   return ONLY that function in the code block. Otherwise return the full code you were given.",
		"   Preserve behavior exactly unless the user explicitly asks to change it.",
		"",
		"   If the user ALSO asks you to explain, justify, describe your decisions, or similar:",
		"   put the code block FIRST, then add a short explanation in prose after it.",
		"   Use at most ONE code block in total.",
		"",
		"2. EXPLANATION / ANALYSIS — if the user asks to explain, analyze, compare, or find issues",
		"   WITHOUT asking for refactored code.",
		"   Answer in normal prose, concise and practical. Do not return a code block unless showing a short example.",
		"",
		"3. TOOL CALL — if answering well would meaningfully benefit from an activity diagram",
		"   and code is available, call create_activity_diagram. Pass the existing code as input,",
		"   do not modify it. Only call the tool when it genuinely helps.",
		"",
		"General rules:",
		"- Do not assume anything that isn't explicitly provided below.",
		"- If only a diagram is provided, reason directly from it.",
		"- If only code is provided, reason from code.",
		"- If both are provided, use them as complementary sources.",
		"- Answer strictly what the user asked — nothing more, nothing less.",
	].join("\n");

	const userBlocks: string[] = [
		`User prompt: ${snapshot.userPrompt}`,
		"",
		`File: ${snapshot.activeFilePath ?? "<none>"}`,
		`Code context kind: ${snapshot.codeContextKind}`,
	];

	if (payload.codeText) {
		userBlocks.push(
			"",
			"Available code:",
			"```typescript",
			payload.codeText,
			"```"
		);
	} else {
		userBlocks.push("", "Available code: <none>");
	}

	if (payload.diagramJsonText) {
		userBlocks.push(
			"",
			"Available activity diagram JSON:",
			payload.diagramJsonText
		);
	} else {
		userBlocks.push("", "Available activity diagram JSON: <none>");
	}

	userBlocks.push(
		"",
		payload.imagePart
			? "A rendered diagram image is attached below."
			: "Rendered diagram image: <none>"
	);

	const parts: Array<vscode.LanguageModelTextPart | vscode.LanguageModelDataPart> = [
		new vscode.LanguageModelTextPart(userBlocks.join("\n")),
	];

	if (payload.imagePart) {
		parts.push(payload.imagePart);
	}

	return [
		vscode.LanguageModelChatMessage.User(systemLines),
		vscode.LanguageModelChatMessage.User(parts),
	];
}

// ===========================================================================
// Agent calls (first / second) — thin wrappers around sendRequest
// ===========================================================================

type FirstCallResult =
	| { kind: "direct"; text: string }
	| {
			kind: "tool";
			textSoFar: string;
			toolCallPart: vscode.LanguageModelToolCallPart;
	  };

async function runFirstCall(
	model: vscode.LanguageModelChat,
	tool: vscode.LanguageModelChatTool | undefined,
	initialMessages: vscode.LanguageModelChatMessage[],
	token: vscode.CancellationToken
): Promise<FirstCallResult> {
	const options = tool
		? { tools: [tool], toolMode: vscode.LanguageModelChatToolMode.Auto }
		: {};

	const response = await model.sendRequest(initialMessages, options, token);

	const textParts: string[] = [];
	let toolCallPart: vscode.LanguageModelToolCallPart | undefined;

	for await (const part of response.stream) {
		if (part instanceof vscode.LanguageModelTextPart) {
			textParts.push(part.value);
		} else if (part instanceof vscode.LanguageModelToolCallPart) {
			toolCallPart = part;
		}
	}

	if (toolCallPart) {
		return {
			kind: "tool",
			textSoFar: textParts.join(""),
			toolCallPart,
		};
	}
	return { kind: "direct", text: textParts.join("") };
}

async function runSecondCall(args: {
	model: vscode.LanguageModelChat;
	snapshot: ChatContextSnapshot;
	payload: AgentPayload;
	initialMessages: vscode.LanguageModelChatMessage[];
	toolCallPart: vscode.LanguageModelToolCallPart;
	toolResult: vscode.LanguageModelToolResult;
	token: vscode.CancellationToken;
	stream: vscode.ChatResponseStream;
}): Promise<void> {
	const { model, snapshot, initialMessages, toolCallPart, toolResult, token, stream } = args;

	// Refresh diagram context after the tool ran
	const refreshedImageDataUrl = CONFIG.diagramImage
		? await requestCurrentDiagramImageDataUrl()
		: undefined;
	const refreshedDiagram = await getDiagramContextForSecondCall(refreshedImageDataUrl);
	const refreshedImagePart = dataUrlToImagePart(refreshedImageDataUrl);

	const continuedMessages: vscode.LanguageModelChatMessage[] = [
		...initialMessages,
		vscode.LanguageModelChatMessage.Assistant([toolCallPart]),
		vscode.LanguageModelChatMessage.User([
			new vscode.LanguageModelToolResultPart(toolCallPart.callId, toolResult.content),
		]),
		vscode.LanguageModelChatMessage.User(
			buildSecondCallContextParts(snapshot, refreshedDiagram, refreshedImagePart)
		),
	];

	const toolModeNone = (
		vscode.LanguageModelChatToolMode as unknown as {
			None?: vscode.LanguageModelChatToolMode;
		}
	).None;

	let finalResponse: vscode.LanguageModelChatResponse;
	try {
		finalResponse = await model.sendRequest(
			continuedMessages,
			toolModeNone !== undefined ? { toolMode: toolModeNone } : {},
			token
		);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		stream.markdown(`❌ Model request failed after tool call: \`${msg}\``);
		return;
	}

	let finalText = "";
	try {
		for await (const part of finalResponse.stream) {
			if (part instanceof vscode.LanguageModelTextPart) {
				finalText += part.value;
			}
		}
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		stream.markdown(`❌ Stream error: \`${msg}\``);
		return;
	}

	await renderAgentResponse(finalText, snapshot, stream);
}

function buildSecondCallContextParts(
	snapshot: ChatContextSnapshot,
	refreshedDiagram: DiagramContext,
	imagePart: vscode.LanguageModelDataPart | undefined
): Array<vscode.LanguageModelTextPart | vscode.LanguageModelDataPart> {
	const text = [
		"The tool ran. Use the refreshed diagram context below to finish the user's original request.",
		"",
		`Refreshed diagram availability: ${refreshedDiagram.availability}`,
		`Nodes: ${refreshedDiagram.nodeCount}, edges: ${refreshedDiagram.edgeCount}`,
		"",
		"Refreshed diagram JSON:",
		refreshedDiagram.json,
	].join("\n");

	const parts: Array<vscode.LanguageModelTextPart | vscode.LanguageModelDataPart> = [
		new vscode.LanguageModelTextPart(text),
	];
	if (imagePart) {
		parts.push(imagePart);
	}
	return parts;
}

// ===========================================================================
// Response rendering — detect refactor-style code block and add buttons
// ===========================================================================

async function renderAgentResponse(
	text: string,
	snapshot: ChatContextSnapshot,
	stream: vscode.ChatResponseStream,
	prefix?: string
): Promise<void> {
	if (prefix) {
		stream.markdown(prefix + "\n\n");
	}

	if (!text.trim()) {
		stream.markdown("❌ The agent returned an empty response.");
		return;
	}

	const refactor = detectRefactorResponse(text);

	if (refactor) {
		const location = findCodeLocation(snapshot, refactor.code);

		// Show any preamble the agent wrote before the code
		if (refactor.before) {
			stream.markdown(refactor.before + "\n\n");
		}

		stream.markdown(
			location.matched
				? `### Refactored \`${location.name ?? "code"}\`:\n`
				: "### Refactored code:\n"
		);
		stream.markdown("```typescript\n" + refactor.code + "\n```\n\n");

		// Show the explanation the agent wrote after the code
		if (refactor.after) {
			stream.markdown(refactor.after + "\n\n");
		}

		stream.button({
			command: "vs-code-ext.applyRefactor",
			title: "$(check) Apply changes",
			arguments: [
				snapshot.activeFilePath,
				snapshot.codeContextKind,
				refactor.code,
				location.startLine,
				location.endLine,
			],
		});

		stream.button({
			command: "vs-code-ext.showRefactorDiff",
			title: "$(diff) Show diff",
			arguments: [snapshot.activeFilePath, snapshot.codeContextKind, refactor.code],
		});
		return;
	}

	// Non-refactor answer — just print it
	stream.markdown(text);
}

// A refactor response contains exactly one code block. Text before/after the block
// is treated as preamble/explanation and rendered alongside the Apply/Diff buttons.
function detectRefactorResponse(
	text: string
): { code: string; before: string; after: string } | null {
	const pattern = /```(?:tsx?|jsx?|javascript|typescript)?\s*\n([\s\S]*?)```/gi;
	const matches = [...text.matchAll(pattern)];

	if (matches.length !== 1) {
		return null;
	}

	const match = matches[0];
	const code = match[1].trim();

	// The code itself must actually look like code (function, const, class, import, etc.)
	// Otherwise it's probably an inline example inside an explanation.
	if (!/^\s*(?:export\s+)?(?:async\s+)?(?:function\b|const\b|let\b|var\b|class\b|interface\b|type\b|import\b)/m.test(code)) {
		return null;
	}

	const blockStart = match.index ?? 0;
	const blockEnd = blockStart + match[0].length;

	return {
		code,
		before: text.slice(0, blockStart).trim(),
		after: text.slice(blockEnd).trim(),
	};
}

// Try to locate where the refactored code should be inserted.
// If the code is a single named function we can find in the source, return that range.
// Otherwise fall back to replacing selection / full file.
function findCodeLocation(
	snapshot: ChatContextSnapshot,
	refactoredCode: string
): { matched: boolean; name?: string; startLine: number | null; endLine: number | null } {
	const name = extractTopLevelFunctionName(refactoredCode);
	if (!name) {
		return { matched: false, startLine: null, endLine: null };
	}

	const located = findFunctionRangeInSource(snapshot.selectedOrFullCode, name);
	if (!located) {
		return { matched: false, name, startLine: null, endLine: null };
	}

	return { matched: true, name, startLine: located.startLine, endLine: located.endLine };
}

// ===========================================================================
// Code analysis helpers (local, no AI)
// ===========================================================================

function extractTopLevelFunctionName(code: string): string | null {
	// Look for the first function declaration or const assignment
	const match = code.match(
		/^\s*(?:export\s+)?(?:async\s+)?(?:function\s+([A-Za-z_$][\w$]*)|const\s+([A-Za-z_$][\w$]*)\s*=)/m
	);
	if (!match) return null;
	return match[1] || match[2] || null;
}

function findFunctionRangeInSource(
	code: string,
	functionName: string
): { startLine: number; endLine: number } | null {
	const lines = code.split("\n");
	const signature = new RegExp(
		`^\\s*(?:export\\s+)?(?:async\\s+)?(?:function\\s+${functionName}\\b|const\\s+${functionName}\\s*=)`
	);

	const startLine = lines.findIndex((l) => signature.test(l));
	if (startLine === -1) return null;

	let depth = 0;
	let foundOpen = false;

	for (let i = startLine; i < lines.length; i++) {
		const line = lines[i];
		let inString: string | null = null;

		for (let j = 0; j < line.length; j++) {
			const ch = line[j];

			if (!inString && ch === "/" && line[j + 1] === "/") break;

			if (!inString && (ch === '"' || ch === "'" || ch === "`")) {
				inString = ch;
				continue;
			}
			if (inString && ch === inString && line[j - 1] !== "\\") {
				inString = null;
				continue;
			}

			if (!inString) {
				if (ch === "{") { depth++; foundOpen = true; }
				else if (ch === "}") { depth--; }
			}
		}

		if (foundOpen && depth === 0) {
			return { startLine, endLine: i };
		}
	}
	return null;
}

// ===========================================================================
// Debug logging
// ===========================================================================

function printDebugContext(
	stream: vscode.ChatResponseStream,
	snapshot: ChatContextSnapshot,
	available: AvailableContext,
	payload: AgentPayload
): void {
	stream.markdown(
		[
			"### Debug",
			"**Config:**",
			`- code: ${CONFIG.code}`,
			`- diagramJson: ${CONFIG.diagramJson}`,
			`- diagramImage: ${CONFIG.diagramImage}`,
			`- allowToolCall: ${CONFIG.allowToolCall}`,
			"",
			"**Snapshot:**",
			`- active file: ${snapshot.activeFilePath ?? "<none>"}`,
			`- code context kind: ${snapshot.codeContextKind}`,
			`- code length on screen: ${snapshot.selectedOrFullCode.length}`,
			`- diagram availability: ${snapshot.diagramContext.availability}`,
			"",
			"**Sent to agent:**",
			`- code: ${available.code ? "yes" : "no"}${available.reasons.codeMissing ? ` (${available.reasons.codeMissing})` : ""}`,
			`- diagram JSON: ${payload.diagramJsonText ? "yes" : "no"}`,
			`- diagram image: ${payload.imagePart ? "yes" : "no"}`,
			"",
		].join("\n")
	);
}

// ===========================================================================
// Snapshot / misc helpers (unchanged behavior from original)
// ===========================================================================

async function getChatContextSnapshot(userPrompt: string): Promise<ChatContextSnapshot> {
	const document = getPreferredChatDocument();
	const matchingEditor = document ? getMatchingEditorForDocument(document) : undefined;
	const hasSelection = Boolean(matchingEditor && !matchingEditor.selection.isEmpty);

	const selectedOrFullCode = !document
		? ""
		: hasSelection
			? matchingEditor!.document.getText(matchingEditor!.selection)
			: document.getText();

	const codeContextKind: ChatContextSnapshot["codeContextKind"] = !document
		? "none"
		: hasSelection
			? "selected"
			: "full-file";

	return {
		userPrompt,
		activeFilePath: document?.uri.fsPath,
		selectedOrFullCode,
		codeContextKind,
		diagramContext: await getCurrentActivityDiagramJson(),
	};
}

function getPreferredChatDocument(): vscode.TextDocument | undefined {
	const panelDocument = getPanelSourceDocument();
	if (panelDocument && isSupportedCodeDocument(panelDocument)) return panelDocument;

	const activeDocument = vscode.window.activeTextEditor?.document;
	if (activeDocument && isSupportedCodeDocument(activeDocument)) return activeDocument;

	const visibleDocument = vscode.window.visibleTextEditors
		.map((e) => e.document)
		.find((d) => isSupportedCodeDocument(d));
	if (visibleDocument) return visibleDocument;

	return vscode.workspace.textDocuments.find((d) => isSupportedCodeDocument(d));
}

function getPanelSourceDocument(): vscode.TextDocument | undefined {
	const panelClass = ComponentActivityPanel as typeof ComponentActivityPanel & {
		getCurrentSourceDocument?: () => vscode.TextDocument | undefined;
	};
	return panelClass.getCurrentSourceDocument?.();
}

function getMatchingEditorForDocument(
	document: vscode.TextDocument
): vscode.TextEditor | undefined {
	const active = vscode.window.activeTextEditor;
	if (active && active.document.uri.toString() === document.uri.toString()) return active;
	return vscode.window.visibleTextEditors.find(
		(e) => e.document.uri.toString() === document.uri.toString()
	);
}

function isSupportedCodeDocument(document: vscode.TextDocument | undefined): boolean {
	if (!document || document.uri.scheme !== "file") return false;
	const p = document.uri.fsPath.toLowerCase();
	return p.endsWith(".ts") || p.endsWith(".tsx") || p.endsWith(".js") || p.endsWith(".jsx");
}

function buildSafeDiagramToolInput(snapshot: ChatContextSnapshot): Record<string, unknown> {
	const hasSelectedSnippet =
		snapshot.codeContextKind === "selected" &&
		snapshot.selectedOrFullCode.trim().length > 0;

	if (hasSelectedSnippet) {
		return {
			sourceText: snapshot.selectedOrFullCode,
			title: "Activity Diagram - Selected Code",
		};
	}
	return { wholeFile: true, title: "Activity Diagram - Whole File" };
}

async function requestCurrentDiagramImageDataUrl(): Promise<string | undefined> {
	const panel = ComponentActivityPanel.currentPanel;
	if (!panel) return undefined;
	return panel.requestDiagramImageDataUrl();
}

async function getDiagramContextForSecondCall(
	diagramImageDataUrl?: string
): Promise<DiagramContext> {
	if (!diagramImageDataUrl) {
		return getCurrentActivityDiagramJson();
	}
	let latest = await getCurrentActivityDiagramJson();
	for (let i = 0; i < 8; i++) {
		if (!isErrorDiagramJson(latest)) return latest;
		await new Promise((resolve) => setTimeout(resolve, 120));
		latest = await getCurrentActivityDiagramJson();
	}
	return latest;
}

function dataUrlToImagePart(dataUrl?: string): vscode.LanguageModelDataPart | undefined {
	if (!dataUrl) return undefined;
	const match = dataUrl.match(/^data:(.*?);base64,(.*)$/);
	if (!match) return undefined;
	return vscode.LanguageModelDataPart.image(
		new Uint8Array(Buffer.from(match[2], "base64")),
		match[1]
	);
}

function isPromptHelp(prompt: string): boolean {
	const n = prompt.trim().toLowerCase();
	return ["?", "help", "", "what"].includes(n);
}

function buildCapabilitiesIntro(): string {
	return [
		"### What you can ask",
		"- @diagram explain this flow",
		"- @diagram analyze diagram",
		"- @diagram compare code and diagram",
		"- @diagram find inconsistencies",
		"- @diagram refactor this code",
		"- @diagram refactor the function the diagram shows",
		"- @diagram refactor functionName",
		"",
	].join("\n");
}

async function getCurrentActivityDiagramJson(): Promise<DiagramContext> {
	const visibleGraph = ComponentActivityPanel.getCurrentVisibleActivityGraph();
	if (visibleGraph) {
		return buildDiagramContext("available-visible", visibleGraph.nodes, visibleGraph.edges);
	}
	return buildFallbackDiagramContext(
		"No visible activity diagram context is available. Open the activity diagram panel and generate/open a diagram first."
	);
}

function buildDiagramContext(
	availability: DiagramContext["availability"],
	nodes: unknown[],
	edges: unknown[]
): DiagramContext {
	const nodeTypes = Array.from(
		new Set(
			nodes
				.map((node) => {
					if (!node || typeof node !== "object") return "unknown";
					const maybeType = (node as { type?: unknown }).type;
					return typeof maybeType === "string" && maybeType.trim() ? maybeType : "unknown";
				})
				.filter((v) => v !== "unknown")
		)
	).sort((a, b) => a.localeCompare(b));

	return {
		availability,
		json: JSON.stringify({ nodes, edges }, null, 2),
		nodeCount: nodes.length,
		edgeCount: edges.length,
		nodeTypes,
	};
}

function buildFallbackDiagramContext(warning: string): DiagramContext {
	return {
		availability: "unavailable",
		json: JSON.stringify({ warning, nodes: [], edges: [] }, null, 2),
		nodeCount: 0,
		edgeCount: 0,
		nodeTypes: [],
		warning,
	};
}

function isErrorDiagramJson(diagramContext: DiagramContext): boolean {
	const j = diagramContext.json.toLowerCase();
	return (
		j.includes("activity diagram error") ||
		j.includes("no source file available to build the diagram")
	);
}