import { parseReactComponent, asSrcFile, GraphBuilder } from '../app@state-diagram';
import { readFileSync } from 'fs';
import { join } from 'path';

import { inspect } from "util";

// const reactForm = readFileSync(join(__dirname, 'samples', 'form.jsx')).toString();
const reactForm = join(__dirname, 'experiments', 'gpt5-mini', 'loopLabel.tsx');

// for (let i = 0; i < 10; i++) {
// 	console.time(`parseReactComponent ${i}`);
// 	console.log(i, parseReactComponent(reactForm));
// 	console.timeEnd(`parseReactComponent ${i}`);
// }

const result = parseReactComponent(reactForm);
console.log(inspect(result, { depth: null, colors: true }));

// console.log(JSON.stringify(result, (key, value) => {
// 	return value === "" ? undefined : value;
// }));


// console.log(JSON.stringify(result));

// console.log(formatAstTree(text2SrcFile(reactForm).sourceFile));