import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        },
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return
            if (id.includes('@excalidraw')) return 'vendor-excalidraw'
            // Mermaid and D3/dagre share deps; a single chunk avoids circular manualChunk warnings.
            if (id.includes('mermaid') || id.includes('d3') || id.includes('dagre')) return 'vendor-diagrams'
            if (id.includes('@codemirror') || id.includes('/codemirror')) return 'vendor-codemirror'
            if (id.includes('highlight.js')) return 'vendor-highlight'
          }
        }
      }
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer/src')
      }
    }
  }
})
