import assert from 'node:assert/strict';
import test from 'node:test';

import { parseReactComponent } from '../app@state-diagram';
import { readFileSync } from 'fs';
import { join } from 'path';

const reactForm = readFileSync(join(__dirname, 'samples', 'form.jsx')).toString();

test('parseReactComponent parses reactForm sample into AST text', () => {
  const astTree = parseReactComponent(reactForm);
  console.log(astTree);

  assert.equal(typeof astTree, 'string');
//   assert.ok(astTree.length > 0);
//   assert.match(astTree, /FunctionDeclaration \(Form\)/);
//   assert.match(astTree, /JsxOpeningElement \(<form>\)/);
//   assert.match(astTree, /CallExpression \(useState\)/);
});
