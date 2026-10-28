import { useEffect, useRef, useState } from 'react'
import type { ImportPreview, ImportPreviewNote, SaveImportResponse } from '@shared/types'
import { NOTE_TYPES, NOTE_TYPE_IDS, typeColor } from '@shared/types'
import type { AppActions } from '../App'
import { api, errMsg, uid } from '../lib/util'
import { CheckCircle2, HelpCircle, Loader2, Paperclip, Save, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Checkbox } from './ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Textarea } from './ui/textarea'
import AIErrorNotice from './AIErrorNotice'

type Phase = 'input' | 'working' | 'preview' | 'saved'

interface Draft {
  text: string
  hint: string
  files: string[]
}

// Persiste mientras la app está abierta aunque cambies de vista.
let draft: Draft = { text: '', hint: '', files: [] }

export default function ImportView({ actions }: { actions: AppActions }) {
  const [text, setText] = useState(draft.text)
  const [hint, setHint] = useState(draft.hint)
  const [files, setFiles] = useState<string[]>(draft.files)
  const [phase, setPhase] = useState<Phase>('input')
  const [chars, setChars] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  const [saved, setSaved] = useState<SaveImportResponse | null>(null)
  const reqId = useRef<string | null>(null)

  useEffect(() => {
    draft = { text, hint, files }
  }, [text, hint, files])

  useEffect(
    () =>
      api.ai.onProgress((id, n) => {
        if (id === reqId.current) setChars(n)
      }),
    []
  )

  const addFiles = async () => {
    const picked = await api.ai.pickFiles()
    if (!picked.length) return
    setText((t) => [t.trim(), ...picked.map((f) => `--- File: ${f.name} ---\n\n${f.content.trim()}`)].filter(Boolean).join('\n\n'))
    setFiles((f) => [...f, ...picked.map((p) => p.name)])
  }

  const run = async () => {
    setError(null)
    setPhase('working')
    setChars(0)
    const id = uid()
    reqId.current = id
    try {
      const res = await api.ai.organize(id, text, hint)
      setPreview(res)
      setSelected(new Set(res.notes.map((_, i) => i)))
      setPhase('preview')
    } catch (e) {
      setError(errMsg(e))
      setPhase('input')
    } finally {
      reqId.current = null
    }
  }

  const cancel = () => reqId.current && api.ai.cancel(reqId.current)

  const updateNote = (i: number, patch: Partial<ImportPreviewNote>) =>
    setPreview((p) => p && { ...p, notes: p.notes.map((n, j) => (j === i ? { ...n, ...patch } : n)) })

  const save = async () => {
    if (!preview) return
    try {
      const notes = preview.notes.filter((_, i) => selected.has(i))
      const res = await api.ai.saveImport({
        result: preview.result,
        notes,
        sourceText: text,
        sourceLabel: hint || preview.result.modelName
      })
      actions.setVault(res.state)
      setSaved(res)
      setPhase('saved')
      setText('')
      setFiles([])
    } catch (e) {
      setError(errMsg(e))
    }
  }

  const reset = () => {
    setPreview(null)
    setSaved(null)
    setPhase('input')
    setError(null)
  }

  const page = 'mx-auto h-full max-w-4xl overflow-y-auto px-12 pt-12 pb-20'

  if (phase === 'saved' && saved)
    return (
      <div className={page}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-success" /> Import saved
            </CardTitle>
            <CardDescription>
              {saved.created.length} new notes · {saved.updated.length} updated
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex gap-2">
              <Button onClick={() => actions.openNote(saved.mocPath)}>Open model note</Button>
              <Button variant="outline" onClick={reset}>
                Import more
              </Button>
            </div>
            <ul className="grid gap-1 text-sm">
              {[...saved.created, ...saved.updated].map((p) => (
                <li key={p}>
                  <button className="text-link hover:underline" onClick={() => actions.openNote(p)}>
                    {p}
                  </button>
                  {saved.updated.includes(p) && <span className="text-xs text-muted-foreground"> (updated)</span>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    )

  if (phase === 'preview' && preview) {
    const { result, notes } = preview
    return (
      <div className={page}>
        <div className="mb-6 flex items-center justify-between gap-4">
          <h2 className="text-2xl font-semibold tracking-tight">Preview · {notes.length} notes</h2>
          <div className="flex gap-2">
            <Button variant="outline" onClick={reset}>
              Discard
            </Button>
            <Button onClick={save} disabled={!selected.size}>
              <Save /> Save {selected.size} notes
            </Button>
          </div>
        </div>
        {error && <AIErrorNotice msg={error} onOpenSettings={actions.openSettings} />}
        <div className="mb-4 grid gap-2">
          <Label>Model (MOC note)</Label>
          <Input
            value={result.modelName}
            onChange={(e) => setPreview({ ...preview, result: { ...result, modelName: e.target.value } })}
          />
        </div>
        <div className="mb-4 rounded-lg border bg-muted/40 p-4 text-sm whitespace-pre-wrap">{result.overview}</div>
        {result.openQuestions.length > 0 && (
          <Collapsible defaultOpen className="mb-6 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3">
            <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-warning">
              <HelpCircle className="size-4" /> {result.openQuestions.length} open questions / gaps found
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="mt-2 list-disc pl-6 text-sm">
                {result.openQuestions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        )}
        {NOTE_TYPE_IDS.map((t) => {
          const items = notes.map((n, i) => [n, i] as const).filter(([n]) => n.type === t)
          if (!items.length) return null
          return (
            <section key={t} className="mt-6">
              <h3 className="mb-2 text-base font-semibold" style={{ color: NOTE_TYPES[t].color }}>
                {NOTE_TYPES[t].label}{' '}
                <span className="text-xs font-normal text-muted-foreground">→ {NOTE_TYPES[t].folder}</span>
              </h3>
              <div className="grid gap-2">
                {items.map(([n, i]) => (
                  <div
                    key={i}
                    data-preview-note
                    className={cn('rounded-lg border bg-card p-3 transition-opacity', !selected.has(i) && 'opacity-50')}
                  >
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={selected.has(i)}
                        onCheckedChange={(c) => {
                          const next = new Set(selected)
                          c ? next.add(i) : next.delete(i)
                          setSelected(next)
                        }}
                      />
                      <Input
                        className="h-8 flex-1 font-medium"
                        value={n.title}
                        onChange={(e) => updateNote(i, { title: e.target.value })}
                      />
                      <Select
                        value={n.type}
                        onValueChange={(v) => updateNote(i, { type: v as ImportPreviewNote['type'] })}
                      >
                        <SelectTrigger size="sm" className="w-36" style={{ color: typeColor(n.type) }}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {NOTE_TYPE_IDS.filter((x) => x !== 'model').map((x) => (
                            <SelectItem key={x} value={x}>
                              {NOTE_TYPES[x].label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {n.existingPath ? (
                        <Badge variant="outline" className="border-warning/50 text-warning" title={n.existingPath}>
                          appends to existing
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-success/50 text-success">
                          new
                        </Badge>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => setOpenIdx(openIdx === i ? null : i)}>
                        {openIdx === i ? 'Hide' : 'View'}
                      </Button>
                    </div>
                    <p className="mt-1.5 ml-7 text-xs text-muted-foreground">{n.summary}</p>
                    {openIdx === i && (
                      <Textarea
                        className="mt-2 min-h-56 font-mono text-xs"
                        value={n.content}
                        onChange={(e) => updateNote(i, { content: e.target.value })}
                      />
                    )}
                  </div>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    )
  }

  return (
    <div className={page}>
      <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
        <Sparkles className="size-6 text-primary" /> Import with AI
      </h2>
      <p className="mt-2 mb-6 text-muted-foreground">
        Paste everything you have about your model: rules, setups, course notes, transcripts, checklists, journal…
        The AI turns it into linked atomic notes and shows you a preview before saving.
      </p>
      <div className="mb-4 grid gap-2">
        <Label htmlFor="model-hint">Model name (optional)</Label>
        <Input
          id="model-hint"
          value={hint}
          onChange={(e) => setHint(e.target.value)}
          placeholder="e.g. ICT Silver Bullet, Wyckoff, my breakout model…"
        />
      </div>
      <Textarea
        data-source
        className="mb-3 min-h-80 font-mono text-[13px]"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste your material here…"
        disabled={phase === 'working'}
      />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={addFiles} disabled={phase === 'working'}>
            <Paperclip /> Add files
          </Button>
          <span className="text-xs text-muted-foreground">
            {text.length.toLocaleString()} characters{files.length ? ` · ${files.length} files` : ''}
          </span>
        </div>
        {phase === 'working' ? (
          <div className="flex items-center gap-3">
            <Loader2 className="size-4 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground">Organizing… {chars.toLocaleString()} characters generated</span>
            <Button variant="outline" onClick={cancel}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button onClick={run} disabled={!text.trim()}>
            <Sparkles /> Organize with AI
          </Button>
        )}
      </div>
      {error && <AIErrorNotice msg={error} onOpenSettings={actions.openSettings} />}
    </div>
  )
}
