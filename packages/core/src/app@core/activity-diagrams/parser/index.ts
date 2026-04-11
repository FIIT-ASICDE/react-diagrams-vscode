import * as fs from "node:fs";
import * as path from "node:path";
import { Node, Project, SyntaxKind } from "ts-morph";
import { DiagramBuilder } from "../../../@react-activity-diagrams";
import { Edge, Node as Nds } from "@xyflow/react";
/**
 * Resolve a tsconfig/jsconfig near the provided root so ts-morph can parse with
 * project-aware compiler settings when available.
 */
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

/**
 * Create a ts-morph project instance. If there is no config file, we still
 * create a project with default settings so parsing can proceed.
 */
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

// Parse the provided source text as a temporary file in a ts-morph project.
// Use custom diagram builder to convert the source file into a graph of nodes and edges representing the activity diagram.
export async function parseActivityComponent(sourceText: string, rootDir = ".", tempFileName = "__activity_temp__.tsx"): Promise<{nodes: Nds[], edges: Edge[]}> {
	const project = createProject(rootDir);
	const sourceFile = project.createSourceFile(tempFileName, sourceText, { overwrite: true });
	const diagramBuilder = new DiagramBuilder();

	try {
		const graph = await diagramBuilder.build(sourceFile);
		return graph;
	}
	finally {
		sourceFile.delete();
	}
}

export { parseActivityPreview } from "./preview-parser";
