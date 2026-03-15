# Asterisk

A dark-themed **Markdown note editor** for desktop with canvas artifacts, AI assistant, and calendar. Built with Electron and React for a fast, local-first workflow.

---

## Overview

Asterisk lets you work in a folder-based workspace: edit Markdown with live preview, manage notes in a file tree (with drag-and-drop), and use **Artifacts** — canvas boards stored as `.artifact` files — for cards, links, images, and connections. An in-app **AI assistant** (OpenAI, Anthropic, Gemini) can suggest edits with optional diff-apply, and a **calendar** view surfaces notes with `scheduled` frontmatter. Theming, export (HTML, PDF, etc.), and keyboard-driven UX round out the experience.

---

## Quick start

**Requirements:** Node.js 18+ and npm.

```bash
git clone <repository-url>
cd Asteris
npm install
npm run dev
```

| Script | Description |
|--------|-------------|
| `npm run dev` | Start app in development mode with hot reload |
| `npm run build` | Production build (Electron + renderer) |
| `npm run preview` | Run the production build locally |
| `npm run typecheck` | TypeScript check (node + renderer) |

---

## Features

### Editor & preview

- **CodeMirror 6** — Markdown editing with syntax highlighting (highlight.js), line wrapping, and configurable font size / tab size
- **Live preview** — Split view with resizable editor/preview; rendered with **marked**, sanitized with **DOMPurify**
- **Slash commands** — Quick actions (e.g. `/ask` to open AI chat)
- **Content search** — Full-text search across the workspace (artifacts excluded)

### Workspace

- **Open workspace** — Point at a folder; file tree with expand/collapse and filters
- **Tabs** — Multiple open files; reorder by drag; close with middle-click or context
- **Drag-and-drop** — Move files or folders between directories in the tree
- **Context menu** — New file/folder, rename, delete, tags

### Artifacts (canvas)

- **Canvas boards** — Stored as `.artifact` JSON files in your workspace
- **Node types** — Text, file (link to workspace file), link (URL), image, group
- **Connections** — Edges between nodes with optional labels
- **Layout** — Align, distribute, group; pan and zoom; grid snapping
- **History** — Undo / redo (⌘Z, ⌘⇧Z) with toolbar back/forward buttons

### AI assistant

- **In-app chat** — Side panel; resizable
- **Providers** — OpenAI, Anthropic, Gemini (API keys in Settings)
- **Context** — Optional inclusion of current file for edits
- **Diff view** — Review and apply suggested changes

### Calendar & scheduling

- **Scheduled notes** — Frontmatter: `scheduled: "YYYY-MM-DD"` or ISO datetime
- **Calendar view** — Month grid; click to set/clear date for the active note
- **Upcoming** — Sidebar list of upcoming scheduled notes

### Theming & export

- **Themes** — Preset (e.g. light/dark) and custom; accent, background, text; export/import JSON
- **Typography** — Sans, serif, mono
- **Export** — HTML, plain text, Markdown, print/PDF from the top bar

---

## Technologies

### Runtime & build

| Technology | Role |
|------------|------|
| **Electron** | Cross-platform desktop shell (main + renderer process) |
| **electron-vite** | Build tooling for Electron + Vite |
| **Vite** | Dev server, HMR, production bundling (renderer) |
| **TypeScript** | Typing for main, preload, and renderer |

### Frontend

| Technology | Role |
|------------|------|
| **React** | UI components and composition |
| **Zustand** | Global state (workspace, settings, artifacts, AI chat) |
| **Lucide React** | Icon set |

### Editor & content

| Technology | Role |
|------------|------|
| **CodeMirror 6** | Editor core and extensions |
| **@codemirror/lang-markdown** | Markdown language support |
| **@codemirror/search** | Find in file |
| **@codemirror/autocomplete** | Inline completion |
| **marked** | Markdown → HTML |
| **DOMPurify** | Sanitize HTML in preview |
| **highlight.js** | Syntax highlighting in preview |

### AI

| Technology | Role |
|------------|------|
| **OpenAI** | GPT models |
| **@anthropic-ai/sdk** | Claude models |
| **@google/generative-ai** | Gemini models |
| **diff** | Diff computation for AI suggestions |

### Data & visualization

| Technology | Role |
|------------|------|
| **date-fns** | Date formatting and calendar logic |
| **D3** | Graph visualization (e.g. neural / note graph) |
| **Custom canvas** | Artifact board (nodes, edges, pan/zoom) |

### Development

| Technology | Role |
|------------|------|
| **@vitejs/plugin-react** | React fast refresh |
| **electron-builder** | Packaging (if configured) |
| **@types/node**, **@types/react**, etc. | Type definitions |

---

## Architecture

Standard Electron three-process layout:

| Context | Path | Responsibility |
|---------|------|-----------------|
| **Main** | `src/main/` | Window lifecycle, app menu, IPC handlers (file system, dialogs, AI) |
| **Preload** | `src/preload/` | Safe bridge; exposes `window.asterisk` API to renderer |
| **Renderer** | `src/renderer/src/` | React app: TopBar, Sidebar, Editor, Preview, Canvas, AIChat, Calendar, Settings |

IPC is used for all file and system access; the renderer never imports Node directly.

---

## Project structure

```
Asteris/
├── src/
│   ├── main/
│   │   ├── index.ts           # App entry, window creation
│   │   ├── menu.ts            # Application menu
│   │   └── ipc/
│   │       ├── handlers.ts    # IPC registration
│   │       └── fileSystem.ts  # File ops, search, tree
│   ├── preload/
│   │   ├── index.ts           # window.asterisk API
│   │   └── types.ts           # Shared TS types
│   └── renderer/
│       ├── index.html
│       └── src/
│           ├── main.tsx       # React entry
│           ├── App.tsx       # Root layout
│           ├── types/        # Shared types
│           ├── store/        # useWorkspace, useSettings, useArtifacts, useAIChat
│           ├── hooks/        # useAutoSave, useFileOps
│           ├── styles/       # global.css, layout.css
│           └── components/
│               ├── TopBar/
│               ├── Sidebar/   # File tree, filter bar, context menu
│               ├── Editor/    # CodeMirror, tabs, commands
│               ├── Preview/
│               ├── Canvas/    # Artifacts (nodes, edges, toolbar)
│               ├── AIChat/
│               ├── Calendar/
│               ├── NeuralGraph/
│               └── Settings/
├── electron.vite.config.ts
├── package.json
└── README.md
```

---

## Conventions

- **State:** Zustand stores; no Redux.
- **Styling:** Component-level CSS files next to components (`Component.tsx` + `Component.css`).
- **IPC:** All node/fs/dialog usage in main; renderer uses `window.asterisk` only.

---

## License

MIT © Jan Kouba
