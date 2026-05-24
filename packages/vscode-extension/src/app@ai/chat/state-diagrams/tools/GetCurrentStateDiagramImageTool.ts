import { LanguageModelDataPart, LanguageModelTextPart, LanguageModelTool, LanguageModelToolResult } from "vscode";
import { isContextAvailable } from "../../BaseChatParticipant";
import { diagramToJson, getDiagramImageEntry } from "../utils";
import { ComponentStatePanel } from "@/app@panels/ComponentStatePanel";
import { doCommonChecksAndGetDoc } from "@/app@utils";
import { componentStateCache } from "@/app@utils/cache";

export default class GetCurrentStateDiagramImageTool implements LanguageModelTool<{}> {
	async invoke() {
		console.debug("Invoking GetCurrentStateDiagramImageTool...");

		const entry = await getDiagramImageEntry(doCommonChecksAndGetDoc(componentStateCache.getCurrentDocument())?.targetDocument);

		if (isContextAvailable(entry)) {
			return new LanguageModelToolResult([
				new LanguageModelTextPart("State diagram image:"),
				LanguageModelDataPart.image(entry.data.data, entry.data.mimeType.toString())
			]);
		}

		return new LanguageModelToolResult([
			new LanguageModelTextPart(`State diagram image: ${entry.status}`)
		]);
	}
}