import * as fs from "node:fs";
import * as path from "node:path";
import { Node, Project, SyntaxKind } from "ts-morph";
import { DiagramBuilder } from "../../../@react-activity-diagrams";
import { Edge, Node as Nds } from "@xyflow/react";


// Finds config file.
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



// Creates project.
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




// Parses activity component.
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
