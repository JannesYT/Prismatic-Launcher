import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Resolve every path against this file rather than the cwd, so `root` and the
// HTML entry always share a prefix (Rollup requires the entry to sit inside
// root). `import.meta.dirname` rather than `__dirname`: the package is ESM.
const src = resolve(import.meta.dirname, 'src')
const rendererRoot = resolve(src, 'renderer')

export default defineConfig({

main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(src, 'main/index.ts') },
        output: {
          entryFileNames: '[name].mjs' // <-- Das zwingt den Main-Prozess zur Endung .mjs
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(src, 'preload/index.ts') },
        output: {
          entryFileNames: '[name].mjs' // <-- Das zwingt den Preload-Prozess zur Endung .mjs
        }
      }
    }
  },
  renderer: {
    root: rendererRoot,
    resolve: {
      alias: { '@': resolve(rendererRoot, 'src') },
      preserveSymlinks: true
    },
    build: { rollupOptions: { input: { index: resolve(rendererRoot, 'index.html') } } },
    plugins: [react()]
  }
})