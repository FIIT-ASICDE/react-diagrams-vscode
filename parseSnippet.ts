import { Project, SyntaxKind } from "ts-morph";

const project = new Project();
const content = `class testClass {
private condition: boolean;

constructor(condition: boolean) {
this.condition = condition;
}
private testMethod() {
console.log('This is a test method');
}

if (x = 5) {
console.log('Condition is true');
}
}`;

const sourceFile = project.createSourceFile("test.ts", content);

console.log("Diagnostics:");
const diagnostics = sourceFile.getPreEmitDiagnostics();
if (diagnostics.length === 0) {
    console.log("No diagnostics found.");
} else {
    diagnostics.forEach(diag => {
        console.log(`- ${diag.getMessageText()}`);
    });
}

console.log("\nMembers:");
const classDeclaration = sourceFile.getClass("testClass");
if (classDeclaration) {
    classDeclaration.getMembers().forEach(member => {
        const kind = member.getKindName();
        let name = "undefined";
        if ((member as any).getName) {
            name = (member as any).getName();
        }
        const text = member.getText();
        console.log(`Kind: ${kind}, Name: ${name}`);
        console.log(`Text: ${text}`);
        console.log("---");
    });
} else {
    console.log("Class 'testClass' not found.");
}
