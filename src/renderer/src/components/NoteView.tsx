import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { VaultState } from '@shared/types'
import { NOTE_TYPES, typeColor } from '@shared/types'
import { basenameNoExt } from '@shared/markdown'
import type { AppActions } from '../App'
import { api, errMsg } from '../lib/util'
import Editor from './Editor'
import { Check, FileText, FolderOpen, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger } from './ui/dropdown-menu'
import { Button } from './ui/button'
import { Badge } from './ui/badge'

interface Props {
  path: string | null
  vault: VaultState
  names: Map<string, string>
  actions: AppActions
}

export default function NoteView({ path, vault, names, actions }: Props) {
  const [content, setContent] = useState<string | null>(null)
  const [saving, setSaving] = useState<'saved' | 'dirty' | 'saving'>('saved')
  const pending = useRef<string | null>(null)
  // Vault al que pertenece esta nota (por si se cambia de vault con un guardado pendiente).
  const root = useRef(vault.path)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const entry = vault.index.find((e) => e.path === path)
  const titles = useMemo(() => vault.index.map((e) => e.title), [vault.index])

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (!path || pending.current == null) return
    const text = pending.current
    pending.current = null
    setSaving('saving')
    try {
      actions.setVault(await api.notes.write(path, text, root.current ?? undefined))
      setSaving(pending.current == null ? 'saved' : 'dirty')
    } catch (e) {
      actions.notify(`Could not save: ${errMsg(e)}`)
      setSaving('dirty')
    }
  }, [path, actions])

  useEffect(() => {
    if (!path) return
    api.notes.read(path).then(setContent).catch((e) => actions.notify(errMsg(e)))
    return () => void flush()
  }, [path]) // eslint-disable-line react-hooks/exhaustive-deps

  // Recarga si el archivo cambió fuera de la app (p. ej. editado en Obsidian).
  useEffect(() => {
    if (!path || pending.current != null || content == null) return
    api.notes
      .read(path)
      .then((disk) => {
        if (pending.current == null && disk !== content) setContent(disk)
      })
      .catch(() => {}) // la nota se acaba de borrar o mover: App la cierra
  }, [entry?.mtime]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // ⌘⇧⌫: borrar la nota abierta (⌘⌫ solo borraría hasta el inicio de línea en el editor).
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'Backspace' && path) {
        e.preventDefault()
        actions.remove(path)
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        flush()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [flush, path, actions])

  if (!path)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <FileText className="size-10 text-muted-foreground/50" />
        <h2 className="text-xl font-semibold">No note open</h2>
        <p className="text-muted-foreground">Pick a note in the sidebar, or start by importing your model with AI.</p>
        <Button onClick={() => actions.openLink('Home')}>Open Home</Button>
        <p className="text-xs text-muted-foreground">⌘G graph · ⌘I import · ⌘, settings</p>
      </div>
    )

  const onChange = (v: string) => {
    setContent(v)
    pending.current = v
    setSaving('dirty')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, 700)
  }

  const rename = async () => {
    const name = await actions.ask('Rename note (links are updated)', basenameNoExt(path))
    if (!name) return
    await flush()
    try {
      const res = await api.notes.rename(path, name)
      actions.setVault(res.state)
      actions.openNote(res.path)
    } catch (e) {
      actions.notify(errMsg(e))
    }
  }

  const type = entry?.type
  const label = type ? ((NOTE_TYPES as Record<string, { label: string }>)[type]?.label ?? type) : null
  return (
    <div className="flex h-full flex-col">
      <header className="border-b px-10 pt-9 pb-3">
        <div className="text-xs text-muted-foreground">{path.split('/').slice(0, -1).join(' / ')}</div>
        <h1
          className="mt-0.5 mb-2 cursor-text text-2xl font-semibold tracking-tight"
          onDoubleClick={rename}
          title="Double-click to rename"
        >
          {basenameNoExt(path)}
        </h1>
        <div className="flex flex-wrap items-center gap-1.5">
          {label && (
            <Badge variant="outline" style={{ borderColor: typeColor(type), color: typeColor(type) }}>
              {label}
            </Badge>
          )}
          {entry?.tags.slice(0, 6).map((t) => (
            <Badge key={t} variant="secondary" className="bg-tag font-normal text-link">
              #{t}
            </Badge>
          ))}
          <span className="flex-1" />
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {saving === 'saved' ? (
              <>
                <Check className="size-3.5" /> Saved
              </>
            ) : saving === 'saving' ? (
              'Saving…'
            ) : (
              <span className="size-2 rounded-full bg-warning" title="Unsaved changes" />
            )}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7" aria-label="Note actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={rename}>
                <Pencil /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => api.notes.reveal(path)}>
                <FolderOpen /> Reveal in Finder
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => actions.remove(path)}>
                <Trash2 /> Delete note <DropdownMenuShortcut>⌘⇧⌫</DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">
        {content == null ? (
          <div className="p-4 text-muted-foreground">Loading…</div>
        ) : (
          <Editor value={content} onChange={onChange} titles={titles} names={names} onOpenLink={actions.openLink} />
        )}
      </div>
    </div>
  )
}
