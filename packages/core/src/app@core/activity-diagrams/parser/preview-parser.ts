import * as fs from "node:fs";
import * as path from "node:path";
import { Project, SyntaxKind, type ClassDeclaration, type SourceFile } from "ts-morph";
import { DiagramBuilder } from "../../../@react-activity-diagrams";
import { Edge, Node as Nds } from "@xyflow/react";
import { getPreviewStatements } from "./preview-source";

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

function classMembersToSyntheticSource(classDeclaration: ClassDeclaration): string | undefined {
	const chunks: string[] = [];

	for (const member of classDeclaration.getMembers()) {
		if (member.getKind() === SyntaxKind.PropertyDeclaration) {
			const propNode = member.asKind(SyntaxKind.PropertyDeclaration);
			const propName = propNode?.getName() ?? 'prop';
			const initializer = propNode?.getInitializer();
			if (initializer) {
				const initText = initializer.getText();
				chunks.push(`const ${propName} = ${initText};`);
			}
		}

		if (member.getKind() === SyntaxKind.MethodDeclaration) {
			const methodNode = member.asKind(SyntaxKind.MethodDeclaration);
			const methodName = methodNode?.getName() ?? "method";
			const bodyText = methodNode?.getBodyText();
			if (bodyText) {
				chunks.push(`function ${methodName}() {\n${bodyText}\n}`);
			}
		}

		if (member.getKind() === SyntaxKind.Constructor) {
			const ctorNode = member.asKind(SyntaxKind.Constructor);
			const bodyText = ctorNode?.getBodyText();
			if (bodyText) {
				chunks.push(`function constructorMember() {\n${bodyText}\n}`);
			}
		}

		if (member.getKind() === SyntaxKind.GetAccessor) {
			const getNode = member.asKind(SyntaxKind.GetAccessor);
			const accessorName = getNode?.getName() ?? "getter";
			const bodyText = getNode?.getBodyText();
			if (bodyText) {
				chunks.push(`function get_${accessorName}() {\n${bodyText}\n}`);
			}
		}

		if (member.getKind() === SyntaxKind.SetAccessor) {
			const setNode = member.asKind(SyntaxKind.SetAccessor);
			const accessorName = setNode?.getName() ?? "setter";
			const bodyText = setNode?.getBodyText();
			if (bodyText) {
				chunks.push(`function set_${accessorName}() {\n${bodyText}\n}`);
			}
		}
	}

	if (!chunks.length) {
		return undefined;
	}

	return chunks.join("\n\n");
}

function safeDeleteSourceFile(sourceFile: SourceFile) {
	try {
		if (!sourceFile.wasForgotten()) {
			sourceFile.delete();
		}
	}
	catch {
		// Ignore cleanup failures to avoid turning successful preview parsing into an error.
	}
}

export async function parseActivityPreview(sourceText: string, rootDir = ".", tempFileName = "__activity_preview__.tsx"): Promise<{nodes: Nds[], edges: Edge[]}> {
	const project = createProject(rootDir);
	const sourceFile = project.createSourceFile(tempFileName, sourceText, { overwrite: true });
	const diagramBuilder = new DiagramBuilder();
	try {
		const classDeclaration = sourceFile.getClasses()[0];
		if (classDeclaration) {
			const syntheticSource = classMembersToSyntheticSource(classDeclaration);
			if (syntheticSource) {
				const classPreviewFile = project.createSourceFile("__activity_class_preview__.ts", syntheticSource, { overwrite: true });
				try {
					return await diagramBuilder.build(classPreviewFile);
				}
				finally {
					safeDeleteSourceFile(classPreviewFile);
				}
			}
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
		safeDeleteSourceFile(sourceFile);
	}
}