const parser = require("./packages/core/dist/app@core/activity-diagrams/parser/preview-parser.js");
console.log("Exported keys:", Object.keys(parser));
const snippet = `class testClass {
  private condition: boolean;
  constructor(condition: boolean) { this.condition = condition; }
  private testMethod() { console.log("This is a test method"); }
  if (x = 5) { console.log("Condition is true"); }
}`;
const result = parser.parseActivityPreview(snippet);
console.log("Result:", result);
