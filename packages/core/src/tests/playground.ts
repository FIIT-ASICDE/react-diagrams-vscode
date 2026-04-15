import { parseReactComponent, asSrcFile, GraphBuilder } from '../app@core/state-diagrams';
import { readFileSync } from 'fs';
import { join } from 'path';

import { inspect } from "util";

const reactForm = readFileSync(join(__dirname, 'samples', 'form.jsx')).toString();

// for (let i = 0; i < 10; i++) {
// 	console.time(`parseReactComponent ${i}`);
// 	console.log(i, parseReactComponent(reactForm));
// 	console.timeEnd(`parseReactComponent ${i}`);
// }

const result = parseReactComponent(reactForm);
console.log(inspect(result, { depth: null, colors: true }));

// console.log(JSON.stringify(result));

// console.log(formatAstTree(text2SrcFile(reactForm).sourceFile));