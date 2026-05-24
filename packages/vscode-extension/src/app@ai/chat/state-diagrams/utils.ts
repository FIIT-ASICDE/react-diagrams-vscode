

import { TextDocument } from "vscode";
import { ImageCacheEntry } from "@/app@utils/cache/parsing-cache";
import { ComponentStatePanel } from "@/app@panels/ComponentStatePanel";
import BaseChatParticipant, { BaseChatContext, ContextData, contextAvailable, contextStatus } from "../BaseChatParticipant";
import { componentStateCache } from "@/app@utils/cache";
import { StateDiagram } from "../../../../../core/dist/app@state-diagram-model/types";
import { relative } from "path";

export function diagramToJson(diagram, rootPath?: string) {
	return JSON.stringify({
		...diagram, 
		source: (rootPath && diagram.source && relative(rootPath, diagram.source)) ?? diagram.source
	}, (key, value) => {
		return value === "" ? undefined : value;
	});
}

export async function getDiagramImageEntry(doc?: TextDocument): Promise<ContextData<ImageCacheEntry>> {
	const cached = componentStateCache.getImage(doc);
	if (cached)
		return contextAvailable(cached);

	const requested = await ComponentStatePanel.current?.requestCurrentDiagramImage(false);
	if (requested === null)
		return contextStatus("unobtainable");
	return requested ? contextAvailable(requested) : contextStatus("unavailable");
}

export async function getDiagram(doc?: TextDocument): Promise<ContextData<StateDiagram>> {
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