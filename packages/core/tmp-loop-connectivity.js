const { Project, SyntaxKind } = require('ts-morph');
const { DiagramBuilder } = require('./dist/@react-activity-diagrams');

(async () => {
  const src = `
    function f() {
      while (a < 3) {
        a++;
      }
      do {
        b++;
      } while (b < 2);
    }
  `;
  const p = new Project({ compilerOptions: { allowJs: true } });
  const sf = p.createSourceFile('z.ts', src, { overwrite: true });
  const fn = sf.getFunctionOrThrow('f');
  const body = fn.getBodyOrThrow().asKindOrThrow(SyntaxKind.Block);
  const g = await new DiagramBuilder().buildStatements(body.getStatements());
  const loops = g.nodes.filter(n => n.type === 'loop').map(n => n.id);
  const loopEdges = g.edges.filter(e => loops.includes(String(e.source)) || loops.includes(String(e.target))).map(e => ({ source: e.source, target: e.target, label: e.label, type: e.type }));
  console.log(JSON.stringify({ loops, loopEdges }, null, 2));
})();
