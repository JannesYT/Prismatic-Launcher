// Standalone renderer dev server — lets you iterate on the UI in a plain browser
// with no Electron window. The IPC layer falls back to mock data (see src/renderer/src/lib/ipc.ts).
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Resolve against this file rather than the cwd, and keep the path as written.
// `import.meta.dirname` rather than `__dirname`: the package is ESM.
const root = resolve(import.meta.dirname, 'src/renderer')

export default defineConfig({
  root,
  resolve: {
    alias: { '@': resolve(root, 'src') },
    preserveSymlinks: true
  },
  plugins: [react()],
  server: { port: 5199, strictPort: true, fs: { strict: false } }
})
