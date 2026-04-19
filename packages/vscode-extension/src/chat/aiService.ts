import * as vscode from "vscode";
import {EnrichSkeletonInput} from "./types";
import {selectModelByType, MODEL_TYPE} from "./utils";


export async function enrichSkeletonWithDiagram(input: EnrichSkeletonInput): Promise<string> {
	const model = await selectModelByType(MODEL_TYPE);
	if (!model) {
		throw new Error("No Copilot model available.");
	}
    console.log(input)
	const messages: vscode.LanguageModelChatMessage[] = [
		vscode.LanguageModelChatMessage.User([
			"You are an expert TypeScript assistant.",
			"Refactor and complete the generated TypeScript skeleton from the provided activity diagram.",
			"Preserve the flow implied by the diagram.",
			"Implement meaningful structure and control flow, not just wrappers around existing skeleton text.",
			"Fill method bodies with practical safe defaults and TODOs only where business logic is unknown.",
			"Add useful interfaces, types, guard clauses, and method signatures where appropriate.",
			"Do not wrap output in markdown, backticks, or quotes.",
			"Do not return markdown fences.",
			"Return code only. At the end of the code, include a comment with the format: // thought process: <brief explanation of how you interpreted the diagram and generated the code>",
		].join("\n")),
		vscode.LanguageModelChatMessage.User([
			`Active file: ${input.activeFilePath ?? "<no active file>"}`,
			"",
			"Generated skeleton:",
			input.code,
			"",
			"Activity diagram JSON:",
			input.diagramContext.json
		].join("\n"))
	];

	const response = await model.sendRequest(messages, {}, input.token);
    vscode.window.showInformationMessage("Generating enriched skeleton from diagram...");

	let text = "";
	for await (const part of response.text) {
		text += part;
	}
    vscode.window.showInformationMessage("Code generation completed.");
	return text.trim();
}
