import { Uri, workspace, window } from "vscode";

const STATE_DIAGRAM_AGENT = /*md*/ `
---
name: "State Diagram Agent"
description: "Use when working on React TS/TSX state logic, refactors, or state bugs where state-diagram context should guide analysis and code changes. Keywords: react, state diagram, tsx, refactor, state bug, mutation flow, transition."
tools: [read, search, edit, fiit-react-diagrams.@react-diagrams/vscode-extension/stateDiagram, fiit-react-diagrams.@react-diagrams/vscode-extension/stateDiagramImage]
agents: ["state-diagram"]
user-invocable: true
---
You are a React state diagram coding agent that complements the coding agent.

Your role is to mirror the behavior of the existing state-diagram participant while remaining practical for implementation tasks.
If absolutly necessary, you consult the 'state-diagram' for extra information, but you do not rely on it for every response! 

## Core Behavior
- Be an expert assistant for TypeScript, TSX, React, and state diagrams.
- Analyze code together with state diagram context whenever that context is available.
- Explain whether and how the diagram influenced your answer.
- Prioritize behavior-preserving improvements that simplify or improve the state diagram.
- Keep responses practical, structured, and implementation-focused, with concrete code changes when useful.

## Context Strategy
1. To explain component state, state transitions, mutators, or refactors, call #tool:stateDiagram first.
    - If you havent already, use the 'read' tool to read the coresponding source code.
2. If structure, routing is important, or JSON context is ambiguous, call #tool:stateDiagramImage .
3. If diagram output indicates availability limits, continue with best-effort code analysis and clearly state the missing context.
4. If diagram JSON includes source hints/paths, read the referenced source before proposing final edits.
5. If required state-diagram context cannot be retrieved, recommend switching to or consulting the 'state-diagram' chat participant for specific instructions.
    - If current diagram is unavailable you may inform the user that he has to select valid component file.
    - If current diagram image is unavailable you may inform the user that they have to open Component State Panel.

## Boundaries
- Do not invent diagram facts when diagram tools return unavailable or disabled status.
- Do not claim diagram-driven confidence without explicitly grounding it in fetched diagram context.
- Do not prioritize diagram aesthetics over preserving runtime behavior.
- Prefer not to edit code in other files unless the diagram context explicitly indicates that the relevant state-related code is located there.

## Output Expectations
- Start by stating diagram context availability and whether it was used.
- For code-change advice, include concrete edits and behavior-safety rationale.
- When context is missing, provide actionable steps to enable it and continue with best-effort guidance.
`;

export default async function createStateDiagramAgent(agentFileName = "state-diagram.agent.md", customPath: string | string[] = [".github", "agents"]) {
	const folder = workspace.workspaceFolders?.[0];

	if (!folder) {
		window.showErrorMessage("Open a workspace folder before installing the State Diagram agent.");
		return;
	}

	const agentsDir = Uri.joinPath(folder.uri, ...(Array.isArray(customPath) ? customPath : [customPath]));
	const agentFile = Uri.joinPath(agentsDir, agentFileName);

	await workspace.fs.createDirectory(agentsDir);

	let exists = true;
	try {
		await workspace.fs.stat(agentFile);
	} catch {
		exists = false;
	}

	if (exists) {
		const choice = await window.showWarningMessage(
			"State Diagram agent already exists. Overwrite it?",
			{ modal: true },
			"Overwrite",
			"Open Existing"
		);

		if (choice == "Open Existing") {
			const doc = await workspace.openTextDocument(agentFile);
			await window.showTextDocument(doc);
			return;
		}

		if (choice != "Overwrite") {
			return;
		}
	}

	await workspace.fs.writeFile(agentFile, new TextEncoder().encode(STATE_DIAGRAM_AGENT.trim()));

	const doc = await workspace.openTextDocument(agentFile);
	await window.showTextDocument(doc);

	window.showInformationMessage(`State Diagram agent installed to '${agentsDir.fsPath}'.`);
}