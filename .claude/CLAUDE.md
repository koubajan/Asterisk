# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start Electron app in development mode (hot reload)
npm run build        # Production build → out/
npm run preview      # Preview production build
npm run typecheck    # Type-check all three TS projects without emitting
```

No test runner is configured yet.

## Architecture

Asteris is an **Electron 34 + React 18 + TypeScript** desktop app built with **electron-vite**. It has three isolated build targets that communicate strictly through IPC:

```
src/
├── main/          # Electron main process (Node.js / CommonJS)
├── preload/       # contextBridge bridge (compiled to CJS, runs in renderer sandbox)
└── renderer/      # React SPA (ESNext, Vite, browser context)
```

### IPC contract — the only link between processes

`src/preload/types.ts` is the single source of truth for cross-process types. It defines `VaultNode`, `EditorFile`, `IpcResult<T>`, and `AsterisAPI`. The preload script (`src/preload/index.ts`) exposes the API as `window.asteris` via `contextBridge.exposeInMainWorld`. The renderer accesses disk exclusively through `window.asteris.*` — never directly.

IPC channels follow the pattern `<domain>:<action>` (e.g. `fs:read-file`, `vault:open-dialog`). All handlers return `{ ok: boolean, data?, error? }` via the `wrap<T>()` utility in `src/main/ipc/handlers.ts`.

### Renderer state

A single **Zustand** store (`src/renderer/src/store/useWorkspace.ts`) holds all app state: `vaultPath`, `tree: VaultNode[]`, `openFile: EditorFile | null`, `previewVisible`, `sidebarVisible`. File mutations go through `src/renderer/src/hooks/useFileOps.ts`, which calls `window.asteris.*` and refreshes the tree. Auto-save is handled by `src/renderer/src/hooks/useAutoSave.ts` (800 ms debounce).

### CodeMirror editor — critical constraint

`src/renderer/src/components/Editor/useCodeMirror.ts` creates the `EditorView` inside a `useEffect([], [])` that runs **once on mount**. The container `<div ref={containerRef}>` **must always be in the DOM** — never conditionally rendered. In `EditorPane.tsx` it is toggled with `style={{ display: openFile ? 'flex' : 'none' }}`, not unmounted. Breaking this constraint silently prevents the editor from initialising.

Content is synced externally via the returned `updateContent(str)` callback (called when `openFile?.path` changes), not by recreating the editor.

### Styling

Plain CSS with CSS custom properties defined in `src/renderer/src/styles/global.css`. No Tailwind. Key tokens: `--bg-base #080808`, `--bg-surface #0f0f0f`, `--accent #00d4ff`. Each component owns a co-located `.css` file. Icons are **lucide-react** throughout — do not introduce inline SVGs.

### TypeScript project split

| Config | Targets | Module |
|---|---|---|
| `tsconfig.node.json` | `src/main/**`, `src/preload/**` | CommonJS |
| `tsconfig.web.json` | `src/renderer/src/**` | ESNext (bundler) |

Path alias `@renderer/*` → `src/renderer/src/*` is available in the renderer only.
