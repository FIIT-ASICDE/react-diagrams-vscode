import * as vscode from "vscode";
import { ChatContext, ChatResponseStream, CancellationToken, ChatRequest, ProviderResult, ChatResult } from "vscode";

export function isPromptHelp(prompt: string): boolean {
	const normalized = prompt.trim().toLowerCase();
	return ["?", "help", "", "what"].includes(normalized);
}

export type ContextDataStatus = "available" | "disabled" | "unavailable" | "unobtainable";

export type ContextData<T> =
	| { status: "available"; data: T }
	| { status: Exclude<ContextDataStatus, "available"> };

export function contextAvailable<T>(data: T): ContextData<T> {
	return { status: "available", data };
}

export function contextStatus<T>(status: Exclude<ContextDataStatus, "available">): ContextData<T> {
	return { status };
}

export function isContextAvailable<T>(value: ContextData<T>): value is { status: "available"; data: T } {
	return value.status == "available";
}

export const statusTag = (status: ContextDataStatus): string => `<${status}>`;

export type BaseChatContext = {
	userPrompt: string;
	currentFilePath?: string;
	currentCodeOrSelection: ContextData<string>;
	codeContextKind: "selected" | "full-file";
};

export abstract class BaseChatParticipant<C extends BaseChatContext> {
	constructor(
		public readonly id: string = 'vs-code-ext.diagram',
		public readonly modelType: string = 'copilot',
		public readonly responseLanguage: string = 'English',
	) 
	{ }

	register(context: vscode.ExtensionContext, icon = "graph-line"): vscode.Disposable {
		const participant = vscode.chat.createChatParticipant(this.id, async (request, _chatContext, stream, token) => this.handleCreateChatParticipant(request, _chatContext, stream, token));

		participant.iconPath = new vscode.ThemeIcon(icon);
		context.subscriptions.push(participant);
		return participant;
	}

	async handleCreateChatParticipant(request: ChatRequest, _chatContext: ChatContext, response: ChatResponseStream, token: CancellationToken): Promise<ProviderResult<ChatResult | void>> {
		const promptWasVague = isPromptHelp(request.prompt);
		if (promptWasVague) {
			response.markdown(this.buildCapabilitiesIntro());
			return;
		}

		const snapshot = await this.getChatContext(request.prompt);

		response.markdown(this.buildContextHeader(snapshot));

		const model = await this.selectModelByType(this.modelType);
		if (!model) {
			response.markdown(`No chat model is available for MODEL_TYPE='${this.modelType}'. Ensure Copilot Chat is enabled and the configured model is accessible.`);
			return;
		}

		const messages = this.buildLanguageModelMessages(snapshot, promptWasVague);
		const modelResponse = await model.sendRequest(messages, {}, token);

		for await (const part of modelResponse.text) {
			response.markdown(part);
		}
	}

	async selectModelByType(modelType: string): Promise<vscode.LanguageModelChat | undefined> {
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

	buildCapabilitiesIntro(): string {
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

	abstract getChatContext(userPrompt: string): Promise<C>;

	abstract buildLanguageModelMessages(context: C, promptWasVague: boolean): vscode.LanguageModelChatMessage[];

	abstract buildContextHeader(snapshot: C): string;
}