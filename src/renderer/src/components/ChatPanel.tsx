import { useEffect, useRef, useState } from 'react'
import type { ChatMessage, McpStatus } from '@shared/types'
import type { AppActions } from '../App'
import { api, errMsg, uid } from '../lib/util'
import Preview from './Preview'
import AIErrorNotice from './AIErrorNotice'
import { toast } from 'sonner'
import { Copy, Eraser, ExternalLink, FilePlus, KeyRound, Loader2, Plug, Send, Square } from 'lucide-react'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'

interface Props {
  current: string | null
  names: Map<string, string>
  actions: AppActions
}

const SUGGESTIONS = [
  'What are the exact entry conditions of my model?',
  'Build me a pre-trade checklist from my rules',
  'What gaps or contradictions do you see in my model?',
  'Summarize my risk management'
]

export default function ChatPanel({ current, names, actions }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reqId = useRef<string | null>(null)
  const partial = useRef('')
  const bottom = useRef<HTMLDivElement>(null)
  // null = aún no se sabe. Sin IA configurada, las preguntas se mandan a Claude Desktop (MCP).
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [mcp, setMcp] = useState<McpStatus | null>(null)

  useEffect(() => {
    const refresh = () => {
      api.ai.configured().then(setConfigured)
      api.mcp.status().then(setMcp)
    }
    refresh()
    // Se vuelve a comprobar al volver a la ventana (p. ej. tras cambiar Settings o conectar Claude).
    window.addEventListener('focus', refresh)
    const t = setInterval(refresh, 5000)
    return () => {
      window.removeEventListener('focus', refresh)
      clearInterval(t)
    }
  }, [])

  const askInClaude = async (question: string) => {
    if (!mcp?.desktopConnected) {
      actions.openSettings()
      toast('Connect Claude Desktop first (Use with Claude), then restart Claude.')
      return
    }
    const prompt = question.trim() ? `Using my Trading Brain vault, ${question.trim()}` : ''
    if (prompt) await navigator.clipboard.writeText(prompt)
    const opened = await api.mcp.openClaude()
    if (!opened) toast.error('Could not open Claude Desktop.')
    else if (prompt) toast.success('Question copied — paste it in Claude with ⌘V.')
    setInput('')
  }

  useEffect(
    () =>
      api.ai.onDelta((id, d) => {
        if (id !== reqId.current) return
        partial.current += d
        setStreaming(partial.current)
      }),
    []
  )

  // Con llaves: scrollIntoView() devuelve una Promise en Chromium reciente y React la tomaría por la función de limpieza.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [messages, streaming])

  const send = async (text = input) => {
    if (!text.trim() || reqId.current) return
    if (configured === false) return askInClaude(text)
    const next: ChatMessage[] = [...messages, { role: 'user', content: text.trim() }]
    setMessages(next)
    setInput('')
    setError(null)
    setStreaming('')
    partial.current = ''
    const id = uid()
    reqId.current = id
    try {
      const answer = await api.ai.chat(id, next, current)
      setMessages([...next, { role: 'assistant', content: answer }])
    } catch (e) {
      setError(errMsg(e))
      // Si se canceló, conservamos lo recibido hasta ese momento.
      if (partial.current)
        setMessages([...next, { role: 'assistant', content: partial.current + '\n\n_(interrupted)_' }])
    } finally {
      reqId.current = null
      setStreaming(null)
    }
  }

  const saveAsNote = async (content: string) => {
    const title = await actions.ask('Save answer as note', `Chat ${new Date().toISOString().slice(0, 10)}`)
    if (!title) return
    try {
      const res = await api.notes.create('Inbox', title)
      actions.setVault(await api.notes.write(res.path, `# ${title}\n\n${content}\n`))
      actions.openNote(res.path)
    } catch (e) {
      actions.notify(errMsg(e))
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {messages.length === 0 && streaming == null && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">Ask your trading brain. Answers are based on your notes.</p>
            {configured === false && (
              <div className="grid gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-[13px]">
                <p>
                  The chat inside Trading Brain needs an API key. With your Claude subscription, ask in{' '}
                  <strong>Claude Desktop</strong> instead — it reads this vault through “Use with Claude”.
                </p>
                <div className="flex flex-wrap gap-2">
                  {mcp?.desktopConnected ? (
                    <Button size="sm" onClick={() => askInClaude(input)}>
                      <ExternalLink /> Open Claude Desktop
                    </Button>
                  ) : (
                    <Button size="sm" onClick={actions.openSettings}>
                      <Plug /> Connect Claude Desktop
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={actions.openSettings}>
                    <KeyRound /> Add API key
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Questions you send here will be copied and opened in Claude Desktop.
                </p>
              </div>
            )}
            {SUGGESTIONS.map((s) => (
              <Button
                key={s}
                variant="outline"
                className="h-auto justify-start py-2 text-left text-[13px] font-normal whitespace-normal"
                onClick={() => send(s)}
              >
                {s}
              </Button>
            ))}
          </div>
        )}
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="mb-3 ml-8 rounded-lg bg-primary/10 px-3 py-2 text-[13.5px] whitespace-pre-wrap">
              {m.content}
            </div>
          ) : (
            <div key={i} className="group mb-3 rounded-lg border bg-background px-3 py-2 text-[13.5px]">
              <Preview content={m.content} names={names} onLink={actions.openLink} showProperties={false} />
              <div className="mt-1.5 flex gap-1 opacity-60 group-hover:opacity-100">
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => navigator.clipboard.writeText(m.content)}>
                  <Copy className="size-3" /> Copy
                </Button>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => saveAsNote(m.content)}>
                  <FilePlus className="size-3" /> Save as note
                </Button>
              </div>
            </div>
          )
        )}
        {streaming != null && (
          <div className="mb-3 rounded-lg border bg-background px-3 py-2 text-[13.5px]">
            {streaming ? (
              <Preview content={streaming} names={names} onLink={actions.openLink} showProperties={false} />
            ) : (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            )}
          </div>
        )}
        {error && <AIErrorNotice msg={error} onOpenSettings={actions.openSettings} />}
        <div ref={bottom} />
      </div>
      <div className="flex flex-col gap-2 border-t p-2">
        <Textarea
          className="h-18 min-h-0 resize-none text-[13px]"
          value={input}
          placeholder={current ? 'Ask (the open note is included as context)…' : 'Ask your brain…'}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
        />
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => setMessages([])} disabled={streaming != null}>
            <Eraser /> Clear
          </Button>
          {streaming != null ? (
            <Button variant="outline" size="sm" onClick={() => reqId.current && api.ai.cancel(reqId.current)}>
              <Square /> Stop
            </Button>
          ) : (
            <Button size="sm" onClick={() => send()} disabled={!input.trim()}>
              {configured === false ? (
                <>
                  <ExternalLink /> Ask in Claude
                </>
              ) : (
                <>
                  <Send /> Send
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
