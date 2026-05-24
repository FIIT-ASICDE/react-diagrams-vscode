export function buildHelpText(): string {
  return [
    "### What you can ask",
    "- @diagram explain this flow",
    "- @diagram analyze diagram",
    "- @diagram compare code and diagram",
    "- @diagram find inconsistencies",
    "- @diagram refactor this code",
    "- @diagram refactor #sym:functionName",
    "- @diagram create a diagram out of #sym:functionName",
    "",
  ].join("\n");
}

export function isHelpPrompt(prompt: string): boolean {
  const n = prompt.trim().toLowerCase();
  return ["?", "help", "", "what"].includes(n);
}