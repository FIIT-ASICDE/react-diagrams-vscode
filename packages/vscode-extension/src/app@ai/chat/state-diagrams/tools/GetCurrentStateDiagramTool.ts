import { LanguageModelTextPart, LanguageModelTool, LanguageModelToolResult } from "vscode";
import { isContextAvailable } from "../../BaseChatParticipant";
import { diagramToJson, getDiagram } from "../utils";
import { doCommonChecksAndGetDoc } from "@/app@utils";
import { componentStateCache } from "@/app@utils/cache";

export default class GetCurrentStateDiagramTool implements LanguageModelTool<{}> {
	async invoke() {
		console.debug("Invoking GetCurrentStateDiagramTool...");

		const diagram = await getDiagram(doCommonChecksAndGetDoc(componentStateCache.getCurrentDocument())?.targetDocument);

		if (isContextAvailable(diagram)) {
			return new LanguageModelToolResult([
				new LanguageModelTextPart("State diagram (structured JSON object):"),
				new LanguageModelTextPart(diagramToJson({ ...diagram.data, hint: "Read 'source' path with 'read' vscode tool to read the corresponding source code if you havent done so, before submitting any code changes." }))
			]);
		}

		return new LanguageModelToolResult([
			new LanguageModelTextPart(`State diagram (structured JSON object): ${diagram.status}`)
		]);
	}
}