import { LanguageModelChatMessage } from "vscode";
import { componentStateCache } from "@/app@utils/cache";
import { BaseChatContext, BaseChatParticipant } from "../BaseChatParticipant";

export type StateDiagramChatContext = BaseChatContext & {
	codeContextKind: "full-file";

	currentDiagramJson?: string;
	currentDiagramImageUrl?; // TODO type that AI can understand
};

export class StateDiagramParticipant extends BaseChatParticipant<StateDiagramChatContext> {
	override getChatContext(userPrompt: string): Promise<StateDiagramChatContext> {
		throw new Error("Method not implemented.");
		
	}

	override buildLanguageModelMessages(context: StateDiagramChatContext, promptWasVague: boolean): LanguageModelChatMessage[] {
		throw new Error("Method not implemented.");
	}

	override buildContextHeader(snapshot: StateDiagramChatContext): string {
		throw new Error("Method not implemented.");
	}
}