import { parseReactComponent, asSrcFile, GraphBuilder } from '../app@state-diagram';
import { readFileSync } from 'fs';
import { join, relative } from 'path';

import { inspect } from "util";

// const reactForm = readFileSync(join(__dirname, 'samples', 'form.jsx')).toString();
const reactForm = join(__dirname, 'samples', 'switchNLoops.tsx');

// for (let i = 0; i < 10; i++) {
// 	console.time(`parseReactComponent ${i}`);
// 	console.log(i, parseReactComponent(reactForm));
// 	console.timeEnd(`parseReactComponent ${i}`);
// }

function diagramToJson(diagram, rootPath?: string) {
	return JSON.stringify({
		...diagram, 
		source: (rootPath && diagram.source && relative(rootPath, diagram.source)) ?? diagram.source
	}, (key, value) => {
		return value === "" ? undefined : value;
	});
}

const result = parseReactComponent(reactForm);
console.log(inspect(result, { depth: null, colors: true }));

console.log(diagramToJson(result, __dirname));


// console.log(JSON.stringify(result));

// console.log(formatAstTree(text2SrcFile(reactForm).sourceFile));