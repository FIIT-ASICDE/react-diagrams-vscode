import * as vscode from "vscode";
import { LanguageModelChatMessage, LanguageModelDataPart } from "vscode";
import type { StateDiagram } from "@react-diagrams/core";
import { componentStateCache } from "@/app@utils/cache";
import { ImageCacheEntry } from "@/app@utils/cache/parsing-cache";
import { ComponentStatePanel } from "@/app@panels/ComponentStatePanel";
import {
	BaseChatContext,
	BaseChatParticipant,
	ContextData,
	ContextDataStatus,
	contextAvailable,
	contextStatus,
	isContextAvailable,
	statusTag,
} from "../BaseChatParticipant";
import { getConfigOption } from "@/app@utils";

const getCapabilities = () => {
	const [capabilities = ["code"]] = getConfigOption<string[]>('state.diagram', 'chatParticipantCapabilities', ["code"]);
	return {
		code: capabilities.includes("code"),
		diagram: capabilities.includes("diagram"),
		diagramImage: capabilities.includes("diagramImage"),
	};
};

export type StateDiagramChatContext = BaseChatContext & {
	codeContextKind: "full-file";

	currentDiagram: ContextData<StateDiagram>;
	currentDiagramImage: ContextData<ImageCacheEntry>;
};

export class StateDiagramParticipant extends BaseChatParticipant<StateDiagramChatContext> {
	private async getDiagramImageEntry(): Promise<ContextData<ImageCacheEntry>> {
		const cached = componentStateCache.getImage();
		if (cached)
			return contextAvailable(cached);

		const requested = await ComponentStatePanel.current?.requestCurrentDiagramImage(false);
		if (requested === null)
			return contextStatus("unobtainable");
		if (requested === undefined)
			return contextStatus("unavailable");

		return contextAvailable(requested);
	}

	private async getDiagram(): Promise<ContextData<StateDiagram>> {
		const doc = componentStateCache.getCurrentDocument();
		const entry = componentStateCache.get(doc);
		if (!entry)
			return contextStatus("unavailable");

		try {
			const data = await entry.data;
			return contextAvailable(data as StateDiagram);
		} catch {
			return contextStatus("unavailable");
		}
	}

	override async getChatContext(userPrompt: string): Promise<StateDiagramChatContext> {
		const { code: codeEnabled, diagram: diagramEnabled, diagramImage: diagramImageEnabled } = getCapabilities();
		const doc = componentStateCache.getCurrentDocument();

		const codeData = !codeEnabled ? contextStatus<string>("disabled") : doc ? contextAvailable(doc.getText()) : contextStatus<string>("unavailable");
		const diagramData = diagramEnabled ? await this.getDiagram() : contextStatus<StateDiagram>("disabled");
		const imageData = diagramImageEnabled ? await this.getDiagramImageEntry() : contextStatus<ImageCacheEntry>("disabled");

		return {
			userPrompt,
			currentFilePath: doc?.uri.fsPath ?? statusTag("unavailable"),
			currentCodeOrSelection: codeData,
			codeContextKind: "full-file",
			currentDiagram: diagramData,
			currentDiagramImage: imageData,
		};
	}

	override buildLanguageModelMessages(context: StateDiagramChatContext, promptWasVague: boolean): LanguageModelChatMessage[] {
		const systemInstruction = [
			"Role: expert assistant for TypeScript, TSX, and React and State diagrams.",
			`Answer in: ${this.responseLanguage}.`,
			"Always analyze code together with the state diagram context.",
			"You can explain behavior, suggest refactors, compare code and diagram, and find potential state related issues.",
			"Always say whether and how the diagram influenced your answer.",
			"If code improvements would improve the resulting diagram, propose concrete code changes.",
			"Keep answers practical, structured, and implementation-focused.",
		].join("\n");

		const effectiveTask = promptWasVague
			? "Provide a short capabilities intro, suggest concrete next prompts, then give best-effort analysis from available context."
			: context.userPrompt;

		const modelDescription = "Diagram model shape: component = parsed component metadata; stateVariables = component state declarations; mutators = functions that mutate state with control-flow and update nodes.";

		const parts: Array<vscode.LanguageModelTextPart | vscode.LanguageModelDataPart> = [
			LanguageModelDataPart.text(systemInstruction),
			LanguageModelDataPart.text(`Task request: ${effectiveTask}`),
	
			// LanguageModelDataPart.text(this.buildContextHeader(context), "text/markdown"),
		];

		parts.push(LanguageModelDataPart.text(`Active file: ${context.currentFilePath || statusTag("unavailable")}`));

		if (isContextAvailable(context.currentCodeOrSelection)) {
			parts.push(LanguageModelDataPart.text("Code:"));
			parts.push(LanguageModelDataPart.text(context.currentCodeOrSelection.data));
		} else {
			parts.push(LanguageModelDataPart.text(`Code context: ${statusTag(context.currentCodeOrSelection.status)}`));
		}

		if (isContextAvailable(context.currentDiagram)) {
			parts.push(LanguageModelDataPart.text("State diagram (structured JSON object):"));
			parts.push(LanguageModelDataPart.text(modelDescription));
			parts.push(LanguageModelDataPart.json(context.currentDiagram.data));
		} else {
			parts.push(LanguageModelDataPart.text(`State diagram: ${statusTag(context.currentDiagram.status)}`));
		}

		if (isContextAvailable(context.currentDiagramImage)) {
			parts.push(LanguageModelDataPart.text("State diagram image (visual rendering):"));
			parts.push(LanguageModelDataPart.image(context.currentDiagramImage.data.data, context.currentDiagramImage.data.mimeType.toString()));
		} else {
			parts.push(LanguageModelDataPart.text(`State diagram image: ${statusTag(context.currentDiagramImage.status)}`));
		}

		return [LanguageModelChatMessage.User(parts)];
	}

	override buildContextHeader(snapshot: StateDiagramChatContext): string {
		return [
			"### Context received",
			`- Active file: ${snapshot.currentFilePath || statusTag("unavailable")}`,
			`- Code: ${isContextAvailable(snapshot.currentCodeOrSelection) ? snapshot.codeContextKind : statusTag(snapshot.currentCodeOrSelection.status)}`,
			`- Diagram JSON: ${isContextAvailable(snapshot.currentDiagram) ? statusTag("available") : statusTag(snapshot.currentDiagram.status)}`,
			`- Diagram image: ${isContextAvailable(snapshot.currentDiagramImage) ? statusTag("available") : statusTag(snapshot.currentDiagramImage.status)}`,
			"",
			"",
		].join("\n");
	}
}