import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
	files: 'packages/vscode-extension/out/test/**/*.test.js',
});
