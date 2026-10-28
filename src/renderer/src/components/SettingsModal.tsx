import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Check, Copy, Loader2, Monitor, Moon, Plug, Sun, Unplug } from 'lucide-react'
import type { Effort, McpStatus, ProviderId, PublicSettings, ThemeMode } from '@shared/types'
import { api, errMsg } from '../lib/util'
import { useTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { RadioGroup, RadioGroupItem } from './ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Separator } from './ui/separator'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'

const PROVIDERS: { id: ProviderId; label: string; hint: string }[] = [
  { id: 'anthropic', label: 'Claude (Anthropic)', hint: 'Recommended. 1M-token context: ideal for importing lots of material.' },
  { id: 'openai', label: 'OpenAI', hint: 'Requires an OpenAI API key.' },
  { id: 'ollama', label: 'Ollama (local)', hint: 'Free and your data stays local. Needs Ollama running and a model with good JSON support.' }
]

const EFFORTS: { id: Effort; label: string }[] = [
  { id: 'low', label: 'Low (fast and cheap)' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High (recommended for imports)' },
  { id: 'xhigh', label: 'Very high' },
  { id: 'max', label: 'Max' }
]

function Field({ label, hint, children }: { label: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

interface SettingsModalProps {
  open: boolean
  onOpenChange(o: boolean): void
  onRunSetup(): void
}

export default function SettingsModal({ open, onOpenChange, onRunSetup }: SettingsModalProps) {
  const [s, setS] = useState<PublicSettings | null>(null)
  const [keys, setKeys] = useState({ anthropic: '', openai: '' })
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const { theme, setTheme } = useTheme()

  useEffect(() => {
    if (open) api.settings.get().then(setS)
  }, [open])

  const update = async (patch: Partial<PublicSettings>) => setS(await api.settings.update(patch))

  const saveKey = async (p: 'anthropic' | 'openai') => {
    setS(await api.settings.setKey(p, keys[p]))
    setKeys((k) => ({ ...k, [p]: '' }))
    toast.success(keys[p] ? 'API key saved (encrypted in the system keychain)' : 'API key removed')
  }

  const test = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      setTestResult({ ok: true, msg: await api.ai.test() })
    } catch (e) {
      setTestResult({ ok: false, msg: errMsg(e).replace(/^\[config\] /, '') })
    } finally {
      setTesting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription className="flex items-center justify-between gap-2">
            Appearance and the AI used to organize your vault and answer questions.
            <Button variant="link" size="sm" className="h-auto p-0" onClick={onRunSetup}>
              Run setup again
            </Button>
          </DialogDescription>
        </DialogHeader>

        <Field label="Theme" hint="System follows your macOS appearance.">
          <ToggleGroup
            type="single"
            variant="outline"
            className="w-full"
            value={theme}
            onValueChange={(v) => v && setTheme(v as ThemeMode)}
          >
            <ToggleGroupItem value="light" className="flex-1">
              <Sun /> Light
            </ToggleGroupItem>
            <ToggleGroupItem value="dark" className="flex-1">
              <Moon /> Dark
            </ToggleGroupItem>
            <ToggleGroupItem value="system" className="flex-1">
              <Monitor /> System
            </ToggleGroupItem>
          </ToggleGroup>
        </Field>

        <Separator />

        <McpSection open={open} />

        <Separator />

        {s && (
          <div className="grid gap-5">
            <Field label="AI provider">
              <RadioGroup value={s.provider} onValueChange={(v) => update({ provider: v as ProviderId })} className="gap-2">
                {PROVIDERS.map((x) => (
                  <Label
                    key={x.id}
                    htmlFor={`p-${x.id}`}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal hover:bg-accent/50',
                      s.provider === x.id && 'border-primary bg-primary/5'
                    )}
                  >
                    <RadioGroupItem id={`p-${x.id}`} value={x.id} className="mt-0.5" />
                    <div className="grid gap-0.5">
                      <span className="font-medium">{x.label}</span>
                      <span className="text-xs text-muted-foreground">{x.hint}</span>
                    </div>
                  </Label>
                ))}
              </RadioGroup>
            </Field>

            <Field label="Model">
              <Input
                value={s.models[s.provider]}
                onChange={(e) => setS({ ...s, models: { ...s.models, [s.provider]: e.target.value } })}
                onBlur={(e) => update({ models: { ...s.models, [s.provider]: e.target.value.trim() } })}
              />
            </Field>

            {(s.provider === 'anthropic' || s.provider === 'openai') && (
              <Field
                label={
                  <span className="flex items-center gap-2">
                    API key
                    {s.hasKey[s.provider] ? (
                      <Badge variant="outline" className="border-success/50 text-success">saved</Badge>
                    ) : (
                      <Badge variant="outline" className="border-warning/50 text-warning">not set</Badge>
                    )}
                  </span>
                }
                hint={
                  s.provider === 'anthropic' && !s.hasKey.anthropic
                    ? 'Without a key, ANTHROPIC_API_KEY or your `ant auth login` profile is used if available.'
                    : undefined
                }
              >
                <div className="flex gap-2">
                  <Input
                    type="password"
                    placeholder={
                      s.hasKey[s.provider]
                        ? '•••••••• (type to replace; leave empty to remove)'
                        : s.provider === 'anthropic'
                          ? 'sk-ant-…'
                          : 'sk-…'
                    }
                    value={keys[s.provider]}
                    onChange={(e) => setKeys({ ...keys, [s.provider]: e.target.value })}
                  />
                  <Button variant="outline" onClick={() => saveKey(s.provider as 'anthropic' | 'openai')}>
                    {keys[s.provider] ? 'Save' : s.hasKey[s.provider] ? 'Remove' : 'Save'}
                  </Button>
                </div>
              </Field>
            )}

            {s.provider === 'ollama' && (
              <Field label="Ollama URL">
                <Input
                  value={s.ollamaBaseUrl}
                  onChange={(e) => setS({ ...s, ollamaBaseUrl: e.target.value })}
                  onBlur={(e) => update({ ollamaBaseUrl: e.target.value.trim() })}
                />
              </Field>
            )}

            {s.provider === 'anthropic' && (
              <Field label="Reasoning effort">
                <Select value={s.effort} onValueChange={(v) => update({ effort: v as Effort })}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EFFORTS.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}

            <Field
              label="Max chat context (vault characters)"
              hint="If the vault fits, it is sent in full (with prompt caching on Claude). Otherwise the most relevant notes are picked."
            >
              <Input
                type="number"
                min={10000}
                step={10000}
                value={s.chatContextChars}
                onChange={(e) => setS({ ...s, chatContextChars: Number(e.target.value) })}
                onBlur={(e) => update({ chatContextChars: Math.max(10000, Number(e.target.value) || 300000) })}
              />
            </Field>

            <div className="flex items-center gap-3">
              <Button onClick={test} disabled={testing}>
                {testing && <Loader2 className="animate-spin" />}
                {testing ? 'Testing…' : 'Test connection'}
              </Button>
              {testResult && (
                <span className={cn('text-sm', testResult.ok ? 'text-success' : 'text-destructive')}>
                  {testResult.ok ? '✓ ' : '✕ '}
                  {testResult.msg}
                </span>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Conexión con Claude Desktop / Claude Code mediante el servidor MCP de Trading Brain. */
function McpSection({ open }: { open: boolean }) {
  const [status, setStatus] = useState<McpStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    if (open) api.mcp.status().then(setStatus)
  }, [open])

  if (!status) return null

  const toggle = async () => {
    setBusy(true)
    try {
      const next = status.desktopConnected ? await api.mcp.disconnectDesktop() : await api.mcp.connectDesktop()
      setStatus(next)
      toast.success(
        next.desktopConnected
          ? 'Connected. Quit and reopen Claude Desktop to start using Trading Brain.'
          : 'Disconnected from Claude Desktop. Restart it to apply.'
      )
    } catch (e) {
      toast.error(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  const copy = async (which: 'claude' | 'codex') => {
    await navigator.clipboard.writeText(which === 'claude' ? status.claudeCodeCommand : status.codexCommand)
    setCopied(which)
    setTimeout(() => setCopied(null), 1500)
  }

  const toggleChatGPT = async () => {
    setBusy(true)
    try {
      const next = status.chatgptConnected ? await api.mcp.disconnectChatGPT() : await api.mcp.connectChatGPT()
      setStatus(next)
      toast.success(
        next.chatgptConnected
          ? 'Connected. Restart the ChatGPT desktop app (and Codex) to start using Trading Brain.'
          : 'Disconnected from ChatGPT / Codex. Restart them to apply.'
      )
    } catch (e) {
      toast.error(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <Label>Use with Claude &amp; ChatGPT</Label>
        <p className="text-xs text-muted-foreground">
          Lets Claude or ChatGPT read and write this vault with your own subscription — no API key needed. Then just
          ask about your model in a normal conversation.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
        <div className="grid gap-0.5">
          <span className="flex items-center gap-2 text-sm font-medium">
            Claude Desktop
            {status.desktopConnected ? (
              <Badge variant="outline" className="border-success/50 text-success">connected</Badge>
            ) : !status.desktopInstalled ? (
              <Badge variant="outline">not installed</Badge>
            ) : null}
          </span>
          <span className="text-xs text-muted-foreground">
            {status.desktopInstalled
              ? 'Restart Claude Desktop after connecting or disconnecting.'
              : 'Install Claude Desktop from claude.ai/download, open it once, then connect.'}
          </span>
        </div>
        <Button
          variant={status.desktopConnected ? 'outline' : 'default'}
          onClick={toggle}
          disabled={busy || (!status.desktopInstalled && !status.desktopConnected)}
        >
          {busy ? <Loader2 className="animate-spin" /> : status.desktopConnected ? <Unplug /> : <Plug />}
          {status.desktopConnected ? 'Disconnect' : 'Connect'}
        </Button>
      </div>

      <div className="grid gap-2 rounded-lg border p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="grid gap-0.5">
            <span className="text-sm font-medium">Claude Code</span>
            <span className="text-xs text-muted-foreground">Run this once in a terminal.</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => copy('claude')}>
            {copied === 'claude' ? <Check /> : <Copy />} {copied === 'claude' ? 'Copied' : 'Copy command'}
          </Button>
        </div>
        <code className="block max-h-20 overflow-auto rounded-md bg-muted px-2 py-1.5 font-mono text-[11px] break-all">
          {status.claudeCodeCommand}
        </code>
      </div>

      <div className="grid gap-3 rounded-lg border p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="grid gap-0.5">
            <span className="flex items-center gap-2 text-sm font-medium">
              ChatGPT desktop · Codex
              {status.chatgptConnected ? (
                <Badge variant="outline" className="border-success/50 text-success">connected</Badge>
              ) : !status.chatgptInstalled ? (
                <Badge variant="outline">not detected</Badge>
              ) : null}
            </span>
            <span className="text-xs text-muted-foreground">
              Desktop app only (not chatgpt.com). Custom MCP tools need a Plus or Pro plan. Restart ChatGPT after
              connecting.
            </span>
          </div>
          <Button variant={status.chatgptConnected ? 'outline' : 'default'} onClick={toggleChatGPT} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : status.chatgptConnected ? <Unplug /> : <Plug />}
            {status.chatgptConnected ? 'Disconnect' : 'Connect'}
          </Button>
        </div>
        <div className="flex items-start gap-2">
          <code className="block max-h-20 flex-1 overflow-auto rounded-md bg-muted px-2 py-1.5 font-mono text-[11px] break-all">
            {status.codexCommand}
          </code>
          <Button variant="outline" size="sm" onClick={() => copy('codex')} title="Copy the Codex CLI command">
            {copied === 'codex' ? <Check /> : <Copy />}
          </Button>
        </div>
      </div>
    </div>
  )
}
