import { defineConfig } from 'vite'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import reactSwc from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const enableReactCompiler = mode === 'compiler'
  const fast = mode === 'fast'
  const reactPlugin = enableReactCompiler ? react({
    babel: {
      plugins: [['babel-plugin-react-compiler']],
    },
  }) : reactSwc()

  return {
    plugins: [
      reactPlugin,
      tailwindcss(),
      // ClosePlugin()
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      outDir: path.resolve(__dirname, '../vscode-extension/dist/webview'),
      target: 'esnext',
      minify: enableReactCompiler,
      cssMinify: enableReactCompiler,
      reportCompressedSize: enableReactCompiler,
      emptyOutDir: false,
      rollupOptions: {
        treeshake: fast ? false : undefined,
        output: {
          entryFileNames: `assets/[name].js`,
          chunkFileNames: `assets/[name].js`,
          assetFileNames: `assets/[name].[ext]`,
        },
      },
    },
  }
})
