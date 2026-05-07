import path from "path";
import { asSrcFile, createProject } from "../../../../app@state-diagram";
import { ts } from "ts-morph";

export const REFACTORING_DIR = path.resolve(__dirname, '..');
export const CORE_DIR = path.resolve(REFACTORING_DIR, '../../../..');
export const CORE_TESTS_DIR = path.join(REFACTORING_DIR, '../..');

export const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

export function baseStem(filePath: string) {
	return path.basename(filePath, path.extname(filePath));
}

export function formatError(error) {
	return error instanceof Error ? error.message : String(error);
}

export function createSourceFileForMetrics(sourceText: string, fileName?: string) {
	return asSrcFile(sourceText, createProject(CORE_TESTS_DIR, { 
		skipLibCheck: true,
		jsx: ts.JsxEmit.ReactJSX
	}, {
		skipFileDependencyResolution: true,
		skipLoadingLibFiles: true,
	})).sourceFile;
}

export type BunLike = {
	Transpiler?: new (options: { loader: 'js' | 'jsx' | 'ts' | 'tsx' }) => {
		transformSync(sourceText: string): string;
	};
};

export function checkCompilesWithoutErrors(sourceText: string, filePath: string) {
	const bun = (globalThis as typeof globalThis & { Bun?: BunLike }).Bun;

	if (bun?.Transpiler) {
		try {
			new bun.Transpiler({ loader: getLoader(filePath) }).transformSync(sourceText);
			return { ok: true, errors: [] as string[] };
		}
		catch (error) {
			return { ok: false, errors: [formatError(error)] };
		}
	}

	try {
		const sourceFile = createSourceFileForMetrics(sourceText, path.basename(filePath));
		const diagnostics = sourceFile.getProject().getPreEmitDiagnostics()
			.filter((diagnostic) => diagnostic.getCategory() == ts.DiagnosticCategory.Error && diagnostic.getCode() < 2000);
		return {
			ok: diagnostics.length == 0,
			errors: diagnostics.map((diagnostic) => diagnostic.getMessageText().toString()),
		};
	}
	catch (error) {
		return { ok: false, errors: [formatError(error)] };
	}
}

export function getLoader(filePath: string): 'js' | 'jsx' | 'ts' | 'tsx' {
	const ext = path.extname(filePath).toLowerCase();
	if (ext == '.jsx')
		return 'jsx';
	if (ext == '.ts')
		return 'ts';
	if (ext == '.js')
		return 'js';
	return 'tsx';
}
