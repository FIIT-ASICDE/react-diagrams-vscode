// import * as vscode from "vscode";
// import * as ts from "typescript";
// import { ComponentActivityPanel } from "../app@panels/ComponentActivityPanel";
// import { ChatContextSnapshot, DiagramContext } from "./types";
// import { selectModelByType, MODEL_TYPE } from "./utils";

// // ===========================================================================
// // Config
// // ===========================================================================

// interface ParticipantConfig {
// 	code: boolean;
// 	diagramJson: boolean;
// 	diagramImage: boolean;
// 	allowToolCall: boolean;
// 	maxToolIterations: number;
// 	/** Timeout for waiting on the webview to capture the diagram as PNG. */
// 	diagramImageTimeoutMs: number;
// }

// const CONFIG: ParticipantConfig = {
// 	code: true,
// 	diagramJson: true,
// 	diagramImage: true,
// 	allowToolCall: true,
// 	maxToolIterations: 3,
// 	diagramImageTimeoutMs: 15000,
// };

// const DIAGRAM_CHAT_PARTICIPANT_ID = "vs-code-ext.diagram";
// const RESPONSE_LANGUAGE = "English";
// const DEBUG = true;
// const DIAGRAM_TOOL_NAME = "create_activity_diagram";
// const CODE_FROM_DIAGRAM_TOOL_NAME = "create_code_from_activity_diagram";

// // ===========================================================================
// // Entry point
// // ===========================================================================

// export function registerDiagramChatParticipant(
// 	context: vscode.ExtensionContext
// ): vscode.Disposable {
// 	registerRefactorCommands(context);

// 	const participant = vscode.chat.createChatParticipant(
// 		DIAGRAM_CHAT_PARTICIPANT_ID,
// 		handleChatRequest
// 	);
// 	participant.iconPath = new vscode.ThemeIcon("graph-line");
// 	context.subscriptions.push(participant);
// 	return participant;
// }

// // ===========================================================================
// // Apply / Show Diff commands
// // ===========================================================================

// function registerRefactorCommands(context: vscode.ExtensionContext): void {
// 	context.subscriptions.push(
// 		vscode.commands.registerCommand(
// 			"vs-code-ext.applyRefactor",
// 			async (
// 				filePath: string,
// 				contextKind: string,
// 				newCode: string,
// 				startLine?: number | null,
// 				endLine?: number | null
// 			) => {
// 				const uri = vscode.Uri.file(filePath);
// 				const document = await vscode.workspace.openTextDocument(uri);

// 				const hasRange = startLine != null && endLine != null;
// 				let range: vscode.Range;

// 				if (hasRange) {
// 					range = new vscode.Range(startLine!, 0, endLine! + 1, 0);
// 				} else {
// 					const editor = vscode.window.visibleTextEditors.find(
// 						(e) => e.document.uri.toString() === uri.toString()
// 					);
// 					range =
// 						contextKind === "selected" && editor && !editor.selection.isEmpty
// 							? editor.selection
// 							: new vscode.Range(0, 0, document.lineCount, 0);
// 				}

// 				const edit = new vscode.WorkspaceEdit();
// 				edit.replace(uri, range, newCode);

// 				const ok = await vscode.workspace.applyEdit(edit);
// 				if (ok) {
// 					vscode.window.showInformationMessage("✅ Refactoring applied!");
// 				} else {
// 					vscode.window.showErrorMessage("❌ Failed to apply changes.");
// 				}
// 			}
// 		),

// 		vscode.commands.registerCommand(
// 			"vs-code-ext.showRefactorDiff",
// 			async (filePath: string, _contextKind: string, newCode: string) => {
// 				const originalUri = vscode.Uri.file(filePath);
// 				const newDoc = await vscode.workspace.openTextDocument({
// 					content: newCode,
// 					language: "typescript",
// 				});
// 				await vscode.commands.executeCommand(
// 					"vscode.diff",
// 					originalUri,
// 					newDoc.uri,
// 					"Original ↔ Refactored"
// 				);
// 			}
// 		)
// 	);
// }

// // ===========================================================================
// // Main handler
// // ===========================================================================

// async function handleChatRequest(
// 	request: vscode.ChatRequest,
// 	_chatContext: vscode.ChatContext,
// 	stream: vscode.ChatResponseStream,
// 	token: vscode.CancellationToken
// ): Promise<void> {
// 	const snapshot = await collectChatSnapshot(request.prompt);

// 	if (isHelpPrompt(snapshot.userPrompt)) {
// 		stream.markdown(buildHelpText());
// 		return;
// 	}

// 	const context = await collectAgentContext(snapshot);
// 	const focus = resolveUserFocus(snapshot, context);

// 	if (DEBUG) {
// 		printDebug(stream, snapshot, context, focus);
// 	}

// 	if (!context.hasAnything) {
// 		stream.markdown(
// 			"I don't have any context to work with. " +
// 			describeMissing(context) +
// 			" Adjust the participant config or open/select the relevant content, then ask again."
// 		);
// 		return;
// 	}

// 	const model = request.model ?? (await selectModelByType(MODEL_TYPE));
// 	if (!model) {
// 		stream.markdown(
// 			`No chat model is available for MODEL_TYPE='${MODEL_TYPE}'. Ensure Copilot Chat is enabled.`
// 		);
// 		return;
// 	}

// 	const tools = collectAvailableTools(context);

// 	const finalText = await runAgenticLoop({
// 		model, tools, snapshot, context, focus, request, token, stream,
// 	});

// 	if (finalText === undefined) return;
// 	await renderAgentResponse(finalText, snapshot, focus, stream);
// }

// // ===========================================================================
// // User focus resolution — WHICH function does the user care about?
// // ===========================================================================

// interface UserFocus {
// 	name: string | null;
// 	snippet: string | null;
// 	origin: "sym-reference" | "plain-mention" | "editor-selection" | "none";
// }

// function resolveUserFocus(
// 	snapshot: ChatContextSnapshot,
// 	context: AgentContext
// ): UserFocus {
// 	const symRefs = extractSymbolMentions(snapshot.userPrompt);
// 	if (symRefs.length > 0 && context.code.present) {
// 		const name = symRefs[0];
// 		const snippet = sliceNamedDeclaration(context.code.text, name);
// 		if (snippet) {
// 			return { name, snippet, origin: "sym-reference" };
// 		}
// 	}

// 	if (context.code.present) {
// 		const name = extractNameFromPlainPrompt(snapshot.userPrompt, context.code.text);
// 		if (name) {
// 			const snippet = sliceNamedDeclaration(context.code.text, name);
// 			if (snippet) {
// 				return { name, snippet, origin: "plain-mention" };
// 			}
// 		}
// 	}

// 	if (snapshot.codeContextKind === "selected" && snapshot.selectedOrFullCode.trim()) {
// 		return { name: null, snippet: snapshot.selectedOrFullCode, origin: "editor-selection" };
// 	}

// 	return { name: null, snippet: null, origin: "none" };
// }

// function extractSymbolMentions(prompt: string): string[] {
// 	return [...prompt.matchAll(/#sym:([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
// }

// function extractNameFromPlainPrompt(prompt: string, sourceCode: string): string | null {
// 	const candidates = [...prompt.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)].map((m) => m[1]);
// 	if (candidates.length === 0) return null;

// 	const topLevelNames = collectTopLevelNames(sourceCode);
// 	for (const cand of candidates) {
// 		if (topLevelNames.has(cand)) return cand;
// 	}
// 	return null;
// }

// function collectTopLevelNames(sourceCode: string): Set<string> {
// 	const sf = ts.createSourceFile("src.tsx", sourceCode, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
// 	const names = new Set<string>();

// 	for (const stmt of sf.statements) {
// 		if (ts.isFunctionDeclaration(stmt) && stmt.name) {
// 			names.add(stmt.name.text);
// 		} else if (ts.isClassDeclaration(stmt) && stmt.name) {
// 			names.add(stmt.name.text);
// 		} else if (ts.isVariableStatement(stmt)) {
// 			for (const d of stmt.declarationList.declarations) {
// 				if (ts.isIdentifier(d.name)) names.add(d.name.text);
// 			}
// 		}
// 	}
// 	return names;
// }

// function sliceNamedDeclaration(sourceCode: string, name: string): string | null {
// 	const sf = ts.createSourceFile("src.tsx", sourceCode, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
// 	for (const stmt of sf.statements) {
// 		if (matchesName(stmt, name)) {
// 			return sourceCode.slice(stmt.getStart(sf), stmt.getEnd());
// 		}
// 	}
// 	return null;
// }

// // ===========================================================================
// // Context collection
// // ===========================================================================

// interface AgentContext {
// 	code: { text: string; present: boolean; reason?: string };
// 	diagramJson: { text: string; present: boolean; reason?: string };
// 	diagramImage: { part?: vscode.LanguageModelDataPart; present: boolean; reason?: string };
// 	hasAnything: boolean;
// }

// async function collectAgentContext(snapshot: ChatContextSnapshot): Promise<AgentContext> {
// 	const codeOnScreen =
// 		snapshot.codeContextKind !== "none" &&
// 		snapshot.selectedOrFullCode.trim().length > 0;

// 	const code: AgentContext["code"] = CONFIG.code && codeOnScreen
// 		? { text: snapshot.selectedOrFullCode, present: true }
// 		: {
// 			text: "",
// 			present: false,
// 			reason: !CONFIG.code ? "code is disabled in config" : "no code is open or selected",
// 		};

// 	const diagramOnScreen = snapshot.diagramContext.availability !== "unavailable";
// 	const diagramJson: AgentContext["diagramJson"] = CONFIG.diagramJson && diagramOnScreen
// 		? { text: snapshot.diagramContext.json, present: true }
// 		: {
// 			text: "",
// 			present: false,
// 			reason: !CONFIG.diagramJson ? "diagram JSON is disabled in config" : "no activity diagram is open",
// 		};

// 	// Image acquisition with detailed diagnostics so we can see WHY it's missing.
// 	let imagePart: vscode.LanguageModelDataPart | undefined;
// 	let imageFailureReason: string | undefined;

// 	if (!CONFIG.diagramImage) {
// 		imageFailureReason = "diagram image is disabled in config";
// 	} else if (!diagramOnScreen) {
// 		imageFailureReason = "no diagram is open, so nothing to capture";
// 	} else {
// 		console.log("[chat] Starting diagram image capture...");
// 		const captureResult = await captureDiagramImageWithDiagnostics();
// 		console.log("[chat] Capture result:", {
// 			hasDataUrl: !!captureResult.dataUrl,
// 			dataUrlLength: captureResult.dataUrl?.length ?? 0,
// 			reason: captureResult.reason,
// 		});

// 		if (captureResult.dataUrl) {
// 			imagePart = dataUrlToImagePart(captureResult.dataUrl);
// 			if (!imagePart) {
// 				imageFailureReason = "data URL received but could not be parsed into an image";
// 			}
// 		} else {
// 			imageFailureReason = captureResult.reason ?? "unknown capture failure";
// 		}
// 	}

// 	const diagramImage: AgentContext["diagramImage"] = imagePart
// 		? { part: imagePart, present: true }
// 		: { present: false, reason: imageFailureReason };

// 	return {
// 		code, diagramJson, diagramImage,
// 		hasAnything: code.present || diagramJson.present || diagramImage.present,
// 	};
// }

// function describeMissing(context: AgentContext): string {
// 	const parts: string[] = [];
// 	if (!context.code.present && context.code.reason) parts.push(`Code: ${context.code.reason}.`);
// 	if (!context.diagramJson.present && context.diagramJson.reason) parts.push(`Diagram: ${context.diagramJson.reason}.`);
// 	return parts.join(" ");
// }

// function collectAvailableTools(context: AgentContext): vscode.LanguageModelChatTool[] {
// 	if (!CONFIG.allowToolCall) return [];

// 	const toolNames = [
// 		DIAGRAM_TOOL_NAME,
// 		CODE_FROM_DIAGRAM_TOOL_NAME,
// 	];

// 	return vscode.lm.tools.filter((tool) => toolNames.includes(tool.name));
// }
// // ===========================================================================
// // Agentic loop
// // ===========================================================================

// interface AgenticLoopArgs {
// 	model: vscode.LanguageModelChat;
// 	tools: vscode.LanguageModelChatTool[];
// 	snapshot: ChatContextSnapshot;
// 	context: AgentContext;
// 	focus: UserFocus;
// 	request: vscode.ChatRequest;
// 	token: vscode.CancellationToken;
// 	stream: vscode.ChatResponseStream;
// }

// async function runAgenticLoop(args: AgenticLoopArgs): Promise<string | undefined> {
// 	const { model, tools, snapshot, context, focus, request, token, stream } = args;

// 	const messages: vscode.LanguageModelChatMessage[] = [
// 		vscode.LanguageModelChatMessage.User(buildSystemPrompt()),
// 		vscode.LanguageModelChatMessage.User(buildInitialUserParts(snapshot, context, focus)),
// 	];

// 	const hasTools = tools.length > 0;

// 	const allowedToolNames = new Set([
// 		DIAGRAM_TOOL_NAME,
// 		CODE_FROM_DIAGRAM_TOOL_NAME,
// 	]);

// 	for (let iteration = 0; iteration < CONFIG.maxToolIterations + 1; iteration++) {
// 		const isLastIteration = iteration === CONFIG.maxToolIterations;

// 		const options: vscode.LanguageModelChatRequestOptions =
// 			hasTools && !isLastIteration
// 				? { tools, toolMode: vscode.LanguageModelChatToolMode.Auto }
// 				: {};

// 		const result = await streamOnce(model, messages, options, token, stream);

// 		if (!result.ok) {
// 			return undefined;
// 		}

// 		if (!result.toolCall) {
// 			return result.text;
// 		}

// 		if (!allowedToolNames.has(result.toolCall.name)) {
// 			return result.text || "The model requested an unknown tool. Please try again.";
// 		}

// 		const isDiagramTool = result.toolCall.name === DIAGRAM_TOOL_NAME;
// 		const isCodeTool = result.toolCall.name === CODE_FROM_DIAGRAM_TOOL_NAME;

// 		stream.markdown(
// 			isDiagramTool
// 				? "Generating diagram...\n\n"
// 				: "Generating code from diagram...\n\n"
// 		);

// 		const toolInput: Record<string, unknown> = isDiagramTool
// 			? buildDiagramToolInput(snapshot, focus, result.toolCall.input)
// 			: isRecord(result.toolCall.input)
// 				? result.toolCall.input
// 				: {};

// 		let toolResult: vscode.LanguageModelToolResult;

// 		try {
// 			toolResult = await vscode.lm.invokeTool(
// 				result.toolCall.name,
// 				{
// 					input: toolInput,
// 					toolInvocationToken: request.toolInvocationToken,
// 				},
// 				token
// 			);
// 		} catch (err) {
// 			const msg = err instanceof Error ? err.message : String(err);
// 			stream.markdown(`❌ Tool invocation failed: \`${msg}\``);
// 			return undefined;
// 		}

// 		await delay(750);

// 		const refreshed = await collectAgentContext(snapshot);

// 		const mergedResultContent = mergeToolResultWithFollowUp(
// 			toolResult,
// 			buildToolFollowUpText(refreshed),
// 			refreshed.diagramImage.part
// 		);

// 		messages.push(
// 			vscode.LanguageModelChatMessage.Assistant([result.toolCall]),
// 			vscode.LanguageModelChatMessage.User([
// 				new vscode.LanguageModelToolResultPart(
// 					result.toolCall.callId,
// 					mergedResultContent
// 				),
// 			])
// 		);
// 	}

// 	return "I wasn't able to complete the request.";
// }

// // ===========================================================================
// // Streaming one model turn
// // ===========================================================================

// type StreamOnceResult =
// 	| { ok: true; text: string; toolCall?: vscode.LanguageModelToolCallPart }
// 	| { ok: false };

// async function streamOnce(
// 	model: vscode.LanguageModelChat,
// 	messages: vscode.LanguageModelChatMessage[],
// 	options: vscode.LanguageModelChatRequestOptions,
// 	token: vscode.CancellationToken,
// 	stream: vscode.ChatResponseStream
// ): Promise<StreamOnceResult> {
// 	let response: vscode.LanguageModelChatResponse;
// 	try {
// 		response = await model.sendRequest(messages, options, token);
// 	} catch (err) {
// 		const msg = err instanceof Error ? err.message : String(err);
// 		stream.markdown(`❌ Model request failed: \`${msg}\``);
// 		return { ok: false };
// 	}

// 	const textParts: string[] = [];
// 	let toolCall: vscode.LanguageModelToolCallPart | undefined;

// 	try {
// 		for await (const part of response.stream) {
// 			if (part instanceof vscode.LanguageModelTextPart) {
// 				textParts.push(part.value);
// 			} else if (part instanceof vscode.LanguageModelToolCallPart) {
// 				toolCall = part;
// 			}
// 		}
// 	} catch (err) {
// 		const msg = err instanceof Error ? err.message : String(err);
// 		stream.markdown(`❌ Stream error: \`${msg}\``);
// 		return { ok: false };
// 	}

// 	return { ok: true, text: textParts.join(""), toolCall };
// }

// // ===========================================================================
// // Prompt construction
// // ===========================================================================

// function buildSystemPrompt(): string {
// 	return [
// 		"Role: expert assistant for TypeScript, TSX, and activity diagrams.",
// 		`Respond in: ${RESPONSE_LANGUAGE}.`,
// 		"",
// 		"Decide the appropriate response type from the user's prompt:",
// 		"",
// 		"1. REFACTOR — the user asks to refactor, rewrite, restructure, or clean up code.",
// 		"   Return refactored code inside a single fenced code block (```typescript ... ```).",
// 		"   The block is applied directly to the file, so it must contain ONLY valid code —",
// 		"   no comments like '// rest unchanged'.",
// 		"   If a `FOCUS` section is provided, return ONLY that focused code.",
// 		"   Otherwise return the full code you were given.",
// 		"   Preserve behavior unless the user explicitly asks to change it.",
// 		"",
// 		"   If the user ALSO asks for explanation: put the code block FIRST, then prose after.",
// 		"   Use at most ONE code block total.",
// 		"",
// 		"2. EXPLANATION / ANALYSIS — the user asks to explain, analyze, compare, or find issues.",
// 		"   Answer in prose. No code block unless showing a very short example.",
// 		"",
// 		"3. TOOLS — you have two tools available. Pick the right one based on the user's intent:",
// 		"",
// 		`   a) ${DIAGRAM_TOOL_NAME}`,
// 		"      Use when the user wants to CREATE, GENERATE, SHOW, VISUALIZE, or DRAW",
// 		"      an activity diagram FROM CODE.",
// 		"      Examples: 'create a diagram', 'show flow', 'visualize this function'.",
// 		"      If a `FOCUS` section is present, pass ONLY that focused code as `sourceText`.",
// 		"      Do NOT pass the entire file when the user asked about a specific function.",
// 		"",
// 		`   b) ${CODE_FROM_DIAGRAM_TOOL_NAME}`,
// 		"      Use when the user wants to GENERATE, CREATE, PRODUCE, or BUILD CODE",
// 		"      FROM THE EXISTING ACTIVITY DIAGRAM. The activity diagram is already",
// 		"      rendered on screen; the user wants its TypeScript equivalent.",
// 		"      Examples: 'generate code from this diagram', 'turn the diagram into code',",
// 		"      'create a skeleton from the diagram', 'give me the code for this diagram'.",
// 		"      Do NOT try to write this code yourself — the tool does it deterministically.",
// 		"      This tool takes no required input; just call it.",
// 		"",
// 		"Rules:",
// 		"- A `FOCUS` section always takes precedence over the full file.",
// 		"- Do not assume anything not explicitly provided.",
// 		"- Answer strictly what the user asked — nothing more, nothing less.",
// 	].join("\n");
// }

// function buildInitialUserParts(
// 	snapshot: ChatContextSnapshot,
// 	context: AgentContext,
// 	focus: UserFocus
// ): Array<vscode.LanguageModelTextPart | vscode.LanguageModelDataPart> {
// 	const lines: string[] = [
// 		`User prompt: ${snapshot.userPrompt}`,
// 		"",
// 		`File: ${snapshot.activeFilePath ?? "<none>"}`,
// 		`Code context kind: ${snapshot.codeContextKind}`,
// 	];

// 	if (focus.snippet) {
// 		lines.push(
// 			"",
// 			`FOCUS — the user is asking about this${focus.name ? ` (${focus.name})` : ""}:`,
// 			"```typescript",
// 			focus.snippet,
// 			"```"
// 		);
// 	}

// 	if (context.code.present) {
// 		lines.push(
// 			"",
// 			focus.snippet ? "Full file (for surrounding context only):" : "Available code:",
// 			"```typescript",
// 			context.code.text,
// 			"```"
// 		);
// 	} else {
// 		lines.push("", "Available code: <none>");
// 	}

// 	if (context.diagramJson.present) {
// 		lines.push("", "Available activity diagram JSON:", context.diagramJson.text);
// 	} else {
// 		lines.push("", "Available activity diagram JSON: <none>");
// 	}

// 	lines.push(
// 		"",
// 		context.diagramImage.present
// 			? "A rendered diagram image is attached below."
// 			: "Rendered diagram image: <none>"
// 	);

// 	const parts: Array<vscode.LanguageModelTextPart | vscode.LanguageModelDataPart> = [
// 		new vscode.LanguageModelTextPart(lines.join("\n")),
// 	];
// 	if (context.diagramImage.part) parts.push(context.diagramImage.part);
// 	return parts;
// }

// function buildToolFollowUpText(refreshed: AgentContext): string {
// 	return [
// 		"",
// 		"---",
// 		"Refreshed diagram context after the tool ran:",
// 		refreshed.diagramJson.present
// 			? "Diagram JSON:\n" + refreshed.diagramJson.text
// 			: "Diagram JSON: <still unavailable>",
// 		"",
// 		refreshed.diagramImage.present
// 			? "A rendered diagram image is attached below."
// 			: "Rendered diagram image: <still unavailable>",
// 		"",
// 		"Now finish the user's original request using this refreshed context.",
// 	].join("\n");
// }

// function mergeToolResultWithFollowUp(
// 	toolResult: vscode.LanguageModelToolResult,
// 	followUpText: string,
// 	imagePart?: vscode.LanguageModelDataPart
// ): Array<vscode.LanguageModelTextPart | vscode.LanguageModelDataPart> {
// 	const merged: Array<vscode.LanguageModelTextPart | vscode.LanguageModelDataPart> = [
// 		...(toolResult.content as Array<vscode.LanguageModelTextPart | vscode.LanguageModelDataPart>),
// 		new vscode.LanguageModelTextPart(followUpText),
// 	];
// 	if (imagePart) merged.push(imagePart);
// 	return merged;
// }

// function buildDiagramToolInput(
// 	snapshot: ChatContextSnapshot,
// 	focus: UserFocus,
// 	modelProposedInput: unknown
// ): Record<string, unknown> {
// 	if (focus.snippet) {
// 		return {
// 			sourceText: focus.snippet,
// 			title: focus.name
// 				? `Activity Diagram - ${focus.name}`
// 				: "Activity Diagram - Selected Code",
// 		};
// 	}

// 	if (isRecord(modelProposedInput)) {
// 		const proposedSource = modelProposedInput.sourceText;
// 		if (typeof proposedSource === "string" && proposedSource.trim().length > 0) {
// 			return {
// 				sourceText: proposedSource,
// 				title:
// 					typeof modelProposedInput.title === "string" && modelProposedInput.title.trim()
// 						? modelProposedInput.title
// 						: "Activity Diagram - Proposed by Agent",
// 			};
// 		}
// 	}

// 	if (snapshot.selectedOrFullCode.trim().length > 0) {
// 		return {
// 			sourceText: snapshot.selectedOrFullCode,
// 			title: snapshot.activeFilePath
// 				? `Activity Diagram - ${snapshot.activeFilePath.split(/[\\/]/).pop()}`
// 				: "Activity Diagram - Whole File",
// 		};
// 	}

// 	return { wholeFile: true, title: "Activity Diagram - Whole File" };
// }

// function isRecord(value: unknown): value is Record<string, unknown> {
// 	return typeof value === "object" && value !== null;
// }

// // ===========================================================================
// // Response rendering
// // ===========================================================================

// async function renderAgentResponse(
// 	text: string,
// 	snapshot: ChatContextSnapshot,
// 	focus: UserFocus,
// 	stream: vscode.ChatResponseStream
// ): Promise<void> {
// 	if (!text.trim()) {
// 		stream.markdown(
// 			"The model didn't return any text. This usually means the combined context " +
// 			"(code + diagram JSON + images) is too large. Try selecting a smaller portion of code, " +
// 			"or disable `diagramImage` in CONFIG."
// 		);
// 		return;
// 	}

// 	const refactor = extractRefactorBlock(text);
// 	if (!refactor) {
// 		stream.markdown(text);
// 		return;
// 	}

// 	const location = focus.name
// 		? locateNamedDeclaration(snapshot.selectedOrFullCode, focus.name)
// 		: locateFunctionInSource(snapshot.selectedOrFullCode, refactor.code);

// 	if (refactor.before) stream.markdown(refactor.before + "\n\n");

// 	stream.markdown(
// 		location.matched
// 			? `### Refactored \`${location.name}\`:\n`
// 			: "### Refactored code:\n"
// 	);
// 	stream.markdown("```typescript\n" + refactor.code + "\n```\n\n");

// 	if (refactor.after) stream.markdown(refactor.after + "\n\n");

// 	stream.button({
// 		command: "vs-code-ext.applyRefactor",
// 		title: "$(check) Apply changes",
// 		arguments: [
// 			snapshot.activeFilePath,
// 			snapshot.codeContextKind,
// 			refactor.code,
// 			location.startLine,
// 			location.endLine,
// 		],
// 	});

// 	stream.button({
// 		command: "vs-code-ext.showRefactorDiff",
// 		title: "$(diff) Show diff",
// 		arguments: [snapshot.activeFilePath, snapshot.codeContextKind, refactor.code],
// 	});
// }

// interface RefactorBlock { code: string; before: string; after: string; }

// function extractRefactorBlock(text: string): RefactorBlock | null {
// 	const pattern = /```(?:tsx?|jsx?|javascript|typescript)?\s*\n([\s\S]*?)```/gi;
// 	const matches = [...text.matchAll(pattern)];
// 	if (matches.length !== 1) return null;

// 	const match = matches[0];
// 	const code = match[1].trim();
// 	if (!looksLikeRealCode(code)) return null;

// 	const blockStart = match.index ?? 0;
// 	const blockEnd = blockStart + match[0].length;

// 	return {
// 		code,
// 		before: text.slice(0, blockStart).trim(),
// 		after: text.slice(blockEnd).trim(),
// 	};
// }

// function looksLikeRealCode(code: string): boolean {
// 	try {
// 		const sf = ts.createSourceFile("snippet.tsx", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
// 		return sf.statements.some(
// 			(s) =>
// 				ts.isFunctionDeclaration(s) ||
// 				ts.isClassDeclaration(s) ||
// 				ts.isInterfaceDeclaration(s) ||
// 				ts.isTypeAliasDeclaration(s) ||
// 				ts.isVariableStatement(s) ||
// 				ts.isImportDeclaration(s) ||
// 				ts.isExportDeclaration(s)
// 		);
// 	} catch {
// 		return false;
// 	}
// }

// // ===========================================================================
// // Code location via TypeScript AST
// // ===========================================================================

// interface LocationResult {
// 	matched: boolean;
// 	name?: string;
// 	startLine: number | null;
// 	endLine: number | null;
// }

// function locateFunctionInSource(sourceCode: string, refactoredCode: string): LocationResult {
// 	const name = extractTopLevelName(refactoredCode);
// 	if (!name) return { matched: false, startLine: null, endLine: null };
// 	return locateNamedDeclaration(sourceCode, name);
// }

// function locateNamedDeclaration(sourceCode: string, name: string): LocationResult {
// 	const range = findNamedDeclarationRange(sourceCode, name);
// 	if (!range) return { matched: false, name, startLine: null, endLine: null };
// 	return { matched: true, name, startLine: range.startLine, endLine: range.endLine };
// }

// function extractTopLevelName(code: string): string | null {
// 	const sf = ts.createSourceFile("snippet.tsx", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

// 	for (const stmt of sf.statements) {
// 		if (ts.isFunctionDeclaration(stmt) && stmt.name) return stmt.name.text;
// 		if (ts.isVariableStatement(stmt)) {
// 			const decl = stmt.declarationList.declarations[0];
// 			if (
// 				decl &&
// 				ts.isIdentifier(decl.name) &&
// 				decl.initializer &&
// 				(ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))
// 			) {
// 				return decl.name.text;
// 			}
// 		}
// 		if (ts.isClassDeclaration(stmt) && stmt.name) return stmt.name.text;
// 	}
// 	return null;
// }

// function findNamedDeclarationRange(
// 	sourceCode: string,
// 	name: string
// ): { startLine: number; endLine: number } | null {
// 	const sf = ts.createSourceFile("src.tsx", sourceCode, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

// 	for (const stmt of sf.statements) {
// 		if (matchesName(stmt, name)) {
// 			const start = sf.getLineAndCharacterOfPosition(stmt.getStart(sf)).line;
// 			const end = sf.getLineAndCharacterOfPosition(stmt.getEnd()).line;
// 			return { startLine: start, endLine: end };
// 		}
// 	}
// 	return null;
// }

// function matchesName(stmt: ts.Statement, name: string): boolean {
// 	if (ts.isFunctionDeclaration(stmt) && stmt.name?.text === name) return true;
// 	if (ts.isClassDeclaration(stmt) && stmt.name?.text === name) return true;
// 	if (ts.isVariableStatement(stmt)) {
// 		return stmt.declarationList.declarations.some(
// 			(d) => ts.isIdentifier(d.name) && d.name.text === name
// 		);
// 	}
// 	return false;
// }

// // ===========================================================================
// // Snapshot collection
// // ===========================================================================

// async function collectChatSnapshot(userPrompt: string): Promise<ChatContextSnapshot> {
// 	const document = pickPreferredDocument();
// 	const editor = document ? findEditorFor(document) : undefined;
// 	const hasSelection = Boolean(editor && !editor.selection.isEmpty);

// 	const selectedOrFullCode = !document
// 		? ""
// 		: hasSelection
// 			? editor!.document.getText(editor!.selection)
// 			: document.getText();

// 	const codeContextKind: ChatContextSnapshot["codeContextKind"] = !document
// 		? "none"
// 		: hasSelection
// 			? "selected"
// 			: "full-file";

// 	return {
// 		userPrompt,
// 		activeFilePath: document?.uri.fsPath,
// 		selectedOrFullCode,
// 		codeContextKind,
// 		diagramContext: await readCurrentDiagramContext(),
// 	};
// }

// function pickPreferredDocument(): vscode.TextDocument | undefined {
// 	const panelDoc = getPanelSourceDocument();
// 	if (panelDoc && isSupportedCodeFile(panelDoc)) return panelDoc;

// 	const active = vscode.window.activeTextEditor?.document;
// 	if (active && isSupportedCodeFile(active)) return active;

// 	const visible = vscode.window.visibleTextEditors
// 		.map((e) => e.document)
// 		.find(isSupportedCodeFile);
// 	if (visible) return visible;

// 	return vscode.workspace.textDocuments.find(isSupportedCodeFile);
// }

// function getPanelSourceDocument(): vscode.TextDocument | undefined {
// 	const panelClass = ComponentActivityPanel as typeof ComponentActivityPanel & {
// 		getCurrentSourceDocument?: () => vscode.TextDocument | undefined;
// 	};
// 	return panelClass.getCurrentSourceDocument?.();
// }

// function findEditorFor(document: vscode.TextDocument): vscode.TextEditor | undefined {
// 	const active = vscode.window.activeTextEditor;
// 	if (active && active.document.uri.toString() === document.uri.toString()) return active;
// 	return vscode.window.visibleTextEditors.find(
// 		(e) => e.document.uri.toString() === document.uri.toString()
// 	);
// }

// function isSupportedCodeFile(document: vscode.TextDocument | undefined): boolean {
// 	if (!document || document.uri.scheme !== "file") return false;
// 	const p = document.uri.fsPath.toLowerCase();
// 	return p.endsWith(".ts") || p.endsWith(".tsx") || p.endsWith(".js") || p.endsWith(".jsx");
// }

// // ===========================================================================
// // Diagram helpers
// // ===========================================================================

// async function readCurrentDiagramContext(): Promise<DiagramContext> {
// 	const panel = ComponentActivityPanel.currentPanel;

// 	let visibleGraph = ComponentActivityPanel.getCurrentVisibleActivityGraph();
// 	if (panel && !visibleGraph) {
// 		try {
// 			const refreshed = await panel.refreshVisibleGraph(2500);
// 			if (refreshed) {
// 				visibleGraph = { nodes: [...refreshed.nodes], edges: [...refreshed.edges] };
// 			}
// 		} catch {
// 		}
// 	}

// 	if (visibleGraph) {
// 		return buildDiagramContext("available-visible", visibleGraph.nodes, visibleGraph.edges);
// 	}

// 	const parsedGraph = ComponentActivityPanel.getCurrentActivityGraph();
// 	if (parsedGraph) {
// 		return buildDiagramContext("available-visible", parsedGraph.nodes, parsedGraph.edges);
// 	}

// 	return {
// 		availability: "unavailable",
// 		json: JSON.stringify(
// 			{
// 				warning: "No visible activity diagram context is available. Open the activity diagram panel first.",
// 				nodes: [], edges: [],
// 			},
// 			null, 2
// 		),
// 		nodeCount: 0, edgeCount: 0, nodeTypes: [],
// 		warning: "No visible activity diagram context is available.",
// 	};
// }

// function buildDiagramContext(
// 	availability: DiagramContext["availability"],
// 	nodes: unknown[],
// 	edges: unknown[]
// ): DiagramContext {
// 	const nodeTypes = Array.from(
// 		new Set(
// 			nodes
// 				.map((node) => {
// 					if (!node || typeof node !== "object") return "unknown";
// 					const maybeType = (node as { type?: unknown }).type;
// 					return typeof maybeType === "string" && maybeType.trim() ? maybeType : "unknown";
// 				})
// 				.filter((v) => v !== "unknown")
// 		)
// 	).sort((a, b) => a.localeCompare(b));

// 	return {
// 		availability,
// 		json: JSON.stringify({ nodes, edges }, null, 2),
// 		nodeCount: nodes.length,
// 		edgeCount: edges.length,
// 		nodeTypes,
// 	};
// }

// /**
//  * Captures the diagram image from the webview with detailed diagnostics.
//  *
//  * There are several reasons this can fail, and we want to know which:
//  *   1. No panel exists (user never opened the diagram).
//  *   2. Panel exists but webview hasn't booted yet.
//  *   3. Panel exists, webview is ready, but `toPng` in the webview returned nothing
//  *      (usually because React Flow contains external images, or rendering is slow).
//  *   4. The request timed out waiting for the webview's response.
//  */
// interface CaptureResult {
// 	dataUrl?: string;
// 	reason?: string;
// }

// async function captureDiagramImageWithDiagnostics(): Promise<CaptureResult> {
// 	const panel = ComponentActivityPanel.currentPanel;
// 	if (!panel) {
// 		return { reason: "diagram panel is not open" };
// 	}

// 	try {
// 		const dataUrl = await panel.requestDiagramImageDataUrl(CONFIG.diagramImageTimeoutMs);
// 		if (!dataUrl) {
// 			return { reason: "webview returned no image (timeout or toPng failed)" };
// 		}
// 		if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
// 			return { reason: `webview returned invalid data URL: ${String(dataUrl).slice(0, 80)}` };
// 		}
// 		return { dataUrl };
// 	} catch (err) {
// 		const msg = err instanceof Error ? err.message : String(err);
// 		return { reason: `panel.requestDiagramImageDataUrl threw: ${msg}` };
// 	}
// }

// function dataUrlToImagePart(dataUrl?: string): vscode.LanguageModelDataPart | undefined {
// 	if (!dataUrl) {
// 		console.log("[chat] dataUrlToImagePart: no dataUrl");
// 		return undefined;
// 	}
// 	const match = dataUrl.match(/^data:(.*?);base64,(.*)$/);
// 	if (!match) {
// 		console.log("[chat] dataUrlToImagePart: dataUrl does not match expected format");
// 		return undefined;
// 	}
// 	console.log("[chat] dataUrlToImagePart: creating image part, mime:", match[1], "base64 length:", match[2].length);
// 	return vscode.LanguageModelDataPart.image(
// 		new Uint8Array(Buffer.from(match[2], "base64")),
// 		match[1]
// 	);
// }

// // ===========================================================================
// // Misc helpers
// // ===========================================================================

// function isHelpPrompt(prompt: string): boolean {
// 	const n = prompt.trim().toLowerCase();
// 	return ["?", "help", "", "what"].includes(n);
// }

// function buildHelpText(): string {
// 	return [
// 		"### What you can ask",
// 		"- @diagram explain this flow",
// 		"- @diagram analyze diagram",
// 		"- @diagram compare code and diagram",
// 		"- @diagram find inconsistencies",
// 		"- @diagram refactor this code",
// 		"- @diagram refactor #sym:functionName",
// 		"- @diagram create a diagram out of #sym:functionName",
// 		"",
// 	].join("\n");
// }

// function delay(ms: number): Promise<void> {
// 	return new Promise((r) => setTimeout(r, ms));
// }

// function printDebug(
// 	stream: vscode.ChatResponseStream,
// 	snapshot: ChatContextSnapshot,
// 	context: AgentContext,
// 	focus: UserFocus
// ): void {
// 	stream.markdown(
// 		[
// 			"### Debug",
// 			"**Config:**",
// 			`- code: ${CONFIG.code}`,
// 			`- diagramJson: ${CONFIG.diagramJson}`,
// 			`- diagramImage: ${CONFIG.diagramImage}`,
// 			`- diagramImageTimeoutMs: ${CONFIG.diagramImageTimeoutMs}`,
// 			`- allowToolCall: ${CONFIG.allowToolCall}`,
// 			`- maxToolIterations: ${CONFIG.maxToolIterations}`,
// 			"",
// 			"**Snapshot:**",
// 			`- active file: ${snapshot.activeFilePath ?? "<none>"}`,
// 			`- code context kind: ${snapshot.codeContextKind}`,
// 			`- code length on screen: ${snapshot.selectedOrFullCode.length}`,
// 			`- diagram availability: ${snapshot.diagramContext.availability}`,
// 			"",
// 			"**Focus:**",
// 			`- origin: ${focus.origin}`,
// 			`- name: ${focus.name ?? "<none>"}`,
// 			`- snippet length: ${focus.snippet?.length ?? 0}`,
// 			"",
// 			"**Sent to agent:**",
// 			`- code: ${context.code.present ? "yes" : "no"}${context.code.reason ? ` (${context.code.reason})` : ""}`,
// 			`- diagram JSON: ${context.diagramJson.present ? "yes" : "no"}`,
// 			`- diagram image: ${context.diagramImage.present ? "yes" : "no"}${context.diagramImage.reason ? ` (${context.diagramImage.reason})` : ""}`,
// 			"",
// 		].join("\n")
// 	);
// }