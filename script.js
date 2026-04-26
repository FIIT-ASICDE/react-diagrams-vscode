const { Project } = require('ts-morph');
const { DiagramBuilder } = require('./packages/core/dist');

async function run() {
  const sourceText = `
function renderRoute(route) {
  switch (route) {
    case 'dashboard':
      return A;
    case 'settings':
      return B;
    default:
      return C;
  }
}
`;

  const project = new Project({ compilerOptions: { allowJs: true } });
  const sourceFile = project.createSourceFile('temp.js', sourceText);
  
  const builder = new DiagramBuilder();
  const graph = await builder.build(sourceFile);

  const nodes = graph.nodes || [];
  const nodeTypes = nodes.map(n => n.type);
  const mergeCount = nodes.filter(n => n.type === 'merge').length;

  console.log('Node Types:', nodeTypes.join(', '));
  console.log('Merge Node Count:', mergeCount);
}

run().catch(console.error);