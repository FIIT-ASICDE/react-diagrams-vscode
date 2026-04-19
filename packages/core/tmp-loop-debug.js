const { Project, SyntaxKind } = require('ts-morph');
const { DiagramBuilder } = require('./dist/@react-activity-diagrams');

(async () => {
  const src = `
    async function f() {
      let attempt = 0;
      while (attempt < retries) {
        try {
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error('x');
          }
          const data = await response.json();
          return data;
        } catch (err) {
          if (attempt === retries - 1) {
            throw err;
          }
          await promiseDelayExample(1000 * (attempt + 1));
          attempt++;
        }
      }
    }
  `;

  const project = new Project({ compilerOptions: { allowJs: true, jsx: 2 } });
  const sf = project.createSourceFile('x.ts', src, { overwrite: true });
  const fn = sf.getFunctionOrThrow('f');
  const body = fn.getBodyOrThrow().asKindOrThrow(SyntaxKind.Block);
  const graph = await new DiagramBuilder().buildStatements(body.getStatements());

  console.log(JSON.stringify({
    nodes: graph.nodes.map((n) => ({ id: n.id, type: n.type, label: n.data?.label })),
    edges: graph.edges.map((e) => ({ source: e.source, target: e.target, label: e.label, type: e.type }))
  }, null, 2));
})();
