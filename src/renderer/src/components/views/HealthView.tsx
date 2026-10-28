import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Check, Circle, ExternalLink, HeartPulse, Loader2, Minus, Sparkles } from 'lucide-react'
import type { McpStatus, VaultState } from '@shared/types'
import { AUDIT_CRITERIA, MCP_HEALTH_PROMPT, type HealthAudit } from '@shared/health'
import type { AppActions } from '../../App'
import { api, errMsg, uid } from '../../lib/util'
import { cn } from '@/lib/utils'
import { Button } from '../ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import AIErrorNotice from '../AIErrorNotice'

// ---------- Vista: auditoría del modelo hecha por IA ----------

const STATUS = {
  defined: { cls: 'bg-success/20 text-success', icon: Check, label: 'Defined' },
  partial: { cls: 'bg-warning/20 text-warning', icon: Circle, label: 'Partial' },
  missing: { cls: 'bg-destructive/15 text-destructive', icon: Minus, label: 'Missing' }
} as const

export default function HealthView({ vault, actions }: { vault: VaultState; actions: AppActions }) {
  return (
    <div className="h-full overflow-y-auto px-10 pt-12 pb-16">
      <div className="mb-6">
        <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <HeartPulse className="size-6 text-primary" /> Model health
        </h2>
        <p className="mt-1 max-w-xl text-muted-foreground">
          How complete and consistent your trading model is, setup by setup — and what to fix first.
        </p>
      </div>
      <AiAudit vault={vault} actions={actions} />
    </div>
  )
}

function AiAudit({ vault, actions }: { vault: VaultState; actions: AppActions }) {
  const [audit, setAudit] = useState<HealthAudit | null | undefined>(undefined)
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [mcp, setMcp] = useState<McpStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reqId = useRef<string | null>(null)

  useEffect(() => {
    // Se relee periódicamente: Claude/ChatGPT pueden guardar la auditoría por MCP en cualquier momento.
    const load = () => api.views.healthAudit().then(setAudit)
    load()
    api.ai.configured().then(setConfigured)
    api.mcp.status().then(setMcp)
    const t = setInterval(load, 4000)
    window.addEventListener('focus', load)
    return () => {
      clearInterval(t)
      window.removeEventListener('focus', load)
    }
  }, [vault.path])

  const generate = async () => {
    setBusy(true)
    setError(null)
    const id = uid()
    reqId.current = id
    try {
      setAudit(await api.ai.healthAudit(id))
      toast.success('Audit updated')
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
    await navigator.clipboard.writeText(MCP_HEALTH_PROMPT)
    if (mcp.desktopConnected) await api.mcp.openClaude()
    toast.success('Prompt copied — paste it in Claude or ChatGPT. The audit will appear here when it is saved.')
  }

  const actionsBar = (
    <div className="flex flex-wrap items-center gap-2">
      {configured !== false && (
        <Button onClick={generate} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Sparkles />} {busy ? 'Auditing…' : audit ? 'Update with AI' : 'Run AI audit'}
        </Button>
      )}
      <Button variant={configured === false ? 'default' : 'outline'} onClick={askAssistant}>
        <ExternalLink /> Ask Claude / ChatGPT
      </Button>
      {busy && (
        <Button variant="ghost" onClick={() => reqId.current && api.ai.cancel(reqId.current)}>
          Cancel
        </Button>
      )}
    </div>
  )

  if (audit === undefined) return <div className="text-muted-foreground">Loading…</div>

  if (!audit)
    return (
      <div className="grid max-w-2xl gap-4 rounded-xl border p-6">
        <div className="grid gap-1">
          <span className="font-medium">No audit yet</span>
          <span className="text-sm text-muted-foreground">
            The AI reads your notes, finds your setups and rates each one: context, entry, stop, target, invalidation,
            risk and examples — plus the fixes that matter most and any contradictions between notes.
            {configured === false && ' Without an API key, ask Claude or ChatGPT to do it through “Use with Claude & ChatGPT”.'}
          </span>
        </div>
        {actionsBar}
        {error && <AIErrorNotice msg={error} onOpenSettings={actions.openSettings} />}
      </div>
    )

  const link = (title: string) => (
    <button key={title} className="text-link hover:underline" onClick={() => actions.openLink(title)}>
      [[{title}]]
    </button>
  )

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 rounded-xl border p-4 sm:grid-cols-[auto_1fr]">
        <div className="flex size-24 flex-col items-center justify-center rounded-full border-4" style={{ borderColor: audit.score >= 75 ? 'var(--success)' : audit.score >= 45 ? 'var(--warning)' : 'var(--destructive)' }}>
          <span className="text-2xl font-semibold tabular-nums">{audit.score}</span>
          <span className="text-[10px] text-muted-foreground uppercase">score</span>
        </div>
        <div className="grid content-start gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-lg font-semibold">{audit.model}</span>
            <span className="text-xs text-muted-foreground">
              {audit.generatedBy} · {audit.generatedAt ? new Date(audit.generatedAt).toLocaleString() : ''}
            </span>
          </div>
          <p className="text-sm">{audit.summary}</p>
          {actionsBar}
          {error && <AIErrorNotice msg={error} onOpenSettings={actions.openSettings} />}
        </div>
      </div>

      {audit.setups.length > 0 && (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Setup</th>
                {AUDIT_CRITERIA.map((c) => (
                  <th key={c.id} className="px-2 py-2 text-center font-medium" title={c.hint}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {audit.setups.map((s) => (
                <tr key={s.name} className="border-t align-top">
                  <td className="px-3 py-2 font-medium">
                    {s.note ? (
                      <button className="text-left text-link hover:underline" onClick={() => actions.openLink(s.note!)}>
                        {s.name}
                      </button>
                    ) : (
                      s.name
                    )}
                  </td>
                  {AUDIT_CRITERIA.map((c) => {
                    const v = s.criteria[c.id]
                    const st = STATUS[v?.status ?? 'missing']
                    return (
                      <td key={c.id} className="px-1 py-1.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className={cn('mx-auto flex h-7 w-full max-w-20 cursor-help items-center justify-center rounded-md', st.cls)}>
                              <st.icon className="size-3.5" />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-72">
                            <b>{c.label}: {st.label}.</b> {v?.comment}
                          </TooltipContent>
                        </Tooltip>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="grid content-start gap-2">
          <h3 className="font-semibold">What to fix first</h3>
          {audit.fixes.length ? (
            <ol className="grid gap-2">
              {audit.fixes.map((f, i) => (
                <li key={i} className="rounded-lg border p-3 text-sm">
                  <div className="font-medium">
                    {i + 1}. {f.title}
                  </div>
                  <div className="mt-1 text-muted-foreground">{f.detail}</div>
                  {f.notes.length > 0 && <div className="mt-1.5 flex flex-wrap gap-x-2 text-xs">{f.notes.map(link)}</div>}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing urgent.</p>
          )}
        </section>
        <section className="grid content-start gap-2">
          <h3 className="font-semibold">Contradictions</h3>
          {audit.contradictions.length ? (
            audit.contradictions.map((c, i) => (
              <div key={i} className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
                {c.description}
                {c.notes.length > 0 && <div className="mt-1.5 flex flex-wrap gap-x-2 text-xs">{c.notes.map(link)}</div>}
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No contradictions found.</p>
          )}
        </section>
      </div>
    </div>
  )
}
