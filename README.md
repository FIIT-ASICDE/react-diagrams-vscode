# state-diagram-vscode-ext monorepo

This repository is organized as an npm workspace monorepo.

## Packages

- `@react-diagrams/core` in `packages/core`: parsers and shared logic, testable independently.
- `@react-diagrams/vscode-extension` in `packages/vscode-extension`: VS Code extension host package.
- `@react-diagrams/webview-ui` in `packages/webview-ui`: React webview application used by the extension.

## Setup
1. Make sure your VS Code API is at least 1.111.0 (Help > About).
2. Install Node 22.12+.
3. From the monorepo root, run `npm i`.
3. Next `npm run build`.
4. Open new terminal `npm run watch:dev` while developing so the changes are reflected.
   - Note that the "hotreload" is far from perfect and is recommended to reopen the Extension-related panels after each reload.
6. Press F11 (Run > Start Debugging) and Debug Anyway if necessary...

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
npm --workspace @react-diagrams/webview-ui run dev
```
