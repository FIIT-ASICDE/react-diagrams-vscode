import { parseReactComponent, text2SrcFile } from '../app@core/state-diagrams';
import { reactForm } from './samples';

import { inspect } from "util";

// for (let i = 0; i < 10; i++) {
// 	console.time(`parseReactComponent ${i}`);
// 	console.log(i, parseReactComponent(reactForm));
// 	console.timeEnd(`parseReactComponent ${i}`);
// }

const result = parseReactComponent(reactForm);
console.log(inspect(result, { depth: null, colors: true }));

// console.log(JSON.stringify(result));

// console.log(formatAstTree(text2SrcFile(reactForm).sourceFile));