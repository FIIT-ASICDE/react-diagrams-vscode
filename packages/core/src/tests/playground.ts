import { DiagramBuilder } from '../@react-activity-diagrams';
import { convertDiagramToCode } from '../@react-activity-diagrams/code-snippet/main';
import { Project, SyntaxKind } from 'ts-morph';
import { inspect } from 'util';

const switchSource = `
async function processItem(item: any) {
	switch (item.kind) {
		case 'a': handleA(item); break;
		case 'b': handleB(item); break;
		default: handleDefault(item);
	}
	after();
}
`;

(async () => {
	const project = new Project({ compilerOptions: { allowJs: true, jsx: 2 } });
	const sourceFile = project.createSourceFile('playground-switch.ts', switchSource, { overwrite: true });
	const fn = sourceFile.getFunctionOrThrow('processItem');
	const body = fn.getBodyOrThrow().asKindOrThrow(SyntaxKind.Block);
	const graph = await new DiagramBuilder().buildStatements(body.getStatements());

	console.log('Edges:');
	for (const edge of graph.edges) {
		console.log(`  ${edge.source} --[${edge.label ?? ''}]--> ${edge.target}`);
	}

	console.log('\nNodes:');
	console.log(inspect(graph.nodes, { depth: null, colors: true }));

	const code = convertDiagramToCode(graph.nodes, graph.edges, 'processItem', []);
	console.log('\nGenerated code:');
	console.log(code);
})();