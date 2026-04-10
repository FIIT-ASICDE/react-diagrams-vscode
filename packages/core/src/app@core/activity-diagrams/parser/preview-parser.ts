import * as fs from "node:fs";
import * as path from "node:path";
import { Project } from "ts-morph";
import { DiagramBuilder } from "../../../@react-activity-diagrams";
import { Edge, Node as Nds } from "@xyflow/react";
import { getPreviewStatements } from "./preview-source";
import { buildClassMembersPreviewGraph } from "./preview-graph";

function findConfigFile(rootDir: string): string | undefined {
	const candidates = [
		path.join(rootDir, "tsconfig.json"),
		path.join(rootDir, "jsconfig.json"),
	];

	for (const candidate of candidates) {
		if (fs.existsSync(candidate)) {
			return candidate;
		}
	}

	return undefined;
}

function createProject(rootDir: string): Project {
	const configFile = findConfigFile(rootDir);

	if (configFile) {
		return new Project({
			tsConfigFilePath: configFile,
			skipAddingFilesFromTsConfig: true,
		});
	}

	return new Project({
		compilerOptions: {
			allowJs: true,
		},
	});
}

export async function parseActivityPreview(sourceText: string, rootDir = ".", tempFileName = "__activity_preview__.tsx"): Promise<{nodes: Nds[], edges: Edge[]}> {
	const project = createProject(rootDir);
	const sourceFile = project.createSourceFile(tempFileName, sourceText, { overwrite: true });
	const diagramBuilder = new DiagramBuilder();

	try {
		const classMembersGraph = buildClassMembersPreviewGraph(sourceFile);
		if (classMembersGraph) {
			return classMembersGraph;
		}

		const previewStatements = getPreviewStatements(sourceFile);
		if (previewStatements) {
			return await diagramBuilder.buildStatements(previewStatements);
		}

		return await diagramBuilder.build(sourceFile);
	}
	catch {
		return {
			nodes: [
				{ id: "preview-1", position: { x: 0, y: 0 }, data: { label: sourceText.slice(0, 80) || "Preview" } },
			],
			edges: [],
		};
	}
	finally {
		sourceFile.delete();
	}
}