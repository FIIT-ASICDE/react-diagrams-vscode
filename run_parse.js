const { parseActivityPreview } = require("./packages/core/dist/app@core/activity-diagrams/parser/preview-parser");
const code = `
class testClass {
  private condition: boolean;
  constructor(condition: boolean) { this.condition = condition; }
  private testMethod() { console.log('This is a test method'); }
  if (x = 5) { console.log('Condition is true'); }
}
`;
async function run() {
  try {
    const result = await parseActivityPreview(code);
    result.nodes.forEach(node => {
      const type = node.type || "N/A";
      const displayText = node.data?.displayText || "N/A";
      const sourceText = (node.data?.sourceText || "N/A").replace(/\r?\n/g, ' ');
      console.log(`${type} | ${displayText} | ${sourceText}`);
    });
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
run();
