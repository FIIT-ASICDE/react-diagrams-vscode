const { Project, SyntaxKind } = require('ts-morph');
const { DiagramBuilder } = require('./dist/@react-activity-diagrams');

(async () => {
  const src = `
    function f() {
      while (outerCond) {
        while (innerCond) {
          step();
        }
        afterInner();
      }
      done();
    }
  `;

  const project = new Project({ compilerOptions: { allowJs: true, jsx: 2 } });
  const sf = project.createSourceFile('y.ts', src, { overwrite: true });
  const fn = sf.getFunctionOrThrow('f');
  const body = fn.getBodyOrThrow().asKindOrThrow(SyntaxKind.Block);
  const graph = await new DiagramBuilder().buildStatements(body.getStatements());

  const loops = graph.nodes.filter((n) => n.type === 'loop').map((n) => n.id);
  const edges = graph.edges.map((e) => ({ source: e.source, target: e.target, label: e.label, type: e.type }));
  console.log(JSON.stringify({ loops, edges }, null, 2));
})();
