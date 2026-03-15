import { useState, useRef, useEffect } from 'react'
import { X, Send, Sparkles } from 'lucide-react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { useAIChat, type AIProvider, AI_MODELS } from '../../store/useAIChat'
import { useWorkspace } from '../../store/useWorkspace'
import DiffPreview from './DiffPreview'
import './AIChat.css'

const REVEAL_WORD_MS = 36
const WORD_REGEX = /\s+|\S+/g
function wordCount(str: string): string[] {
  return str.match(WORD_REGEX) ?? []
}

interface AIChatProps {
  onClose: () => void
}

function extractCodeBlock(text: string): string | null {
  const m = text.match(/```(?:[\w]*)\n?([\s\S]*?)```/)
  return m ? m[1].trim() : null
}

export default function AIChat({ onClose }: AIChatProps) {
  const [input, setInput] = useState('')
  const [includeFile, setIncludeFile] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [diffState, setDiffState] = useState<{ oldContent: string; newContent: string } | null>(null)
  const [revealedWords, setRevealedWords] = useState(0)
  const lastAssistantContentRef = useRef<string | null>(null)
  const wasLoadingRef = useRef(false)

  const openFile = useWorkspace((s) => s.openFiles[s.activeFileIndex] ?? null)
  const updateContent = useWorkspace((s) => s.updateContent)

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

  // When opened via /ask command, send the pending prompt
  useEffect(() => {
    if (!pendingPrompt) return
    const fileContext = includeFile && openFile?.path.endsWith('.md') ? openFile.content : undefined
    setPendingPrompt(null)
    sendMessage(pendingPrompt, fileContext)
  }, [pendingPrompt])

  const fileContext = includeFile && openFile?.path.endsWith('.md') ? openFile.content : undefined

  async function handleSend() {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    await sendMessage(text, fileContext)
  }

  function handleApplyFromLast() {
    const last = messages.filter((m) => m.role === 'assistant').pop()
    if (!last || !openFile) return
    const code = extractCodeBlock(last.content)
    const newContent = code ?? last.content
    setDiffState({ oldContent: openFile.content, newContent })
  }

  const canApply = openFile && lastAssistant && (extractCodeBlock(lastAssistant.content) != null || lastAssistant.content.trim().length > 0)

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
            Ask for refactors, fixes, or explanations. Include your current file for better answers.
          </div>
        )}
        {messages.map((msg, i) => {
          const isLastAssistant = msg.role === 'assistant' && i === messages.length - 1
          const displayContent = isLastAssistant && revealedWords < totalWords
            ? words.slice(0, revealedWords).join('')
            : msg.content
          const html =
            !displayContent
              ? ''
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
      <div className="ai-panel-input-wrap">
        {openFile && openFile.path.endsWith('.md') && (
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
    </div>
  )
}
