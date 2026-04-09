# state-diagram-vscode-ext monorepo

This repository is organized as an npm workspace monorepo.

## Packages

- `@react-diagrams/core` in `packages/core`: parsers and shared logic, testable independently.
- `@react-diagrams/vscode-extension` in `packages/vscode-extension`: VS Code extension host package.
- `@react-diagrams/webview-state` in `packages/webview-state`: React webview application used by the extension.

## Setup
1. Make sure your VS Code API is at least 1.111.0 (Help > About).
2. Install Node 22.12+.
3. From the monorepo root, run `npm i`.
4. Open new terminal and run to build core and rebuild when changed: `npm run watch:dev`.
5. Press F11 (Run > Start Debugging) and Debug Anyway if necessary...

## Common commands

```bash
npm run build
npm run watch
npm run watch-tests
npm run test
```

## Package-scoped examples

```bash
npm --workspace @react-diagrams/core run build
npm --workspace @react-diagrams/vscode-extension run compile
npm --workspace @react-diagrams/webview-state run dev
```
