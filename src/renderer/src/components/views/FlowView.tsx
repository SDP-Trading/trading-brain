import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ExternalLink, GitFork, Layers, Loader2, Sparkles } from 'lucide-react'
import type { McpStatus, VaultState } from '@shared/types'
import type { AppActions } from '../../App'
import { api, errMsg, uid } from '../../lib/util'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import AIErrorNotice from '../AIErrorNotice'

const MCP_PROMPT =
  'Using my Trading Brain vault, read my trading model and create a decision flow canvas of how I execute it (use get_model_overview, read the key notes, then create_flow_canvas).'

/** Genera el diagrama de decisión del modelo como un .canvas y lo abre en el editor de Canvas. */
export default function FlowView({ vault, actions, openCanvas }: { vault: VaultState; actions: AppActions; openCanvas(path: string): void }) {
  const [focus, setFocus] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [mcp, setMcp] = useState<McpStatus | null>(null)
  const reqId = useRef<string | null>(null)

  useEffect(() => {
    api.ai.configured().then(setConfigured)
    api.mcp.status().then(setMcp)
  }, [])

  const flows: { path: string; name: string }[] = []
  const walk = (nodes: VaultState['tree']) => {
    for (const n of nodes) {
      if (n.type === 'dir') walk(n.children ?? [])
      else if (n.kind === 'canvas' && n.path.startsWith('Flows/')) flows.push({ path: n.path, name: n.name })
    }
  }
  walk(vault.tree)

  const generate = async () => {
    setBusy(true)
    setError(null)
    const id = uid()
    reqId.current = id
    try {
      const res = await api.ai.flow(id, focus.trim() || undefined)
      actions.setVault(res.state)
      toast.success('Flow created')
      openCanvas(res.path)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
      reqId.current = null
    }
  }

  const askAssistant = async () => {
    if (!mcp?.desktopConnected && !mcp?.chatgptConnected) {
      actions.openSettings()
      return toast('Connect Claude Desktop or ChatGPT first (Use with Claude & ChatGPT).')
    }
    await navigator.clipboard.writeText(focus.trim() ? `${MCP_PROMPT} Focus on: ${focus.trim()}.` : MCP_PROMPT)
    if (mcp.desktopConnected) await api.mcp.openClaude()
    toast.success('Prompt copied — paste it in Claude or ChatGPT. The canvas will appear in Flows/.')
  }

  return (
    <div className="mx-auto h-full max-w-3xl overflow-y-auto px-12 pt-12 pb-20">
      <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
        <GitFork className="size-6 text-primary" /> Decision flow
      </h2>
      <p className="mt-2 mb-6 text-muted-foreground">
        Turn your model into the flowchart you follow when trading: context → bias → setup → entry → stop → management,
        including the no-trade exits. Each box links to the note that explains it, and you can edit it afterwards like
        any canvas.
      </p>

      <div className="grid gap-3 rounded-xl border p-4">
        <label className="grid gap-2 text-sm font-medium">
          Focus (optional)
          <Input
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            placeholder="e.g. the Unicorn entry, only the London session, risk management…"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {configured !== false && (
            <Button onClick={generate} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Sparkles />} {busy ? 'Building flow…' : 'Generate with AI'}
            </Button>
          )}
          <Button variant={configured === false ? 'default' : 'outline'} onClick={askAssistant}>
            <ExternalLink /> Ask Claude / ChatGPT to build it
          </Button>
          {busy && (
            <Button variant="ghost" onClick={() => reqId.current && api.ai.cancel(reqId.current)}>
              Cancel
            </Button>
          )}
        </div>
        {configured === false && (
          <p className="text-xs text-muted-foreground">
            No in-app AI is set up, so the flow is built by Claude or ChatGPT through “Use with Claude & ChatGPT”.
          </p>
        )}
        {error && <AIErrorNotice msg={error} onOpenSettings={actions.openSettings} />}
      </div>

      {flows.length > 0 && (
        <div className="mt-8">
          <div className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Your flows</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {flows.map((f) => (
              <button
                key={f.path}
                onClick={() => openCanvas(f.path)}
                className="flex items-center gap-3 rounded-lg border p-3 text-left hover:border-primary hover:bg-primary/5"
              >
                <Layers className="size-5 shrink-0 text-primary" />
                <span className="truncate text-sm font-medium">{f.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
