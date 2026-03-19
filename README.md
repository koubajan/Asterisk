# Asterisk

<div align="center">

![License](https://img.shields.io/badge/license-Personal%20Use-orange.svg)
![Electron](https://img.shields.io/badge/Electron-34-47848F?logo=electron)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite)

</div>

A dark-themed **Markdown note editor** for desktop with canvas artifacts, Excalidraw drawings, AI assistant, version history, and calendar. Built with Electron and React for a fast, local-first workflow.

---

## Overview

Asterisk lets you work in a folder-based workspace: edit Markdown with live preview, manage notes in a file tree (with drag-and-drop), and use **Artifacts** — canvas boards stored as `.artifact` files — for cards, links, images, and connections. Create **Excalidraw** drawings directly in the app. An in-app **AI assistant** (OpenAI, Anthropic, Gemini) can suggest edits and manipulate artifacts. **Version history** lets you restore previous file states, and a **calendar** view surfaces notes with `scheduled` frontmatter. Theming, export (HTML, PDF, etc.), and keyboard-driven UX round out the experience and much more.

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
| `npm run dist` | Build and package installers |
| `npm run typecheck` | TypeScript check (node + renderer) |

**App icons:** Located in `resources/` folder:
- `macos_icon.icns` — macOS
- `windows_icon.ico` — Windows
- `linux_icon.png` — Linux

---

## Features

### Editor & preview

- **CodeMirror 6** — Markdown editing with syntax highlighting (highlight.js), line wrapping, and configurable font size / tab size
- **Live preview** — Split view with resizable editor/preview; rendered with **marked**, sanitized with **DOMPurify**
- **Slash commands** — Quick actions (e.g. `/ask` to open AI chat)
- **Content search** — Full-text search across the workspace

### Workspace

- **Open workspace** — Point at a folder; file tree with expand/collapse and filters
- **Tabs** — Multiple open files; reorder by drag; close with middle-click or context
- **Drag-and-drop** — Move files or folders between directories in the tree
- **Context menu** — New file/folder, rename, delete, tags

### Version history

- **Automatic snapshots** — Save file versions on manual save or autosave (configurable)
- **History panel** — View all snapshots with timestamps and sizes
- **Restore** — Preview and restore any previous version
- **Storage** — Snapshots stored in `.history/` folder in your workspace

### Artifacts (canvas)

- **Canvas boards** — Stored as `.artifact` JSON files in your workspace
- **Node types** — Text (Markdown), file (link to workspace file), link (URL/YouTube embed), image, group
- **File previews** — Markdown, code with syntax highlighting, CSV tables, PDF, Excalidraw drawings
- **Connections** — Edges between nodes with optional labels
- **Layout** — Align, distribute, group; **auto-layout** (grid, layered DAG via dagre, force-directed via d3-force); pan and zoom; grid snapping
- **History** — Undo / redo (⌘Z, ⌘⇧Z) with toolbar back/forward buttons
- **Export** — Export canvas as PNG image
- **Presentation mode** — Step through nodes as slides with keyboard navigation

### Excalidraw

- **Native integration** — Create `.excalidraw` drawings directly in the app
- **Canvas embedding** — Excalidraw files render as previews in artifact nodes
- **Auto-scaling** — Drawings scale to fit node size

### AI assistant

- **In-app chat** — Side panel; resizable
- **Providers** — OpenAI, Anthropic, Gemini (API keys in Settings)
- **File context** — Optional inclusion of current file for edits
- **Artifact manipulation** — AI can add, update, remove, connect nodes and create groups
- **Diff view** — Review and apply suggested changes to files

### Calendar & scheduling

- **Scheduled notes** — Frontmatter: `scheduled: "YYYY-MM-DD"` or ISO datetime
- **Calendar view** — Month grid; click to set/clear date for the active note
- **Upcoming** — Sidebar list of upcoming scheduled notes
- **Reminders** — Desktop notifications for scheduled notes (configurable)

### Theming & export

- **Themes** — Preset colors and custom themes; accent, background, text; export/import JSON
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
| **@excalidraw/excalidraw** | Drawing canvas |
| **Mermaid** | Diagram rendering |

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
| **D3** | Graph visualization (neural / note graph); **d3-force** for artifact auto-layout |
| **dagre** | Layered directed graph layout for artifacts |
| **Custom canvas** | Artifact board (nodes, edges, pan/zoom) |

---

## Architecture

Standard Electron three-process layout:

| Context | Path | Responsibility |
|---------|------|-----------------|
| **Main** | `src/main/` | Window lifecycle, app menu, IPC handlers (file system, dialogs, AI, reminders) |
| **Preload** | `src/preload/` | Safe bridge; exposes `window.asterisk` API to renderer |
| **Renderer** | `src/renderer/src/` | React app: TopBar, Sidebar, Editor, Preview, Canvas, AIChat, Calendar, Settings, History |

IPC is used for all file and system access; the renderer never imports Node directly.

---

## Project structure

```
Asteris/
├── resources/
│   ├── macos_icon.icns
│   ├── windows_icon.ico
│   └── linux_icon.png
├── src/
│   ├── main/
│   │   ├── index.ts           # App entry, window creation
│   │   ├── menu.ts            # Application menu
│   │   └── ipc/
│   │       ├── handlers.ts    # IPC registration
│   │       ├── fileSystem.ts  # File ops, search, tree, version history
│   │       ├── ai.ts          # AI provider integration
│   │       └── reminders.ts   # Desktop notifications
│   ├── preload/
│   │   ├── index.ts           # window.asterisk API
│   │   └── types.ts           # Shared TS types
│   └── renderer/
│       ├── index.html
│       └── src/
│           ├── main.tsx       # React entry
│           ├── App.tsx        # Root layout
│           ├── types/         # Shared types
│           ├── store/         # useWorkspace, useSettings, useArtifacts, useAIChat
│           ├── hooks/         # useAutoSave, useFileOps
│           ├── styles/        # global.css, layout.css
│           └── components/
│               ├── TopBar/
│               ├── Sidebar/       # File tree, filter bar, context menu
│               ├── Editor/        # CodeMirror, tabs, Excalidraw pane
│               ├── Preview/
│               ├── Canvas/        # Artifacts (nodes, edges, toolbar, presentation)
│               ├── AIChat/
│               ├── Calendar/
│               ├── History/       # Version history panel
│               ├── NeuralGraph/
│               └── Settings/
├── electron.vite.config.ts
├── package.json
└── README.md
```

---

## Keyboard shortcuts

### App

| Action | Shortcut |
|--------|----------|
| Open folder | ⌘⇧O |
| New file | ⌘N |
| Save | ⌘S |
| Toggle sidebar | ⌘⇧B |
| Toggle preview | ⌘\ |
| Fullscreen | ⌘⇧F |

### Editor

| Action | Shortcut |
|--------|----------|
| Bold | ⌘B |
| Italic | ⌘I |
| Link | ⌘K |
| Find | ⌘F |
| Insert table | ⌘⇧T |

### Canvas

| Action | Shortcut |
|--------|----------|
| Undo | ⌘Z |
| Redo | ⌘⇧Z |

### Presentation mode

| Action | Shortcut |
|--------|----------|
| Next slide | → / ↓ / Space / Enter |
| Previous slide | ← / ↑ / Backspace |
| First slide | Home |
| Last slide | End |
| Toggle fullscreen | F |
| Exit presentation | Esc |

---

## Conventions

- **State:** Zustand stores; no Redux.
- **Styling:** Component-level CSS files next to components (`Component.tsx` + `Component.css`).
- **IPC:** All node/fs/dialog usage in main; renderer uses `window.asterisk` only.

---

## License

**Personal Use Only** — You may use this software for personal, non-commercial purposes. Redistribution is not permitted. See [LICENSE](LICENSE) for details.

© Jan Kouba
