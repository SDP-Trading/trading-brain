import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import {
  ArrowLeft,
  ArrowRight,
  Brain,
  Check,
  CheckCircle2,
  Cpu,
  Download,
  FolderOpen,
  FolderPlus,
  KeyRound,
  Loader2,
  MessageSquare,
  Monitor,
  Moon,
  Plug,
  RefreshCw,
  Sparkles,
  Sun,
  Vault as VaultIcon
} from 'lucide-react'
import type { McpStatus, OllamaStatus, ThemeMode, VaultListItem, VaultState } from '@shared/types'
import { api, errMsg } from '../lib/util'
import { useTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'

const RECOMMENDED_OLLAMA_MODEL = 'llama3.1'
const STEPS = ['Welcome', 'Vault', 'AI', 'Done'] as const

type AiChoice = 'claude' | 'chatgpt' | 'apikey' | 'ollama'

interface Props {
  vault: VaultState
  setVault(s: VaultState): void
  onDone(): void
}

export default function Onboarding({ vault, setVault, onDone }: Props) {
  const [step, setStep] = useState(0)
  const [done, setDone] = useState<Set<AiChoice>>(new Set())
  const markDone = (c: AiChoice) => setDone((d) => new Set(d).add(c))

  const finish = async () => {
    await api.settings.update({ onboarded: true })
    onDone()
  }

  return (
    <div className="flex h-full flex-col items-center overflow-y-auto px-6 pt-14 pb-10">
      <div className="drag-region" />
      <div className="mb-8 flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={cn(
                'flex size-6 items-center justify-center rounded-full border text-xs',
                i < step && 'border-primary bg-primary text-primary-foreground',
                i === step && 'border-primary text-primary',
                i > step && 'text-muted-foreground'
              )}
            >
              {i < step ? <Check className="size-3.5" /> : i + 1}
            </div>
            <span className={cn('text-sm', i === step ? 'font-medium' : 'text-muted-foreground')}>{s}</span>
            {i < STEPS.length - 1 && <div className="mx-1 h-px w-8 bg-border" />}
          </div>
        ))}
      </div>

      <div className="w-full max-w-2xl">
        {step === 0 && <WelcomeStep />}
        {step === 1 && <VaultStep vault={vault} setVault={setVault} />}
        {step === 2 && <AiStep done={done} markDone={markDone} />}
        {step === 3 && <DoneStep done={done} />}

        <div className="mt-8 flex items-center justify-between">
          {step > 0 ? (
            <Button variant="ghost" onClick={() => setStep(step - 1)}>
              <ArrowLeft /> Back
            </Button>
          ) : (
            <Button variant="ghost" className="text-muted-foreground" onClick={finish}>
              Skip setup
            </Button>
          )}
          {step < 3 ? (
            <Button onClick={() => setStep(step + 1)} disabled={step === 1 && !vault.path}>
              {step === 2 && done.size === 0 ? 'Set up later' : 'Continue'} <ArrowRight />
            </Button>
          ) : (
            <Button onClick={finish} disabled={!vault.path}>
              Start using Trading Brain <ArrowRight />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function Heading({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="mb-6 text-center">
      <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">{icon}</div>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mx-auto mt-2 max-w-lg text-muted-foreground">{children}</p>
    </div>
  )
}

// ---------- 1. Bienvenida ----------

function WelcomeStep() {
  const { theme, setTheme } = useTheme()
  return (
    <>
      <Heading icon={<Brain className="size-6" />} title="Welcome to Trading Brain">
        Your second brain for trading: turn everything you know about your model into linked notes, see how it fits
        together and ask questions about it. Setup takes about a minute.
      </Heading>
      <div className="mx-auto grid max-w-md gap-2">
        <span className="text-sm font-medium">Appearance</span>
        <ToggleGroup type="single" variant="outline" className="w-full" value={theme} onValueChange={(v) => v && setTheme(v as ThemeMode)}>
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
        <span className="text-xs text-muted-foreground">System follows your macOS appearance.</span>
      </div>
    </>
  )
}

// ---------- 2. Vault ----------

function VaultStep({ vault, setVault }: { vault: VaultState; setVault(s: VaultState): void }) {
  const [recent, setRecent] = useState<VaultListItem[]>([])
  useEffect(() => {
    api.vault.list().then(setRecent)
  }, [vault.path])

  const run = async (fn: () => Promise<VaultState | null>) => {
    try {
      const s = await fn()
      if (s) setVault(s)
    } catch (e) {
      toast.error(errMsg(e))
    }
  }

  return (
    <>
      <Heading icon={<VaultIcon className="size-6" />} title="Choose your vault">
        A vault is a plain folder of Markdown notes — compatible with Obsidian. Start a new one, or open a folder you
        already have (for example your Obsidian vault).
      </Heading>
      <div className="grid gap-3 sm:grid-cols-2">
        <OptionButton icon={<FolderPlus />} title="Create a new vault" onClick={() => run(() => api.vault.select())}>
          Pick or create an empty folder. Trading Brain sets up folders for setups, rules, risk and more.
        </OptionButton>
        <OptionButton icon={<FolderOpen />} title="Open an existing folder" onClick={() => run(() => api.vault.select())}>
          Use notes you already have. Nothing is moved or changed.
        </OptionButton>
      </div>
      {recent.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Your vaults</div>
          <div className="divide-y rounded-lg border">
            {recent.map((v) => (
              <button
                key={v.path}
                disabled={!v.exists}
                onClick={() => !v.current && run(() => api.vault.open(v.path))}
                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-accent/50 disabled:opacity-50"
              >
                <VaultIcon className="size-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{v.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{v.path}</div>
                </div>
                {v.current && (
                  <span className="flex items-center gap-1 text-xs text-success">
                    <CheckCircle2 className="size-4" /> Selected
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

function OptionButton({ icon, title, children, onClick }: { icon: ReactNode; title: string; children: ReactNode; onClick(): void }) {
  return (
    <button onClick={onClick} className="grid gap-1.5 rounded-xl border p-4 text-left transition-colors hover:border-primary hover:bg-primary/5">
      <span className="flex items-center gap-2 font-medium [&_svg]:size-4 [&_svg]:text-primary">
        {icon} {title}
      </span>
      <span className="text-sm text-muted-foreground">{children}</span>
    </button>
  )
}

// ---------- 3. IA ----------

function AiStep({ done, markDone }: { done: Set<AiChoice>; markDone(c: AiChoice): void }) {
  const [open, setOpen] = useState<AiChoice | null>(null)
  const [mcp, setMcp] = useState<McpStatus | null>(null)
  useEffect(() => {
    api.mcp.status().then((s) => {
      setMcp(s)
      if (s.desktopConnected) markDone('claude')
      if (s.chatgptConnected) markDone('chatgpt')
    })
    api.ai.configured().then((ok) => ok && markDone('apikey'))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const card = (id: AiChoice, icon: ReactNode, title: string, subtitle: string, body: ReactNode) => (
    <div className={cn('rounded-xl border transition-colors', open === id && 'border-primary')}>
      <button className="flex w-full items-center gap-3 p-4 text-left" onClick={() => setOpen(open === id ? null : id)}>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary [&_svg]:size-4.5">{icon}</span>
        <span className="grid flex-1 gap-0.5">
          <span className="font-medium">{title}</span>
          <span className="text-sm text-muted-foreground">{subtitle}</span>
        </span>
        {done.has(id) && <CheckCircle2 className="size-5 shrink-0 text-success" />}
      </button>
      {open === id && <div className="grid gap-3 border-t px-4 py-4 text-sm">{body}</div>}
    </div>
  )

  const connect = async (which: 'claude' | 'chatgpt') => {
    try {
      const s = which === 'claude' ? await api.mcp.connectDesktop() : await api.mcp.connectChatGPT()
      setMcp(s)
      markDone(which)
      toast.success(which === 'claude' ? 'Connected. Restart Claude Desktop to use it.' : 'Connected. Restart ChatGPT to use it.')
    } catch (e) {
      toast.error(errMsg(e))
    }
  }

  return (
    <>
      <Heading icon={<Sparkles className="size-6" />} title="How do you want to use AI?">
        AI organizes what you import and answers questions about your model. Pick one or more — you can change this
        anytime in Settings.
      </Heading>
      <div className="grid gap-3">
        {card(
          'claude',
          <MessageSquare />,
          'I have Claude Pro or Max',
          'Ask about your model in Claude Desktop. No API key needed.',
          <>
            <p>
              Claude Desktop reads and writes this vault through Trading Brain. Then just ask, e.g. “According to my
              model, what invalidates a setup?”.
            </p>
            {mcp && !mcp.desktopInstalled && !mcp.desktopConnected && (
              <p className="text-muted-foreground">
                Install Claude Desktop from{' '}
                <a className="text-link underline" href="https://claude.ai/download" target="_blank" rel="noreferrer">
                  claude.ai/download
                </a>
                , open it once, then come back.
              </p>
            )}
            <div>
              <Button onClick={() => connect('claude')} disabled={!mcp?.desktopInstalled || mcp.desktopConnected}>
                {mcp?.desktopConnected ? <Check /> : <Plug />} {mcp?.desktopConnected ? 'Connected' : 'Connect Claude Desktop'}
              </Button>
            </div>
          </>
        )}
        {card(
          'chatgpt',
          <MessageSquare />,
          'I have ChatGPT Plus or Pro',
          'Ask about your model in the ChatGPT desktop app. No API key needed.',
          <>
            <p>Works with the ChatGPT desktop app and Codex (not chatgpt.com in the browser).</p>
            <div>
              <Button onClick={() => connect('chatgpt')} disabled={mcp?.chatgptConnected}>
                {mcp?.chatgptConnected ? <Check /> : <Plug />} {mcp?.chatgptConnected ? 'Connected' : 'Connect ChatGPT'}
              </Button>
            </div>
          </>
        )}
        {card(
          'apikey',
          <KeyRound />,
          'Use an API key',
          'Best quality, inside Trading Brain. You pay only for what you use.',
          <ApiKeyForm onSaved={() => markDone('apikey')} />
        )}
        {card(
          'ollama',
          <Cpu />,
          'Free local AI (Ollama)',
          'Runs on your Mac. Free and private; less capable than Claude.',
          <OllamaSetup onReady={() => markDone('ollama')} />
        )}
      </div>
    </>
  )
}

function ApiKeyForm({ onSaved }: { onSaved(): void }) {
  const [provider, setProvider] = useState<'anthropic' | 'openai'>('anthropic')
  const [key, setKey] = useState('')
  const [state, setState] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [msg, setMsg] = useState('')

  const save = async () => {
    setState('testing')
    try {
      await api.settings.setKey(provider, key)
      await api.settings.update({ provider })
      setMsg(await api.ai.test())
      setState('ok')
      onSaved()
    } catch (e) {
      setMsg(errMsg(e).replace(/^\[config\] /, ''))
      setState('error')
    }
  }

  return (
    <>
      <ToggleGroup type="single" variant="outline" value={provider} onValueChange={(v) => v && setProvider(v as typeof provider)}>
        <ToggleGroupItem value="anthropic">Anthropic (Claude)</ToggleGroupItem>
        <ToggleGroupItem value="openai">OpenAI</ToggleGroupItem>
      </ToggleGroup>
      <p className="text-muted-foreground">
        Create a key at{' '}
        <a
          className="text-link underline"
          href={provider === 'anthropic' ? 'https://platform.claude.com/settings/keys' : 'https://platform.openai.com/api-keys'}
          target="_blank"
          rel="noreferrer"
        >
          {provider === 'anthropic' ? 'platform.claude.com' : 'platform.openai.com'}
        </a>
        . It is stored encrypted in your system keychain.
      </p>
      <div className="flex gap-2">
        <Input
          type="password"
          placeholder={provider === 'anthropic' ? 'sk-ant-…' : 'sk-…'}
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
        <Button onClick={save} disabled={!key.trim() || state === 'testing'}>
          {state === 'testing' && <Loader2 className="animate-spin" />} Save &amp; test
        </Button>
      </div>
      {state === 'ok' && <p className="text-success">✓ {msg}</p>}
      {state === 'error' && <p className="text-destructive">✕ {msg}</p>}
    </>
  )
}

function OllamaSetup({ onReady }: { onReady(): void }) {
  const [status, setStatus] = useState<OllamaStatus | null>(null)
  const [model, setModel] = useState('')
  const [pull, setPull] = useState<{ progress: number; status: string } | null>(null)
  const [active, setActive] = useState(false)

  const check = () =>
    api.ai.ollamaStatus().then((s) => {
      setStatus(s)
      if (s.models.length && !model) setModel(s.models[0])
    })

  useEffect(() => {
    check()
    return api.ai.onPullProgress((_m, progress, status) => setPull({ progress, status }))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const download = async () => {
    setPull({ progress: 0, status: 'starting' })
    try {
      await api.ai.ollamaPull(RECOMMENDED_OLLAMA_MODEL)
      await check()
      setModel(RECOMMENDED_OLLAMA_MODEL)
      toast.success(`${RECOMMENDED_OLLAMA_MODEL} downloaded`)
    } catch (e) {
      toast.error(errMsg(e))
    } finally {
      setPull(null)
    }
  }

  const use = async () => {
    const s = await api.settings.get()
    await api.settings.update({ provider: 'ollama', models: { ...s.models, ollama: model } })
    setActive(true)
    onReady()
    toast.success(`The in-app chat will use ${model}`)
  }

  if (!status) return <Loader2 className="size-4 animate-spin" />

  if (!status.running)
    return (
      <>
        <p>
          Ollama is not running. Install it from{' '}
          <a className="text-link underline" href="https://ollama.com/download" target="_blank" rel="noreferrer">
            ollama.com/download
          </a>
          , open it, then check again.
        </p>
        <div>
          <Button variant="outline" onClick={check}>
            <RefreshCw /> Check again
          </Button>
        </div>
      </>
    )

  return (
    <>
      <p className="flex items-center gap-1.5 text-success">
        <CheckCircle2 className="size-4" /> Ollama is running
      </p>
      {status.models.length > 0 && (
        <div className="flex gap-2">
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Choose a model" />
            </SelectTrigger>
            <SelectContent>
              {status.models.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={use} disabled={!model || active}>
            {active ? <Check /> : null} {active ? 'In use' : 'Use this model'}
          </Button>
        </div>
      )}
      {!status.models.includes(RECOMMENDED_OLLAMA_MODEL) && !status.models.some((m) => m.startsWith(RECOMMENDED_OLLAMA_MODEL + ':')) && (
        <div className="grid gap-2">
          <p className="text-muted-foreground">
            {status.models.length ? 'Or download' : 'Download'} the recommended model,{' '}
            <code className="font-mono">{RECOMMENDED_OLLAMA_MODEL}</code> (~4.9 GB, needs 8 GB of RAM).
          </p>
          {pull ? (
            <div className="grid gap-1">
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary transition-all" style={{ width: `${Math.round(pull.progress * 100)}%` }} />
              </div>
              <span className="text-xs text-muted-foreground">
                {pull.status} {pull.progress > 0 && `· ${Math.round(pull.progress * 100)}%`}
              </span>
            </div>
          ) : (
            <div>
              <Button variant="outline" onClick={download}>
                <Download /> Download {RECOMMENDED_OLLAMA_MODEL}
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  )
}

// ---------- 4. Listo ----------

function DoneStep({ done }: { done: Set<AiChoice> }) {
  const items: { ok: boolean; text: string }[] = [
    { ok: done.has('claude'), text: 'Ask Claude Desktop about your model (restart Claude first)' },
    { ok: done.has('chatgpt'), text: 'Ask the ChatGPT desktop app about your model (restart ChatGPT first)' },
    { ok: done.has('apikey') || done.has('ollama'), text: 'Chat and import with AI right inside Trading Brain' }
  ].filter((i) => i.ok)

  return (
    <>
      <Heading icon={<CheckCircle2 className="size-6" />} title="You're all set">
        Here is what you can do next.
      </Heading>
      <div className="grid gap-2 rounded-xl border p-4 text-sm">
        {items.map((i) => (
          <div key={i.text} className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-success" /> {i.text}
          </div>
        ))}
        {done.has('apikey') || done.has('ollama') ? (
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" /> Open <strong>Import with AI</strong> (⌘I) and paste everything about your model
          </div>
        ) : done.has('claude') || done.has('chatgpt') ? (
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" /> Paste your material in Claude or ChatGPT and ask: “organize this into my Trading Brain”
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          <Brain className="size-4 text-primary" /> Explore how it connects in the <strong>Graph</strong> (⌘G)
        </div>
        {items.length === 0 && (
          <p className="mt-2 text-muted-foreground">
            You skipped AI for now. Notes, links and the graph work without it — set it up anytime in Settings (⌘,).
          </p>
        )}
      </div>
    </>
  )
}
