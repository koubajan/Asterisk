import { useState, useEffect, useCallback } from 'react'
import {
  Bold, Italic, Strikethrough, Code, Link, Heading1, Heading2, Heading3,
  Quote, List, ListOrdered, CheckSquare, Minus, ChevronRight, Copy, ClipboardPaste,
  Table, FileText, GitBranch, Workflow, MessageSquare, Box, CircleDot, Database,
  Calendar, PieChart, Brain, Clock, GitMerge, Users, Network, Layers
} from 'lucide-react'
import type { EditorView } from '@codemirror/view'
import { EditorSelection } from '@codemirror/state'
import './EditorContextMenu.css'

interface MenuState {
  x: number
  y: number
}

interface EditorContextMenuProps {
  editorView: EditorView | null
}

function wrapSelection(view: EditorView, before: string, after: string) {
  view.focus()
  const changes = view.state.changeByRange((range) => {
    if (range.empty) {
      return {
        range: EditorSelection.cursor(range.from + before.length),
        changes: { from: range.from, insert: before + after }
      }
    }
    const selectedText = view.state.doc.sliceString(range.from, range.to)
    if (
      selectedText.startsWith(before) &&
      selectedText.endsWith(after) &&
      selectedText.length > before.length + after.length
    ) {
      const inner = selectedText.slice(before.length, selectedText.length - after.length)
      return {
        range: EditorSelection.range(range.from, range.from + inner.length),
        changes: { from: range.from, to: range.to, insert: inner }
      }
    }
    return {
      range: EditorSelection.range(range.from, range.to + before.length + after.length),
      changes: [
        { from: range.from, insert: before },
        { from: range.to, insert: after }
      ]
    }
  })
  view.dispatch(changes)
}

function prefixLine(view: EditorView, prefix: string) {
  view.focus()
  const { from } = view.state.selection.main
  const line = view.state.doc.lineAt(from)
  const lineText = line.text

  if (lineText.startsWith(prefix)) {
    view.dispatch({
      changes: { from: line.from, to: line.from + prefix.length, insert: '' }
    })
  } else {
    view.dispatch({
      changes: { from: line.from, insert: prefix }
    })
  }
}

function insertLink(view: EditorView) {
  view.focus()
  const { from, to } = view.state.selection.main
  if (from === to) {
    const insert = '[text](url)'
    view.dispatch({
      changes: { from, insert },
      selection: EditorSelection.range(from + 1, from + 5)
    })
  } else {
    const selectedText = view.state.doc.sliceString(from, to)
    const insert = `[${selectedText}](url)`
    view.dispatch({
      changes: { from, to, insert },
      selection: EditorSelection.range(from + selectedText.length + 3, from + insert.length - 1)
    })
  }
}

function insertMathInline(view: EditorView) {
  wrapSelection(view, '$', '$')
}

function insertMathBlock(view: EditorView) {
  view.focus()
  const { from } = view.state.selection.main
  const line = view.state.doc.lineAt(from)
  view.dispatch({
    changes: { from: line.to, insert: '\n\n$$\n\n$$\n' },
    selection: EditorSelection.cursor(line.to + 5)
  })
}

function insertFootnote(view: EditorView) {
  view.focus()
  const { from } = view.state.selection.main
  const insert = '[^1]'
  view.dispatch({
    changes: { from, insert },
    selection: EditorSelection.cursor(from + insert.length)
  })
}

function insertTable(view: EditorView) {
  view.focus()
  const { from } = view.state.selection.main
  const template = `| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
|          |          |          |`
  view.dispatch({
    changes: { from, insert: template },
    selection: EditorSelection.cursor(from + template.length)
  })
}

function insertHorizontalRule(view: EditorView) {
  view.focus()
  const { from } = view.state.selection.main
  const line = view.state.doc.lineAt(from)
  view.dispatch({ changes: { from: line.to, insert: '\n\n---\n' } })
}

function insertMermaidTemplate(view: EditorView, template: string) {
  view.focus()
  const { from } = view.state.selection.main
  const line = view.state.doc.lineAt(from)
  const insert = `\n\n\`\`\`mermaid\n${template}\n\`\`\`\n`
  view.dispatch({
    changes: { from: line.to, insert },
    selection: EditorSelection.cursor(line.to + insert.length - 5)
  })
}

const MERMAID_TEMPLATES = {
  flowchartBasic: `flowchart TD
    A[Start] --> B[Process]
    B --> C[End]`,

  flowchartDecision: `flowchart TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Action 1]
    B -->|No| D[Action 2]
    C --> E[End]
    D --> E`,

  flowchartComplex: `flowchart LR
    A[Input] --> B[Process 1]
    B --> C{Check}
    C -->|Pass| D[Process 2]
    C -->|Fail| E[Error Handler]
    D --> F[Output]
    E --> B`,

  sequence: `sequenceDiagram
    participant User
    participant System
    participant Database
    
    User->>System: Request
    System->>Database: Query
    Database-->>System: Result
    System-->>User: Response`,

  sequenceAlt: `sequenceDiagram
    actor User
    participant API
    participant Auth
    participant DB
    
    User->>API: Login Request
    API->>Auth: Validate Token
    alt Valid Token
        Auth-->>API: Token Valid
        API->>DB: Get User Data
        DB-->>API: User Data
        API-->>User: Success + Data
    else Invalid Token
        Auth-->>API: Token Invalid
        API-->>User: 401 Unauthorized
    end`,

  classDiagram: `classDiagram
    class Animal {
        +String name
        +int age
        +makeSound()
    }
    class Dog {
        +String breed
        +bark()
    }
    class Cat {
        +String color
        +meow()
    }
    Animal <|-- Dog
    Animal <|-- Cat`,

  classRelations: `classDiagram
    class User {
        +int id
        +String name
        +String email
        +login()
        +logout()
    }
    class Order {
        +int orderId
        +Date date
        +float total
        +process()
    }
    class Product {
        +int productId
        +String name
        +float price
    }
    User "1" --> "*" Order : places
    Order "*" --> "*" Product : contains`,

  stateDiagram: `stateDiagram-v2
    [*] --> Idle
    Idle --> Processing : Start
    Processing --> Success : Complete
    Processing --> Error : Fail
    Success --> [*]
    Error --> Idle : Retry`,

  stateNested: `stateDiagram-v2
    [*] --> Active
    state Active {
        [*] --> Idle
        Idle --> Running : start
        Running --> Paused : pause
        Paused --> Running : resume
        Running --> Idle : stop
    }
    Active --> Inactive : deactivate
    Inactive --> Active : activate
    Inactive --> [*]`,

  erDiagram: `erDiagram
    USER ||--o{ ORDER : places
    ORDER ||--|{ LINE_ITEM : contains
    PRODUCT ||--o{ LINE_ITEM : "ordered in"
    
    USER {
        int id PK
        string name
        string email
    }
    ORDER {
        int id PK
        date created
        string status
    }
    PRODUCT {
        int id PK
        string name
        float price
    }`,

  gantt: `gantt
    title Project Timeline
    dateFormat YYYY-MM-DD
    
    section Planning
    Research       :a1, 2024-01-01, 7d
    Design         :a2, after a1, 5d
    
    section Development
    Frontend       :b1, after a2, 14d
    Backend        :b2, after a2, 14d
    
    section Testing
    Integration    :c1, after b1, 7d
    UAT            :c2, after c1, 5d`,

  pie: `pie showData
    title Project Time Distribution
    "Development" : 45
    "Testing" : 25
    "Documentation" : 15
    "Meetings" : 15`,

  mindmap: `mindmap
    root((Project))
        Planning
            Requirements
            Timeline
            Budget
        Development
            Frontend
            Backend
            Database
        Testing
            Unit Tests
            Integration
            UAT
        Deployment
            Staging
            Production`,

  timeline: `timeline
    title Project Milestones
    
    2024-Q1 : Planning Phase
            : Requirements gathered
            : Team assembled
    
    2024-Q2 : Development Phase
            : MVP completed
            : Beta testing
    
    2024-Q3 : Launch Phase
            : Public release
            : Marketing campaign`,

  gitGraph: `gitGraph
    commit id: "Initial"
    branch develop
    checkout develop
    commit id: "Feature A"
    commit id: "Feature B"
    checkout main
    merge develop id: "Release v1.0"
    commit id: "Hotfix"
    branch feature
    checkout feature
    commit id: "New Feature"
    checkout main
    merge feature id: "Release v1.1"`,

  journey: `journey
    title User Shopping Experience
    
    section Browse
        Visit site: 5: User
        Search products: 4: User
        View details: 4: User
    
    section Purchase
        Add to cart: 5: User
        Checkout: 3: User
        Payment: 3: User, System
    
    section Delivery
        Confirmation: 5: System
        Shipping: 4: Delivery
        Received: 5: User`,

  architecture: `flowchart TB
    subgraph Client
        A[Web App]
        B[Mobile App]
    end
    
    subgraph Backend
        C[API Gateway]
        D[Auth Service]
        E[Main Service]
    end
    
    subgraph Data
        F[(Database)]
        G[(Cache)]
    end
    
    A --> C
    B --> C
    C --> D
    C --> E
    E --> F
    E --> G`,

  quadrant: `quadrantChart
    title Feature Priority Matrix
    x-axis Low Effort --> High Effort
    y-axis Low Impact --> High Impact
    
    quadrant-1 Quick Wins
    quadrant-2 Major Projects
    quadrant-3 Fill-ins
    quadrant-4 Time Sinks
    
    Feature A: [0.2, 0.8]
    Feature B: [0.7, 0.9]
    Feature C: [0.3, 0.3]
    Feature D: [0.8, 0.2]`
}

function copySelection(view: EditorView) {
  view.focus()
  const { from, to } = view.state.selection.main
  if (from === to) return
  const text = view.state.doc.sliceString(from, to)
  void navigator.clipboard.writeText(text)
}

function pasteAtCursor(view: EditorView) {
  view.focus()
  navigator.clipboard.readText().then((text) => {
    const { from } = view.state.selection.main
    view.dispatch({
      changes: { from, insert: text },
      selection: EditorSelection.cursor(from + text.length)
    })
  }).catch(() => {})
}

type IconComponent = React.ElementType

interface FormatItem {
  label: string
  icon: IconComponent
  shortcut?: string
  action: (v: EditorView) => void
}

interface ExpandableSection {
  id: string
  label: string
  icon: IconComponent
  items: FormatItem[]
}

const FORMAT_SECTION: ExpandableSection = {
  id: 'format',
  label: 'Format',
  icon: Bold,
  items: [
    { label: 'Bold', icon: Bold, shortcut: '⌘B', action: (v) => wrapSelection(v, '**', '**') },
    { label: 'Italic', icon: Italic, shortcut: '⌘I', action: (v) => wrapSelection(v, '_', '_') },
    { label: 'Strikethrough', icon: Strikethrough, action: (v) => wrapSelection(v, '~~', '~~') },
    { label: 'Code', icon: Code, action: (v) => wrapSelection(v, '`', '`') },
    { label: 'Math (inline)', icon: FileText, action: insertMathInline },
    { label: 'Math (block)', icon: FileText, action: insertMathBlock },
    { label: 'Heading 1', icon: Heading1, action: (v) => prefixLine(v, '# ') },
    { label: 'Heading 2', icon: Heading2, action: (v) => prefixLine(v, '## ') },
    { label: 'Heading 3', icon: Heading3, action: (v) => prefixLine(v, '### ') },
  ]
}

const PARAGRAPH_SECTION: ExpandableSection = {
  id: 'paragraph',
  label: 'Paragraph',
  icon: List,
  items: [
    { label: 'Bullet List', icon: List, action: (v) => prefixLine(v, '- ') },
    { label: 'Numbered List', icon: ListOrdered, action: (v) => prefixLine(v, '1. ') },
    { label: 'Task List', icon: CheckSquare, action: (v) => prefixLine(v, '- [ ] ') },
    { label: 'Quote', icon: Quote, action: (v) => prefixLine(v, '> ') },
  ]
}

const INSERT_SECTION: ExpandableSection = {
  id: 'insert',
  label: 'Insert',
  icon: Table,
  items: [
    { label: 'Table', icon: Table, action: insertTable },
    { label: 'Footnote', icon: FileText, action: insertFootnote },
    { label: 'Horizontal Rule', icon: Minus, action: insertHorizontalRule },
  ]
}

const DIAGRAMS_SECTION: ExpandableSection = {
  id: 'diagrams',
  label: 'Diagrams',
  icon: GitBranch,
  items: [
    { label: 'Flowchart (Basic)', icon: Workflow, action: (v) => insertMermaidTemplate(v, MERMAID_TEMPLATES.flowchartBasic) },
    { label: 'Flowchart (Decision)', icon: GitBranch, action: (v) => insertMermaidTemplate(v, MERMAID_TEMPLATES.flowchartDecision) },
    { label: 'Flowchart (Complex)', icon: Network, action: (v) => insertMermaidTemplate(v, MERMAID_TEMPLATES.flowchartComplex) },
    { label: 'Sequence Diagram', icon: MessageSquare, action: (v) => insertMermaidTemplate(v, MERMAID_TEMPLATES.sequence) },
    { label: 'Sequence (with Alt)', icon: MessageSquare, action: (v) => insertMermaidTemplate(v, MERMAID_TEMPLATES.sequenceAlt) },
    { label: 'Class Diagram', icon: Box, action: (v) => insertMermaidTemplate(v, MERMAID_TEMPLATES.classDiagram) },
    { label: 'Class (Relations)', icon: Layers, action: (v) => insertMermaidTemplate(v, MERMAID_TEMPLATES.classRelations) },
    { label: 'State Diagram', icon: CircleDot, action: (v) => insertMermaidTemplate(v, MERMAID_TEMPLATES.stateDiagram) },
    { label: 'State (Nested)', icon: CircleDot, action: (v) => insertMermaidTemplate(v, MERMAID_TEMPLATES.stateNested) },
    { label: 'ER Diagram', icon: Database, action: (v) => insertMermaidTemplate(v, MERMAID_TEMPLATES.erDiagram) },
    { label: 'Gantt Chart', icon: Calendar, action: (v) => insertMermaidTemplate(v, MERMAID_TEMPLATES.gantt) },
    { label: 'Pie Chart', icon: PieChart, action: (v) => insertMermaidTemplate(v, MERMAID_TEMPLATES.pie) },
    { label: 'Mind Map', icon: Brain, action: (v) => insertMermaidTemplate(v, MERMAID_TEMPLATES.mindmap) },
    { label: 'Timeline', icon: Clock, action: (v) => insertMermaidTemplate(v, MERMAID_TEMPLATES.timeline) },
    { label: 'Git Graph', icon: GitMerge, action: (v) => insertMermaidTemplate(v, MERMAID_TEMPLATES.gitGraph) },
    { label: 'User Journey', icon: Users, action: (v) => insertMermaidTemplate(v, MERMAID_TEMPLATES.journey) },
    { label: 'Architecture', icon: Network, action: (v) => insertMermaidTemplate(v, MERMAID_TEMPLATES.architecture) },
    { label: 'Quadrant Chart', icon: Layers, action: (v) => insertMermaidTemplate(v, MERMAID_TEMPLATES.quadrant) },
  ]
}

const STANDALONE_ITEMS: FormatItem[] = [
  { label: 'Copy', icon: Copy, action: copySelection },
  { label: 'Paste', icon: ClipboardPaste, action: pasteAtCursor },
  { label: 'Insert Link', icon: Link, shortcut: '⌘K', action: insertLink },
]

export default function EditorContextMenu({ editorView }: EditorContextMenuProps) {
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const handleContextMenu = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement
    if (!target.closest('.cm-editor')) return
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY })
    setExpanded(null)
  }, [])

  const handleClose = useCallback(() => {
    setMenu(null)
    setExpanded(null)
  }, [])

  useEffect(() => {
    document.addEventListener('contextmenu', handleContextMenu)
    document.addEventListener('click', handleClose)
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu)
      document.removeEventListener('click', handleClose)
    }
  }, [handleContextMenu, handleClose])

  if (!menu || !editorView) return null

  const runAndClose = (action: (v: EditorView) => void) => {
    action(editorView)
    setMenu(null)
  }

  const renderSection = (section: ExpandableSection) => {
    const isExpanded = expanded === section.id
    const SectionIcon = section.icon
    return (
      <div key={section.id} className="editor-ctx-section">
        <button
          type="button"
          className="editor-ctx-section-header"
          onClick={() => setExpanded(isExpanded ? null : section.id)}
        >
          <SectionIcon size={14} strokeWidth={1.6} />
          <span>{section.label}</span>
          <ChevronRight size={12} strokeWidth={1.6} className={`editor-ctx-chevron ${isExpanded ? 'expanded' : ''}`} />
        </button>
        {isExpanded && (
          <div className="editor-ctx-section-items">
            {section.items.map((item, i) => {
              const Icon = item.icon
              return (
                <button
                  key={i}
                  type="button"
                  className="editor-ctx-item editor-ctx-subitem"
                  onClick={() => runAndClose(item.action)}
                >
                  <Icon size={14} strokeWidth={1.6} />
                  <span>{item.label}</span>
                  {item.shortcut && <span className="editor-ctx-shortcut">{item.shortcut}</span>}
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className="editor-ctx-menu"
      style={{ left: menu.x, top: menu.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {[FORMAT_SECTION, PARAGRAPH_SECTION, INSERT_SECTION, DIAGRAMS_SECTION].map(renderSection)}
      <div className="editor-ctx-separator" />
      {STANDALONE_ITEMS.map((item, i) => {
        const Icon = item.icon
        return (
          <button
            key={i}
            type="button"
            className="editor-ctx-item"
            onClick={() => runAndClose(item.action)}
          >
            <Icon size={14} strokeWidth={1.6} />
            <span>{item.label}</span>
            {item.shortcut && <span className="editor-ctx-shortcut">{item.shortcut}</span>}
          </button>
        )
      })}
    </div>
  )
}
