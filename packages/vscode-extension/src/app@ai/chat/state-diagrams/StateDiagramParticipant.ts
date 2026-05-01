import { LanguageModelChatMessage, LanguageModelDataPart, LanguageModelTextPart, TextDocument, workspace } from "vscode";
import type { StateDiagram } from "@react-diagrams/core";
import { componentStateCache } from "@/app@utils/cache";
import { ImageCacheEntry } from "@/app@utils/cache/parsing-cache";
import { ComponentStatePanel } from "@/app@panels/ComponentStatePanel";
import {
	BaseChatContext,
	BaseChatParticipant,
	ContextData,
	contextAvailable,
	contextStatus,
	isContextAvailable
} from "../BaseChatParticipant";
import { doCommonChecksAndGetDoc, getConfigOption } from "@/app@utils";
import { relative } from "path";

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
	async getDiagramImageEntry(doc?: TextDocument): Promise<ContextData<ImageCacheEntry>> {
		const cached = componentStateCache.getImage(doc);
		if (cached)
			return contextAvailable(cached);

		const requested = await ComponentStatePanel.current?.requestCurrentDiagramImage(false);
		if (requested === null)
			return contextStatus("unobtainable");
		return requested ? contextAvailable(requested) : contextStatus("unavailable");
	}

	async getDiagram(doc?: TextDocument): Promise<ContextData<StateDiagram>> {
		const entry = componentStateCache.get(doc);
		if (!entry)
			return contextStatus("unavailable");

		try {
			const data = await entry.data;
			return contextAvailable(data);
		} catch {
			return contextStatus("unobtainable");
		}
	}

	override async getChatContext(userPrompt: string): Promise<StateDiagramChatContext> {
		const { code: codeEnabled, diagram: diagramEnabled, diagramImage: diagramImageEnabled } = getCapabilities();
		const { targetDocument: doc, rootPath } = doCommonChecksAndGetDoc(componentStateCache.getCurrentDocument()) ?? {};

		const codeData = codeEnabled ? (doc ? contextAvailable(doc.getText()) : contextStatus<string>("unavailable")) : contextStatus<string>("disabled");
		const diagramData = diagramEnabled ? await this.getDiagram(doc) : contextStatus<StateDiagram>("disabled");
		const imageData = diagramImageEnabled ? await this.getDiagramImageEntry(doc) : contextStatus<ImageCacheEntry>("disabled");

		return {
			userPrompt,
			currentFilePath: rootPath && doc?.uri.fsPath && relative(rootPath, doc.uri.fsPath),
			currentCodeOrSelection: codeData,
			codeContextKind: "full-file",
			currentDiagram: diagramData,
			currentDiagramImage: imageData,
		};
	}

	override buildLanguageModelMessages(context: StateDiagramChatContext): LanguageModelChatMessage[] {
		const systemInstruction = [
			"Role: expert assistant for TypeScript, TSX, and React and State diagrams.",
			`Answer in: ${this.responseLanguage}.`,
			"Always analyze code together with the state diagram context.",
			"You can explain behavior, suggest refactors, compare code and diagram, and find potential state related issues.",
			"Always state whether and how the diagram influenced your answer.",
			"If code improvements would improve the resulting diagram, propose concrete code changes.",
			"Keep answers practical, structured, and implementation-focused.",
		].join("\n");

		const effectiveTask = context.userPrompt.length < 5 ? "Provide a short capabilities intro, suggest concrete next prompts, then give best-effort analysis from available context." : context.userPrompt;

		const modelDescription = "Diagram model: component = parsed component metadata; stateVariables = component state declarations (outer groups); mutators = functions that mutate respective stateVariable with control-flow and update nodes, (inner groups).";
		const modelDescriptionVisual = "Diagram model: component = parsed component metadata; stateVariables = component state declarations (outer groups); mutators = functions that mutate respective stateVariable with control-flow and update nodes, (inner groups).";

		const rootPath = workspace.workspaceFolders?.[0].uri.fsPath;
		const parts: Array<LanguageModelTextPart | LanguageModelDataPart> = [
			new LanguageModelTextPart(`Task request: ${effectiveTask}`),
			new LanguageModelTextPart(`Active file: ${context.currentFilePath || "unavailable"}`),
		];

		if (isContextAvailable(context.currentCodeOrSelection)) {
			parts.push(new LanguageModelTextPart("Code:"));
			parts.push(new LanguageModelTextPart(context.currentCodeOrSelection.data));
		} else {
			parts.push(new LanguageModelTextPart(`Code: ${context.currentCodeOrSelection.status}`));
		}
		if (isContextAvailable(context.currentDiagram)) {
			parts.push(new LanguageModelTextPart("State diagram (structured JSON object):"));

			const serializedDiagram = JSON.stringify({
				...context.currentDiagram.data, 
				source: context.currentDiagram.data.source && rootPath && relative(rootPath, context.currentDiagram.data.source)
			}, (key, value) => {
				return value === "" ? undefined : value;
			});
			parts.push(new LanguageModelTextPart(serializedDiagram));
		} else {
			parts.push(new LanguageModelTextPart(`State diagram: ${context.currentDiagram.status}`));
		}

		if (isContextAvailable(context.currentDiagramImage)) {
			parts.push(new LanguageModelTextPart("State diagram image:"));
			parts.push(LanguageModelDataPart.image(context.currentDiagramImage.data.data, context.currentDiagramImage.data.mimeType.toString()));
		} else {
			parts.push(new LanguageModelTextPart(`State diagram image: ${context.currentDiagramImage.status}`));
		}

		parts.push(new LanguageModelTextPart(isContextAvailable(context.currentDiagramImage) ? modelDescriptionVisual : modelDescription));

		return [
			LanguageModelChatMessage.User(systemInstruction),
			LanguageModelChatMessage.User(parts)
		];
	}

	override buildContextHeader(snapshot: StateDiagramChatContext): string {
		return [
			"### Context received",
			`- Active file: **${snapshot.currentFilePath || "unavailable"}**`,
			`- Code: **${isContextAvailable(snapshot.currentCodeOrSelection) ? snapshot.codeContextKind : snapshot.currentCodeOrSelection.status}**`,
			`- State diagram: **${isContextAvailable(snapshot.currentDiagram) ? "available" : snapshot.currentDiagram.status}**`,
			`- State diagram image: **${isContextAvailable(snapshot.currentDiagramImage) ? "available" : snapshot.currentDiagramImage.status}**`,
			"",
			"",
		].join("\n");
	}
}