import { create } from 'zustand'
import type { AIMessage } from '../types'
import { useSettings } from './useSettings'

export type AIProvider = 'openai' | 'anthropic' | 'gemini'

export const AI_MODELS: Record<AIProvider, { id: string; label: string }[]> = {
  openai: [
    { id: 'gpt-5.4', label: 'GPT-5.4' },
    { id: 'gpt-5-mini', label: 'GPT-5 Mini' },
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'o1', label: 'o1 (reasoning)' }
  ],
  anthropic: [
    { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' }
  ],
  gemini: [
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite' },
    { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro' }
  ]
}

interface AIChatState {
  messages: AIMessage[]
  loading: boolean
  error: string | null
  provider: AIProvider
  model: string
  pendingPrompt: string | null
  setProvider: (p: AIProvider) => void
  setModel: (m: string) => void
  sendMessage: (content: string, fileContext?: string) => Promise<void>
  clearMessages: () => void
  setError: (err: string | null) => void
  setPendingPrompt: (p: string | null) => void
}

export const useAIChat = create<AIChatState>((set, get) => ({
  messages: [],
  loading: false,
  error: null,
  provider: 'openai',
  model: 'gpt-5-mini',
  pendingPrompt: null,

  setProvider: (provider) => {
    const models = AI_MODELS[provider] ?? []
    const defaultId = models[0]?.id ?? ''
    set({ provider, model: defaultId, error: null })
  },

  setModel: (model) => set({ model }),

  sendMessage: async (content, fileContext) => {
    let { provider, model, messages } = get()
    const models = AI_MODELS[provider] ?? []
    const validModel = models.some((m) => m.id === model) ? model : models[0]?.id ?? model
    if (validModel !== model) set({ model: validModel })
    model = validModel
    set({ loading: true, error: null })
    const { openaiApiKey, anthropicApiKey, geminiApiKey } = useSettings.getState()
    const apiKey =
      provider === 'openai' ? openaiApiKey : provider === 'anthropic' ? anthropicApiKey : geminiApiKey
    if (!apiKey?.trim()) {
      set({ loading: false, error: `Set your ${provider} API key in Settings → AI` })
      return
    }
    const nextMessages: AIMessage[] = [...messages, { role: 'user', content }]
    set({ messages: nextMessages })

    const result = await window.asterisk.aiChat({
      provider,
      apiKey: apiKey.trim(),
      model,
      messages: nextMessages,
      fileContext
    })

    if (!result.ok) {
      set({ loading: false, error: result.error ?? 'Request failed' })
      return
    }

    const assistantContent = result.data?.content ?? ''
    set((s) => ({
      messages: [...s.messages, { role: 'assistant', content: assistantContent }],
      loading: false,
      error: null
    }))
  },

  clearMessages: () => set({ messages: [], error: null }),
  setError: (error) => set({ error }),
  setPendingPrompt: (pendingPrompt) => set({ pendingPrompt })
}))
