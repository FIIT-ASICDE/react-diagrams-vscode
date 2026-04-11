import assert from 'node:assert/strict';
import test from 'node:test';

import { parseReactComponent } from '../app@core/state-diagrams/parser/react-parser';
import { readFileSync } from 'fs';
import { join } from 'path';

const reactForm = readFileSync(join(__dirname, '..', '..', 'src', 'tests', 'samples', 'form.jsx')).toString();

test('parseReactComponent parses reactForm sample into AST text', () => {
  const astTree = parseReactComponent(reactForm);
  console.log(astTree);

  assert.equal(typeof astTree, 'object');
  assert.ok(astTree);
  assert.equal(astTree.component?.name, 'Form');
  assert.equal(astTree.stateVariables.length, 3);
});
