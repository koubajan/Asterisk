import { useState, useRef, useEffect } from 'react'
import { X, Send, Sparkles, LayoutGrid } from 'lucide-react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { useAIChat, type AIProvider, AI_MODELS } from '../../store/useAIChat'
import { useWorkspace } from '../../store/useWorkspace'
import { useArtifacts } from '../../store/useArtifacts'
import type { CanvasNode, CanvasEdge } from '../../types/canvas'
import DiffPreview from './DiffPreview'
import './AIChat.css'

const REVEAL_WORD_MS = 36
const WORD_REGEX = /\s+|\S+/g
function wordCount(str: string): string[] {
  return str.match(WORD_REGEX) ?? []
}

interface ArtifactCommand {
  action: 'add_node' | 'update_node' | 'remove_node' | 'add_edge' | 'remove_edge' | 'create_group'
  type?: CanvasNode['type']
  content?: string
  title?: string
  x?: number
  y?: number
  width?: number
  height?: number
  id?: string
  tempId?: string
  updates?: Partial<CanvasNode>
  from?: string
  to?: string
  label?: string
  color?: string
  backgroundColor?: string
  childIds?: string[]
  nodeIds?: string[]
}

function generateNodeId(): string {
  return `node-${Math.random().toString(36).slice(2, 12)}`
}

function extractArtifactCommands(text: string): ArtifactCommand[] {
  const match = text.match(/```artifact\n?([\s\S]*?)```/)
  if (!match) return []
  const block = match[1].trim()
  const commands: ArtifactCommand[] = []
  const lines = block.split('\n').filter((l) => l.trim())
  for (const line of lines) {
    try {
      const cmd = JSON.parse(line) as ArtifactCommand
      if (cmd.action) commands.push(cmd)
    } catch {
      // skip invalid JSON
    }
  }
  return commands
}

interface FilePreviewCache {
  [path: string]: string | null
}

function summarizeArtifactForAI(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  fileContents: FilePreviewCache,
  workspaceFiles: string[]
): string {
  const groups = nodes.filter((n) => n.type === 'group')
  const regularNodes = nodes.filter((n) => n.type !== 'group')
  
  const nodesSummary = regularNodes.map((n) => {
    const base: Record<string, unknown> = {
      id: n.id,
      type: n.type,
      x: Math.round(n.x),
      y: Math.round(n.y),
      width: n.width,
      height: n.height
    }
    if (n.title) base.title = n.title
    if (n.color) base.borderColor = n.color
    if (n.backgroundColor) base.backgroundColor = n.backgroundColor
    
    if (n.type === 'file' && n.content) {
      base.filePath = n.content
      const fileContent = fileContents[n.content]
      if (fileContent) {
        base.fileContent = fileContent.length > 500 ? fileContent.slice(0, 500) + '...' : fileContent
      }
    } else if (n.type === 'text') {
      base.content = n.content.length > 300 ? n.content.slice(0, 300) + '...' : n.content
    } else if (n.type === 'link') {
      base.url = n.content
      base.embedded = n.embed ?? true
    } else if (n.type === 'image') {
      base.imagePath = n.content
    } else {
      base.content = n.content
    }
    return base
  })
  
  const groupsSummary = groups.map((g) => ({
    id: g.id,
    type: 'group',
    title: g.title || 'Untitled Group',
    x: Math.round(g.x),
    y: Math.round(g.y),
    width: g.width,
    height: g.height,
    childIds: g.childIds || [],
    color: g.color,
    backgroundColor: g.backgroundColor
  }))
  
  const edgesSummary = edges.map((e) => ({
    id: e.id,
    fromNodeId: e.from,
    toNodeId: e.to,
    label: e.label || undefined,
    color: e.color || undefined
  }))
  
  return JSON.stringify({
    nodes: nodesSummary,
    groups: groupsSummary,
    edges: edgesSummary,
    workspaceFiles_USE_THESE_EXACT_PATHS: workspaceFiles.slice(0, 50)
  }, null, 2)
}

interface AIChatProps {
  onClose: () => void
}

function extractCodeBlock(text: string): string | null {
  const m = text.match(/```(?:[\w]*)\n?([\s\S]*?)```/)
  return m ? m[1].trim() : null
}

/** Detect if the string looks like HTML (e.g. AI returned HTML instead of markdown). */
function looksLikeHtml(text: string): boolean {
  const t = text.trim()
  return t.startsWith('<') && /<\/?[a-z][\s\S]*>/i.test(t)
}

/** Extract markdown/code from HTML for "Apply" so we don't write raw HTML into the file. */
function extractMarkdownFromHtml(html: string): string {
  const preCode = html.match(/<pre[^>]*>[\s\S]*?<code[^>]*>([\s\S]*?)<\/code>[\s\S]*?<\/pre>/i)
  if (preCode) return preCode[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim()
  const code = html.match(/<code[^>]*>([\s\S]*?)<\/code>/i)
  if (code) return code[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim()
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return (doc.body?.textContent ?? html).trim()
}

function flattenTree(nodes: { path: string; kind: string; children: any[] }[]): string[] {
  const paths: string[] = []
  for (const n of nodes) {
    if (n.kind === 'file') paths.push(n.path)
    if (n.kind === 'folder' && n.children) paths.push(...flattenTree(n.children))
  }
  return paths
}

export default function AIChat({ onClose }: AIChatProps) {
  const [input, setInput] = useState('')
  const [includeFile, setIncludeFile] = useState(true)
  const [includeArtifact, setIncludeArtifact] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [diffState, setDiffState] = useState<{ oldContent: string; newContent: string } | null>(null)
  const [revealedWords, setRevealedWords] = useState(0)
  const [pendingArtifactCommands, setPendingArtifactCommands] = useState<ArtifactCommand[]>([])
  const [fileContentsCache, setFileContentsCache] = useState<FilePreviewCache>({})
  const lastAssistantContentRef = useRef<string | null>(null)
  const wasLoadingRef = useRef(false)

  const openFile = useWorkspace((s) => s.openFiles[s.activeFileIndex] ?? null)
  const updateContent = useWorkspace((s) => s.updateContent)
  const tree = useWorkspace((s) => s.tree)
  const workspacePath = useWorkspace((s) => s.workspaces[s.activeWorkspaceIndex]?.path ?? '')
  
  const isArtifact = openFile?.path?.endsWith('.artifact') ?? false
  const artifactData = useArtifacts((s) => s.data)
  const addNode = useArtifacts((s) => s.addNode)
  const updateNode = useArtifacts((s) => s.updateNode)
  const removeNode = useArtifacts((s) => s.removeNode)
  const addEdge = useArtifacts((s) => s.addEdge)
  const removeEdge = useArtifacts((s) => s.removeEdge)
  
  const workspaceFilesAbsolute = flattenTree(tree)
  const workspaceFilesRelative = workspaceFilesAbsolute.map((p) => p.replace(workspacePath + '/', ''))
  
  useEffect(() => {
    if (!isArtifact) return
    const fileNodes = artifactData.nodes.filter((n) => n.type === 'file' && n.content)
    const toLoad = fileNodes.filter((n) => !fileContentsCache[n.content])
    if (toLoad.length === 0) return
    
    Promise.all(
      toLoad.map(async (n) => {
        const path = n.content
        try {
          const res = await window.asterisk.readFile(path)
          return { path, content: res.ok && res.data?.content ? res.data.content : null }
        } catch {
          return { path, content: null }
        }
      })
    ).then((results) => {
      setFileContentsCache((prev) => {
        const next = { ...prev }
        for (const r of results) {
          next[r.path] = r.content
        }
        return next
      })
    })
  }, [isArtifact, artifactData.nodes, fileContentsCache])

  const { messages, loading, error, provider, model, setProvider, setModel, sendMessage, clearMessages, setError, pendingPrompt, setPendingPrompt } = useAIChat()
  const modelOptions = AI_MODELS[provider] ?? []
  const currentModel = modelOptions.find((m) => m.id === model) ?? modelOptions[0]

  // Keep model in sync when provider list doesn't include current model (e.g. deprecated)
  useEffect(() => {
    if (modelOptions.length && !modelOptions.some((m) => m.id === model)) {
      setModel(modelOptions[0].id)
    }
  }, [provider, model, modelOptions, setModel])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const lastAssistant = messages.filter((m) => m.role === 'assistant').pop()
  const lastContent = lastAssistant?.content ?? ''
  const words = wordCount(lastContent)
  const totalWords = words.length

  useEffect(() => {
    if (loading) {
      wasLoadingRef.current = true
      return
    }
    if (!lastContent) {
      lastAssistantContentRef.current = null
      wasLoadingRef.current = false
      setRevealedWords(0)
      return
    }
    const isNewContent = lastAssistantContentRef.current !== lastContent
    lastAssistantContentRef.current = lastContent
    if (isNewContent && wasLoadingRef.current) {
      wasLoadingRef.current = false
      setRevealedWords(0)
    } else {
      wasLoadingRef.current = false
      setRevealedWords(totalWords)
    }
  }, [lastContent, loading, totalWords])

  useEffect(() => {
    if (loading || totalWords === 0) return
    if (revealedWords >= totalWords) return
    const t = setInterval(() => {
      setRevealedWords((n) => Math.min(n + 1, totalWords))
    }, REVEAL_WORD_MS)
    return () => clearInterval(t)
  }, [loading, revealedWords, totalWords])

  // When opened via command, send the pending prompt (syntax commands use apply-friendly: send .md + ask for code block)
  useEffect(() => {
    if (!pendingPrompt) return
    const { pendingPromptApplyFriendly } = useAIChat.getState()
    const forceIncludeFile = pendingPromptApplyFriendly && openFile?.path && /\.(md|markdown)$/i.test(openFile.path)
    const fileContext = forceIncludeFile ? openFile!.content : (includeFile && openFile?.path && /\.(md|markdown)$/i.test(openFile.path) ? openFile.content : undefined)
    const message = pendingPromptApplyFriendly
      ? `${pendingPrompt}\n\nReply with only the revised markdown in a single code block (\`\`\`markdown ... \`\`\`) so I can apply the changes.`
      : pendingPrompt
    setPendingPrompt(null)
    sendMessage(message, fileContext)
  }, [pendingPrompt])

  const fileContext = includeFile && openFile?.path && /\.(md|markdown)$/i.test(openFile.path) ? openFile.content : undefined
  
  const artifactContext = isArtifact && includeArtifact
    ? `[ARTIFACT CANVAS CONTEXT]
This is a visual canvas artifact with nodes (cards) and connections (edges). You can add, edit, remove, connect, and group nodes.

CURRENT STATE:
${summarizeArtifactForAI(artifactData.nodes, artifactData.edges, fileContentsCache, workspaceFilesAbsolute)}

AVAILABLE COMMANDS (respond with \`\`\`artifact code block, one JSON per line):

1. ADD NODE with tempId (for connecting new nodes):
{"action": "add_node", "tempId": "new-1", "type": "text", "content": "Node content here", "title": "Title", "x": 100, "y": 100, "width": 240, "height": 140}
- Use tempId (like "new-1", "new-2") to reference new nodes in edges/groups
- Position using formula: x = col*300+100, y = row*250+100

2. ADD FILE NODE (ONLY use existing files from workspaceFiles!):
{"action": "add_node", "tempId": "file1", "type": "file", "content": "${workspaceFilesAbsolute[0] || workspacePath + '/example.md'}", "x": 100, "y": 100, "width": 300, "height": 220}
- CRITICAL: Only use EXACT paths from workspaceFiles_USE_THESE_EXACT_PATHS list
- NEVER invent file paths - if no file exists, use a text node instead

3. CONNECT NODES - Use tempId for new nodes or existing node IDs:
{"action": "add_edge", "from": "new-1", "to": "new-2", "label": "relates to"}
{"action": "add_edge", "from": "node-existing123", "to": "new-1"}
- For existing nodes: use their exact ID from the nodes list above
- For new nodes: use the tempId you assigned in add_node

4. UPDATE existing node:
{"action": "update_node", "id": "node-abc123", "updates": {"title": "New Title", "content": "New content"}}
{"action": "update_node", "id": "node-abc123", "updates": {"x": 300, "y": 400, "width": 300, "height": 200}}
{"action": "update_node", "id": "node-abc123", "updates": {"color": "#ef4444", "backgroundColor": "#fef2f2"}}

5. REMOVE NODE/EDGE:
{"action": "remove_node", "id": "node-abc123"}
{"action": "remove_edge", "id": "edge-xyz789"}

6. CREATE GROUP - Can use tempIds for newly created nodes:
{"action": "create_group", "title": "My Group", "nodeIds": ["new-1", "new-2", "node-existing"], "color": "#3b82f6"}

EXAMPLE - Hierarchy with group (parent at top, children below, grouped):
\`\`\`artifact
{"action": "add_node", "tempId": "main", "type": "text", "content": "Main concept overview", "title": "Main Topic", "x": 400, "y": 100, "width": 240, "height": 140}
{"action": "add_node", "tempId": "child1", "type": "text", "content": "First sub-topic details", "title": "Sub A", "x": 100, "y": 350, "width": 240, "height": 140}
{"action": "add_node", "tempId": "child2", "type": "text", "content": "Second sub-topic details", "title": "Sub B", "x": 400, "y": 350, "width": 240, "height": 140}
{"action": "add_node", "tempId": "child3", "type": "text", "content": "Third sub-topic details", "title": "Sub C", "x": 700, "y": 350, "width": 240, "height": 140}
{"action": "add_edge", "from": "main", "to": "child1"}
{"action": "add_edge", "from": "main", "to": "child2"}
{"action": "add_edge", "from": "main", "to": "child3"}
{"action": "create_group", "title": "Related Items", "nodeIds": ["child1", "child2", "child3"], "color": "#3b82f6"}
\`\`\`

LAYOUT PATTERNS (choose based on content):

1. HORIZONTAL ROW (for sequential/equal items):
   y=200 for all, x increases: 100, 400, 700, 1000...
   
2. VERTICAL COLUMN (for lists/steps):
   x=300 for all, y increases: 100, 320, 540, 760...
   
3. HIERARCHY (parent → children):
   Parent: x=400, y=100
   Children row: y=350, spread horizontally: x=100, x=400, x=700
   
4. MIND MAP (central + radiating):
   Center: x=500, y=400
   Top: x=500, y=100
   Bottom: x=500, y=700
   Left: x=100, y=400
   Right: x=900, y=400
   
5. GRID (for many items):
   Row 1: y=100,  x=100, 400, 700
   Row 2: y=350,  x=100, 400, 700
   Row 3: y=600,  x=100, 400, 700

SPACING CONSTANTS:
- Node width: 240 (text), 300 (file/image)
- Node height: 140 (text), 220 (file/image)
- Horizontal gap: 160px between nodes
- Vertical gap: 210px between rows
- Group padding: 60px around contained nodes

POSITIONING FORMULA:
- x = column * 300 + 100  (col 0,1,2,3...)
- y = row * 250 + 100     (row 0,1,2,3...)

OTHER RULES:
- For existing nodes: use exact IDs like "node-k7f2m9xp1c" from the current state
- For new nodes: assign a tempId and use it in edges/groups
- File paths: ONLY use paths from workspaceFiles list - never invent paths
- Colors: "#ef4444" (red), "#22c55e" (green), "#3b82f6" (blue), "#a855f7" (purple), "#f59e0b" (amber)
[/ARTIFACT CANVAS CONTEXT]`
    : undefined

  async function handleSend() {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    const context = artifactContext || fileContext
    await sendMessage(text, context)
  }

  function handleApplyFromLast() {
    const last = messages.filter((m) => m.role === 'assistant').pop()
    if (!last || !openFile) return
    let newContent: string
    const code = extractCodeBlock(last.content)
    if (code != null) {
      newContent = code
    } else if (looksLikeHtml(last.content)) {
      newContent = extractMarkdownFromHtml(last.content)
    } else {
      newContent = last.content
    }
    setDiffState({ oldContent: openFile.content, newContent })
  }

  function handlePreviewArtifactChanges() {
    const last = messages.filter((m) => m.role === 'assistant').pop()
    if (!last) return
    const commands = extractArtifactCommands(last.content)
    if (commands.length > 0) {
      setPendingArtifactCommands(commands)
    }
  }

  function handleApplyArtifactCommands() {
    const tempIdToRealId: Record<string, string> = {}
    const createdNodes: { id: string; x: number; y: number; width: number; height: number }[] = []
    
    for (const cmd of pendingArtifactCommands) {
      if (cmd.action === 'add_node' && cmd.tempId) {
        const realId = generateNodeId()
        tempIdToRealId[cmd.tempId] = realId
      }
    }
    
    const resolveId = (id: string | undefined): string | undefined => {
      if (!id) return id
      return tempIdToRealId[id] || id
    }
    
    const resolveIds = (ids: string[] | undefined): string[] | undefined => {
      if (!ids) return ids
      return ids.map((id) => tempIdToRealId[id] || id)
    }
    
    for (const cmd of pendingArtifactCommands) {
      switch (cmd.action) {
        case 'add_node': {
          const type = cmd.type || 'text'
          const x = cmd.x ?? 100
          const y = cmd.y ?? 100
          const width = cmd.width ?? (type === 'text' ? 200 : 280)
          const height = cmd.height ?? (type === 'text' ? 80 : 120)
          const realId = cmd.tempId ? tempIdToRealId[cmd.tempId] : undefined
          
          if (realId) {
            useArtifacts.setState((s) => ({
              ...s,
              data: {
                ...s.data,
                nodes: [...s.data.nodes, {
                  id: realId,
                  type,
                  content: cmd.content ?? '',
                  title: cmd.title,
                  x,
                  y,
                  width,
                  height,
                  color: cmd.color,
                  backgroundColor: cmd.backgroundColor
                }]
              },
              isDirty: true
            }))
            createdNodes.push({ id: realId, x, y, width, height })
          } else {
            addNode({
              type,
              content: cmd.content ?? '',
              title: cmd.title,
              x,
              y,
              width,
              height,
              color: cmd.color,
              backgroundColor: cmd.backgroundColor
            })
          }
          break
        }
        case 'update_node': {
          const id = resolveId(cmd.id)
          if (id && cmd.updates) {
            updateNode(id, cmd.updates)
          }
          break
        }
        case 'remove_node': {
          const id = resolveId(cmd.id)
          if (id) {
            removeNode(id)
          }
          break
        }
        case 'add_edge': {
          const from = resolveId(cmd.from)
          const to = resolveId(cmd.to)
          if (from && to) {
            addEdge(from, to, cmd.label)
          }
          break
        }
        case 'remove_edge': {
          if (cmd.id) {
            removeEdge(cmd.id)
          }
          break
        }
        case 'create_group': {
          const nodeIds = resolveIds(cmd.nodeIds)
          if (nodeIds && nodeIds.length > 0) {
            const currentNodes = useArtifacts.getState().data.nodes
            const nodesToGroup = [
              ...currentNodes.filter((n) => nodeIds.includes(n.id)),
              ...createdNodes.filter((n) => nodeIds.includes(n.id))
            ]
            if (nodesToGroup.length > 0) {
              const minX = Math.min(...nodesToGroup.map((n) => n.x))
              const minY = Math.min(...nodesToGroup.map((n) => n.y))
              const maxX = Math.max(...nodesToGroup.map((n) => n.x + n.width))
              const maxY = Math.max(...nodesToGroup.map((n) => n.y + n.height))
              const headerHeight = 36
              addNode({
                type: 'group',
                x: minX - 16,
                y: minY - headerHeight - 12,
                width: maxX - minX + 32,
                height: maxY - minY + headerHeight + 24,
                content: '',
                title: cmd.title || 'Group',
                childIds: nodeIds,
                color: cmd.color,
                backgroundColor: cmd.backgroundColor
              })
            }
          }
          break
        }
      }
    }
    setPendingArtifactCommands([])
  }

  const isMd = openFile?.path != null && /\.(md|markdown)$/i.test(openFile.path)
  const canApply = openFile && isMd && lastAssistant && (extractCodeBlock(lastAssistant.content) != null || lastAssistant.content.trim().length > 0)
  const artifactCommands = lastAssistant ? extractArtifactCommands(lastAssistant.content) : []
  const canApplyArtifact = isArtifact && artifactCommands.length > 0

  return (
    <div className="ai-panel">
      <div className="ai-panel-header">
        <span className="ai-panel-title">
          <Sparkles size={14} strokeWidth={2} />
          Assistant
        </span>
        <button type="button" className="ai-panel-close" onClick={onClose} aria-label="Close">
          <X size={16} strokeWidth={2} />
        </button>
      </div>
      <div className="ai-panel-controls">
        <div className="ai-panel-control-row">
          <span className="ai-panel-label">Provider</span>
          <select
            className="ai-panel-select"
            value={provider}
            onChange={(e) => setProvider(e.target.value as AIProvider)}
            aria-label="AI provider"
          >
            <option value="openai">OpenAI</option>
            <option value="anthropic">Claude</option>
            <option value="gemini">Gemini</option>
          </select>
        </div>
        <div className="ai-panel-control-row">
          <span className="ai-panel-label">Model</span>
          <select
            className="ai-panel-select"
            value={currentModel?.id ?? model}
            onChange={(e) => setModel(e.target.value)}
            aria-label="Model"
          >
            {modelOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && (
        <div className="ai-panel-error">
          {error}
          <button type="button" className="ai-panel-error-dismiss" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}
      <div className="ai-panel-messages">
        {messages.length === 0 && !loading && (
          <div className="ai-panel-empty">
            {isArtifact 
              ? 'Ask me to add nodes, connect them, create groups, or organize your canvas. I can see all your nodes and workspace files.'
              : 'Ask for refactors, fixes, or explanations. Include your current file for better answers.'}
          </div>
        )}
        {messages.map((msg, i) => {
          const isLastAssistant = msg.role === 'assistant' && i === messages.length - 1
          const displayContent = isLastAssistant && revealedWords < totalWords
            ? words.slice(0, revealedWords).join('')
            : msg.content
          const html = !displayContent
            ? ''
            : looksLikeHtml(displayContent)
              ? DOMPurify.sanitize(displayContent, {
                  ADD_TAGS: ['input', 'pre', 'code'],
                  ADD_ATTR: ['type', 'checked']
                })
              : DOMPurify.sanitize(marked.parse(displayContent) as string, {
                  ADD_TAGS: ['input'],
                  ADD_ATTR: ['type', 'checked']
                })
          return (
            <div key={i} className={`ai-msg ${msg.role}`}>
              <div
                className="ai-msg-body ai-msg-markdown"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </div>
          )
        })}
        {loading && (
          <div className="ai-msg assistant ai-msg-typing" aria-label="Thinking">
            <div className="ai-typing-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      {canApply && (
        <div className="ai-panel-actions">
          <button type="button" className="ai-panel-apply" onClick={handleApplyFromLast}>
            Apply suggested changes to file
          </button>
        </div>
      )}
      {canApplyArtifact && (
        <div className="ai-panel-actions">
          <button type="button" className="ai-panel-apply ai-panel-apply-artifact" onClick={handlePreviewArtifactChanges}>
            <LayoutGrid size={14} strokeWidth={1.7} />
            Preview artifact changes ({artifactCommands.length} {artifactCommands.length === 1 ? 'operation' : 'operations'})
          </button>
        </div>
      )}
      <div className="ai-panel-input-wrap">
        {openFile && openFile.path && /\.(md|markdown)$/i.test(openFile.path) && (
          <label className="ai-panel-context">
            <input
              type="checkbox"
              checked={includeFile}
              onChange={(e) => setIncludeFile(e.target.checked)}
            />
            <span className="ai-panel-context-label">
              <span className="ai-panel-context-filename">{openFile.name}</span>
              {' — Include current file'}
            </span>
          </label>
        )}
        {isArtifact && (
          <label className="ai-panel-context ai-panel-context-artifact">
            <input
              type="checkbox"
              checked={includeArtifact}
              onChange={(e) => setIncludeArtifact(e.target.checked)}
            />
            <span className="ai-panel-context-label">
              <LayoutGrid size={12} strokeWidth={1.7} />
              <span className="ai-panel-context-filename">{openFile?.name}</span>
              {' — Include artifact context'}
              <span className="ai-panel-context-count">({artifactData.nodes.length} nodes)</span>
            </span>
          </label>
        )}
        <div className="ai-panel-input-row">
          <textarea
            className={`ai-panel-input ${!input.trim() ? 'ai-panel-input-placeholder-center' : ''}`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder="Ask anything…"
            rows={2}
            disabled={loading}
          />
          <button
            type="button"
            className="ai-panel-send"
            onClick={handleSend}
            disabled={loading || !input.trim()}
            aria-label="Send"
          >
            <Send size={16} strokeWidth={2} />
          </button>
        </div>
      </div>
      {diffState && (
        <DiffPreview
          oldContent={diffState.oldContent}
          newContent={diffState.newContent}
          onApply={(newContent) => {
            updateContent(newContent)
            setDiffState(null)
          }}
          onClose={() => setDiffState(null)}
        />
      )}
      {pendingArtifactCommands.length > 0 && (
        <div className="ai-artifact-preview-overlay" onClick={(e) => e.target === e.currentTarget && setPendingArtifactCommands([])}>
          <div className="ai-artifact-preview">
            <div className="ai-artifact-preview-header">
              <LayoutGrid size={16} strokeWidth={1.7} />
              <span>Artifact Changes Preview</span>
              <button type="button" className="ai-artifact-preview-close" onClick={() => setPendingArtifactCommands([])}>
                <X size={16} strokeWidth={2} />
              </button>
            </div>
            <div className="ai-artifact-preview-content">
              <p className="ai-artifact-preview-summary">
                {pendingArtifactCommands.length} {pendingArtifactCommands.length === 1 ? 'change' : 'changes'} will be applied:
              </p>
              <ul className="ai-artifact-preview-list">
                {pendingArtifactCommands.map((cmd, i) => (
                  <li key={i} className={`ai-artifact-cmd ai-artifact-cmd-${cmd.action}`}>
                    {cmd.action === 'add_node' && (
                      <span>
                        <strong>Add</strong> {cmd.type} node
                        {cmd.title && <> titled "{cmd.title}"</>}
                        {cmd.content && !cmd.title && <> with content: "{cmd.content.slice(0, 50)}{cmd.content.length > 50 ? '...' : ''}"</>}
                      </span>
                    )}
                    {cmd.action === 'update_node' && (
                      <span>
                        <strong>Update</strong> node <code>{cmd.id}</code>
                        {cmd.updates?.title && <> title to "{cmd.updates.title}"</>}
                        {cmd.updates?.content && <> content</>}
                        {(cmd.updates?.x !== undefined || cmd.updates?.y !== undefined) && <> position</>}
                        {(cmd.updates?.width !== undefined || cmd.updates?.height !== undefined) && <> size</>}
                        {(cmd.updates?.color || cmd.updates?.backgroundColor) && <> colors</>}
                      </span>
                    )}
                    {cmd.action === 'remove_node' && (
                      <span><strong>Remove</strong> node <code>{cmd.id}</code></span>
                    )}
                    {cmd.action === 'add_edge' && (
                      <span>
                        <strong>Connect</strong> <code>{cmd.from}</code> → <code>{cmd.to}</code>
                        {cmd.label && <> with label "{cmd.label}"</>}
                      </span>
                    )}
                    {cmd.action === 'remove_edge' && (
                      <span><strong>Remove</strong> connection <code>{cmd.id}</code></span>
                    )}
                    {cmd.action === 'create_group' && (
                      <span>
                        <strong>Group</strong> {cmd.nodeIds?.length || 0} nodes
                        {cmd.title && <> as "{cmd.title}"</>}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            <div className="ai-artifact-preview-actions">
              <button type="button" className="ai-artifact-preview-cancel" onClick={() => setPendingArtifactCommands([])}>
                Cancel
              </button>
              <button type="button" className="ai-artifact-preview-apply" onClick={handleApplyArtifactCommands}>
                Apply Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
