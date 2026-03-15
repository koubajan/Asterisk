import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'

export type AIProvider = 'openai' | 'anthropic' | 'gemini'

export interface AIMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface AIChatRequest {
  provider: AIProvider
  apiKey: string
  model?: string
  messages: AIMessage[]
  fileContext?: string
}

export async function sendAIChat(req: AIChatRequest): Promise<string> {
  const systemContent = req.fileContext
    ? `You are a helpful assistant. The user is working in a code/note editor. Below is the content of the file they have open (for context only).\n\n--- File content ---\n${req.fileContext}\n--- End file ---\n\nRespond according to the user's request. You may suggest edits, refactors, or answer questions. When suggesting code or text changes, output the complete replacement when asked.`
    : 'You are a helpful assistant.'

  if (req.provider === 'openai') {
    const openai = new OpenAI({ apiKey: req.apiKey })
    const model = req.model?.trim() || 'gpt-5-mini'
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemContent },
      ...req.messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
    ]
    const completion = await openai.chat.completions.create({
      model,
      messages,
      max_tokens: 4096
    })
    const choice = completion.choices[0]
    return (choice?.message?.content ?? '').trim()
  }

  if (req.provider === 'anthropic') {
    const anthropic = new Anthropic({ apiKey: req.apiKey })
    const model = req.model?.trim() || 'claude-3-5-haiku-20241022'
    const formatted = req.messages.map((m) => ({
      role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: m.content
    }))
    const response = await anthropic.messages.create({
      model,
      max_tokens: 4096,
      system: systemContent,
      messages: formatted
    })
    const block = response.content.find((b) => b.type === 'text')
    return block && block.type === 'text' ? block.text.trim() : ''
  }

  if (req.provider === 'gemini') {
    const genAI = new GoogleGenerativeAI(req.apiKey)
    const modelId = req.model?.trim() || 'gemini-2.5-flash'
    const model = genAI.getGenerativeModel({ model: modelId })
    const history = req.messages.slice(0, -1).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }))
    const last = req.messages[req.messages.length - 1]
    const lastContent = last?.content ?? ''
    let result
    if (history.length === 0) {
      result = await model.generateContent([systemContent, lastContent].join('\n\n'))
    } else {
      const chat = model.startChat({
        history: [
          { role: 'user', parts: [{ text: systemContent }] },
          ...history
        ]
      })
      result = await chat.sendMessage(lastContent)
    }
    const response = result.response
    const text = response.text()
    return text?.trim() ?? ''
  }

  throw new Error(`Unknown provider: ${req.provider}`)
}
