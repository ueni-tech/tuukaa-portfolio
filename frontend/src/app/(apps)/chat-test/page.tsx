'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Card } from '@/components/ui/card'
import { Send, Bot, User } from 'lucide-react'
import { toast } from 'sonner'
import { config } from '@/lib/config'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { useSettingsStore } from '@/lib/settings-store'
import { Input } from '@/components/ui/input'
import dynamic from 'next/dynamic'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { useSession } from 'next-auth/react'
const ReactMarkdown = dynamic(() => import('react-markdown'), { ssr: false })

const unwrapMarkdownFence = (s: string) => {
  if (!s) return s
  const text = s.replace(/\r\n?/g, '\n').trim()
  if (!text.startsWith('```')) return text
  const open = text.match(/^```(?:markdown|md|mdx)?[^\n]*\n?/)
  if (!open) return text
  const body = text.slice(open[0].length)
  return body.replace(/\n?```[\s]*$/, '')
}

const normalizeMarkdown = (s: string) => {
  if (!s) return s
  const parts = s.split(/(```[\s\S]*?```)/g)
  return parts
    .map((p, i) => {
      if (i % 2) return p
      return p
        .replace(/\r\n?/g, '\n')
        .replace(/[\u00A0\u200B\uFEFF]/g, ' ')
        .replace(/(^|\n)(\d+\.)([^\s])/g, '$1$2 $3')
        .replace(/(^|\n)([-*+])([^\s])/g, '$1$2 $3')
        .replace(/([^\n])\n(?=(?:\s*(?:[-*+]\s|\d+\.\s)))/g, '$1\n\n')
    })
    .join('')
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  documents?: Array<{
    content: string
    metadata?: any
  }>
  content_used?: string
  llm_model?: string
}

type TenantInfo = { name: string; key: string }

export default function ChatPage() {
  const { data: session } = useSession()
  const isPortfolioAccount = session?.user?.role === 'portfolio'
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isBot] = useState(true)
  const topK = useSettingsStore(s => s.topK)
  // 各メッセージ要素への参照を保持
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [scrollToId, setScrollToId] = useState<string | null>(null)
  const [tenants, setTenants] = useState<TenantInfo[]>([])
  const [selectedTenant, setSelectedTenant] = useState('')
  const [selectedKey, setSelectedKey] = useState('')
  const [isInitialized, setIsInitialized] = useState(false)
  const setTopK = useSettingsStore(s => s.setTopK)
  const DEFAULT_MAX_TOKENS = 768
  const [maxTokens, setMaxTokens] = useState<number>(DEFAULT_MAX_TOKENS)
  const [maxTokensInput, setMaxTokensInput] = useState<string>(
    String(DEFAULT_MAX_TOKENS)
  )

  // テナントの初期ロード
  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/embed-admin/tenants', {
          cache: 'no-store',
        })
        const data = await res.json()
        const list = (data?.tenants || []) as TenantInfo[]
        setTenants(list)
      } catch {
        console.error('Failed to load tenants')
      }
    })()
  }, [])

  // tenantsが読み込まれた時のテナントとキーの選択
  useEffect(() => {
    if (tenants.length === 0) return

    const saveKey =
      typeof window !== 'undefined' ? localStorage.getItem('embed:key') : ''
    const initial = tenants.find(t => t.key === saveKey) || tenants[0]

    if (initial) {
      setSelectedTenant(initial.name)
      setSelectedKey(initial.key)
      try {
        localStorage.setItem('embed:key', initial.key)
      } catch {}
    }
    setIsInitialized(true)
  }, [tenants])

  // 選択されたキーを常に localStorage と同期
  useEffect(() => {
    if (!selectedKey) return
    try {
      localStorage.setItem('embed:key', selectedKey)
    } catch {}
  }, [selectedKey])

  // LLMのセットアップ
  const MODELS = [
    'gpt-5',
    'gpt-5-mini',
    'gpt-4.1',
    'gpt-4o',
    'gpt-4o-mini',
  ] as const
  type Model = (typeof MODELS)[number]
  const DEFAULT_MODEL: Model = 'gpt-4o-mini'
  const mounted = useRef(false)
  const [model, setModel] = useState<Model>(() => {
    // 初期化時にlocalStorageから読み込む
    try {
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('llm:model')
        if (saved) {
          return saved as Model
        }
      }
    } catch {}
    return DEFAULT_MODEL
  })
  const isModel = (v: string): v is Model =>
    (MODELS as readonly string[]).includes(v)

  useEffect(() => {
    mounted.current = true
  }, [])

  useEffect(() => {
    if (!mounted.current) return
    try {
      localStorage.setItem('llm:model', model)
    } catch {}
  }, [model])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
    }

    setMessages(prev => [...prev, userMessage])
    // 直後にそのメッセージへスクロールするためIDを記録
    setScrollToId(userMessage.id)
    setInput('')
    setIsLoading(true)

    try {
      const model =
        typeof window !== 'undefined' ? localStorage.getItem('llm:model') : null

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (selectedKey) headers['x-embed-key'] = selectedKey
      // 管理画面なので常にadmin権限を付与
      headers['x-admin-api-secret'] = 'admin'

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          question: userMessage.content,
          top_k: topK,
          model: model || undefined,
          max_output_tokens: maxTokens,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Network response was not ok')
      }

      const data = await response.json()

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.content,
        documents: data.documents,
        content_used: data.context_used,
        llm_model: data.llm_model,
      }

      setMessages(prev => [...prev, assistantMessage])
    } catch (error) {
      console.error('Chat error:', error)
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `申し訳ありません。エラーが発生しました: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }
      setMessages(prev => [...prev, errorMessage])
      toast.error('エラーが発生しました。もう一度お試しください。')
    } finally {
      setIsLoading(false)
    }
  }

  // メッセージが更新されたら指定IDの要素へスクロール
  useEffect(() => {
    if (!scrollToId) return
    const el = messageRefs.current[scrollToId]
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    setScrollToId(null)
  }, [messages, scrollToId])

  const onChangeTenant = (name: string) => {
    setSelectedTenant(name)
    const t = tenants.find(x => x.name === name)
    setSelectedKey(t?.key || '')
    setMessages([])
    try {
      localStorage.setItem('embed:key', t?.key || '')
    } catch {}
  }

  return (
    <div className="flex flex-col flex-1 h-[calc(100vh-57px)]">
      {/* Chat Message */}
      <ScrollArea className="flex-1 min-h-0 p-4">
        <div className="space-y-4 max-w-5xl mx-auto">
          {/* ポートフォリオアカウント用の注意表示 */}
          {isPortfolioAccount && (
            <Card className="p-6 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 border-blue-200 dark:border-blue-800">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="text-2xl">💬</div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                      チャットテストページ - ポートフォリオアカウント
                    </h3>
                    <p className="text-sm text-blue-800 dark:text-blue-200 mb-3">
                      このページでは、実際のAIチャットボット機能をお試しいただけます。
                      デモデータに対して自由に質問してみてください。
                    </p>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-900 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                  <h4 className="font-semibold text-sm text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
                    <span>🍎</span>
                    デモデータ: Apple Intelligence公式ドキュメント
                  </h4>
                  <p className="text-xs text-muted-foreground mb-3">
                    以下のような質問を試してみてください：
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                    <div className="space-y-1">
                      <p className="text-blue-700 dark:text-blue-300">
                        • 「Apple Intelligenceとは何ですか？」
                      </p>
                      <p className="text-blue-700 dark:text-blue-300">
                        • 「Writing Toolsの機能を教えて」
                      </p>
                      <p className="text-blue-700 dark:text-blue-300">
                        • 「どのデバイス・OSで使えますか？」
                      </p>
                      <p className="text-blue-700 dark:text-blue-300">
                        • 「対応言語は何ですか？」
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-blue-700 dark:text-blue-300">
                        • 「Siriの新機能は何ですか？」
                      </p>
                      <p className="text-blue-700 dark:text-blue-300">
                        • 「画像生成機能について説明して」
                      </p>
                      <p className="text-blue-700 dark:text-blue-300">
                        • 「プライバシーはどう保護されていますか？」
                      </p>
                      <p className="text-blue-700 dark:text-blue-300">
                        • 「有効にする方法は？」
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {messages.length === 0 && (
            <div className="text-center text-muted-foreground py-8">
              <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium mb-2">
                Welcome to Tuukaa the RAG Chatbot
              </p>
              <p>
                Upload a your documents and start asking questions about its
                content.
              </p>
              {config.isDebug && (
                <p className="text-xs mt-2 opacity-75">Debug Mode: ON</p>
              )}
            </div>
          )}

          {messages.map(message => (
            <div
              key={message.id}
              className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              ref={el => {
                messageRefs.current[message.id] = el
              }}
            >
              <div
                className={`flex gap-3 max-w-[80%] ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
              >
                <div
                  className={`flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full ${message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
                >
                  {message.role === 'user' ? (
                    <User className="h-4 w-4" />
                  ) : (
                    <Bot className="h-4 w-4" />
                  )}
                </div>
                <Card className="p-4">
                  {message.content ? (
                    <div className="prose prose-sm max-w-none dark:prose-invert chat-prose">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeHighlight]}
                      >
                        {normalizeMarkdown(
                          unwrapMarkdownFence(message.content)
                        )}
                      </ReactMarkdown>
                      {message.llm_model ? (
                        <div className="mt-1 text-xs text-muted-foreground">
                          Model: {message.llm_model}
                        </div>
                      ) : (
                        ''
                      )}
                    </div>
                  ) : (
                    ''
                  )}
                  {/* 参照された文書を表示 */}
                  {message.documents && message.documents.length > 0 && (
                    <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                      {message.content ? (
                        <p className="font-semibold">参照元:</p>
                      ) : (
                        <p className="font-semibold">検索結果:</p>
                      )}
                      {message.documents.map((doc, docIndex) => (
                        <div
                          key={docIndex}
                          className="p-2 bg-secondary rounded-md"
                        >
                          <p className="font-medium truncate">
                            {doc.metadata?.filename || `文書 ${docIndex + 1}`}
                          </p>
                          <p className="line-clamp-3">{doc.content}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-3 justify-start">
              <div className="flex gap-3 max-w-[80%]">
                <div className="flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full bg-muted">
                  <Bot className="h-4 w-4" />
                </div>
                <Card className="p-4">
                  <div className="flex items-center gap-2">
                    <div className="flex space-x-1">
                      <div className="h-2 w-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                      <div className="h-2 w-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                      <div className="h-2 w-2 bg-muted-foreground rounded-full animate-bounce"></div>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      AI thinking...
                    </span>
                  </div>
                </Card>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input Form */}
      <div className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <form
          className="flex flex-col gap-4 px-2 py-6 max-w-5xl mx-auto"
          onSubmit={handleSubmit}
        >
          <div className="flex w-full justify-between items-center gap-2">
            <Select
              value={isInitialized ? selectedTenant : ''}
              onValueChange={onChangeTenant}
              disabled={!isInitialized}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue
                  placeholder={isInitialized ? 'テナント' : '読み込み中...'}
                />
              </SelectTrigger>
              <SelectContent>
                {tenants.map(t => (
                  <SelectItem key={t.key} value={t.name}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2 w-[200px]">
              <Label className="whitespace-nowrap">top_k: {topK}</Label>
              <Slider
                min={1}
                max={20}
                step={1}
                value={[topK]}
                onValueChange={v => setTopK(v[0] ?? 3)}
              />
            </div>
            <div className="flex items-center gap-2 w-[360px]">
              <Label className="whitespace-nowrap">max_tokens</Label>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={4096}
                step={1}
                className="w-28"
                value={maxTokensInput}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  const raw = e.target.value
                  setMaxTokensInput(raw)
                  if (raw === '') return
                  const v = parseInt(raw, 10)
                  if (!Number.isNaN(v)) {
                    const clamped = Math.max(1, Math.min(4096, v))
                    setMaxTokens(clamped)
                  }
                }}
                onBlur={() => {
                  if (maxTokensInput.trim() === '') {
                    setMaxTokens(DEFAULT_MAX_TOKENS)
                    setMaxTokensInput(String(DEFAULT_MAX_TOKENS))
                  } else {
                    const v = parseInt(maxTokensInput, 10)
                    if (Number.isNaN(v)) {
                      setMaxTokens(DEFAULT_MAX_TOKENS)
                      setMaxTokensInput(String(DEFAULT_MAX_TOKENS))
                    } else {
                      const clamped = Math.max(1, Math.min(4096, v))
                      setMaxTokens(clamped)
                      setMaxTokensInput(String(clamped))
                    }
                  }
                }}
              />
              <Slider
                min={1}
                max={4096}
                step={64}
                value={[maxTokens]}
                onValueChange={v => {
                  const val = v[0] ?? DEFAULT_MAX_TOKENS
                  setMaxTokens(val)
                  setMaxTokensInput(String(val))
                }}
              />
            </div>
            {/* LLM */}
            <div>
              <Select
                value={model}
                onValueChange={v => {
                  if (v && isModel(v)) setModel(v)
                }}
              >
                <SelectTrigger
                  className={isBot ? '' : 'cursor-not-allowed'}
                  disabled={!isBot}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gpt-5">gpt-5</SelectItem>
                  <SelectItem value="gpt-5-mini">gpt-5-mini</SelectItem>
                  <SelectItem value="gpt-4.1">gpt-4.1</SelectItem>
                  <SelectItem value="gpt-4o">gpt-4o</SelectItem>
                  <SelectItem value="gpt-4o-mini">gpt-4o-mini</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex w-full justify-between items-end gap-2">
            <Textarea
              value={input}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setInput(e.target.value)
              }
              placeholder={`Ask a question about tenant\'s documents...\nShift+Enterで改行`}
              className="flex-1 resize-none"
              disabled={isLoading}
              onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSubmit(e as any)
                }
              }}
            />
            <Button type="submit" size="icon" disabled={isLoading}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
