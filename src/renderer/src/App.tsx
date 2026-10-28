import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { PanelRightOpen } from 'lucide-react'
import type { VaultState } from '@shared/types'
import { api, errMsg, nameMap } from './lib/util'
import { Button } from './components/ui/button'
import Sidebar from './components/Sidebar'
import NoteView from './components/NoteView'
import GraphView from './components/GraphView'
import ImportView from './components/ImportView'
import CanvasView from './components/views/CanvasView'
import FlowView from './components/views/FlowView'
import HealthView from './components/views/HealthView'
import MindMapView from './components/views/MindMapView'
import RightPanel from './components/RightPanel'
import SettingsModal from './components/SettingsModal'
import PromptModal, { type PromptRequest } from './components/PromptModal'
import Welcome from './components/Welcome'
import Onboarding from './components/Onboarding'
import ConfirmDelete, { type DeleteRequest } from './components/ConfirmDelete'

export type View = 'note' | 'graph' | 'mindmap' | 'flow' | 'health' | 'canvas' | 'import'

export interface AppActions {
  openNote(path: string): void
  openCanvas(path: string | null): void
  openLink(target: string): Promise<void>
  ask(title: string, initial?: string): Promise<string | null>
  setVault(s: VaultState): void
  notify(msg: string): void
  openSettings(): void
  /** Pide confirmación y mueve la nota, canvas o carpeta a .trash (con Undo). */
  remove(path: string): void
}

export default function App() {
  const [vault, setVault] = useState<VaultState | null>(null)
  const [view, setView] = useState<View>('note')
  const [current, setCurrent] = useState<string | null>(null)
  const [canvasPath, setCanvasPath] = useState<string | null>(null)
  const [rightOpen, setRightOpen] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [prompt, setPrompt] = useState<PromptRequest | null>(null)
  // null = cargando ajustes; false = mostrar el asistente de primer arranque.
  const [onboarded, setOnboarded] = useState<boolean | null>(null)
  const [toDelete, setToDelete] = useState<DeleteRequest | null>(null)
  const vaultRef = useRef<VaultState | null>(null)
  vaultRef.current = vault

  useEffect(() => {
    api.vault.state().then(setVault)
    api.settings.get().then((s) => setOnboarded(s.onboarded))
    return api.vault.onChanged(setVault)
  }, [])

  // Al cambiar de vault se cierra la nota abierta (aunque exista una con la misma ruta en el nuevo).
  const vaultPath = vault?.path ?? null
  useEffect(() => {
    setCurrent(null)
    setCanvasPath(null)
    setView('note')
  }, [vaultPath])

  useEffect(() => {
    if (!canvasPath || !vault) return
    const exists = (nodes: VaultState['tree']): boolean =>
      nodes.some((n) => n.path === canvasPath || (n.type === 'dir' && exists(n.children ?? [])))
    if (!exists(vault.tree)) setCanvasPath(null)
  }, [vault, canvasPath])

  // Si la nota abierta desaparece (borrada fuera de la app), se cierra.
  useEffect(() => {
    if (current && vault && !vault.index.some((e) => e.path === current)) setCurrent(null)
  }, [vault, current])

  const names = useMemo(() => nameMap(vault?.index ?? []), [vault])

  const actions: AppActions = useMemo(
    () => ({
      openNote(path) {
        setCurrent(path)
        setView('note')
      },
      openCanvas(path) {
        setCanvasPath(path)
        setView('canvas')
      },
      async openLink(target) {
        const path = await api.notes.resolve(target)
        if (path) {
          setCurrent(path)
          setView('note')
          return
        }
        // Como en Obsidian: un enlace a una nota inexistente la crea.
        try {
          const res = await api.notes.create('', target)
          setVault(res.state)
          setCurrent(res.path)
          setView('note')
        } catch (e) {
          toast.error(errMsg(e))
        }
      },
      ask: (title, initial = '') => new Promise((resolve) => setPrompt({ title, initial, resolve })),
      setVault,
      notify: (msg) => toast(msg),
      openSettings: () => setSettingsOpen(true),
      remove(path) {
        const v = vaultRef.current
        if (!v) return
        const find = (nodes: VaultState['tree']): VaultState['tree'][number] | undefined => {
          for (const n of nodes) {
            if (n.path === path) return n
            const hit = n.children && find(n.children)
            if (hit) return hit
          }
        }
        const node = find(v.tree)
        const kind = node?.type === 'dir' ? 'folder' : node?.kind === 'canvas' ? 'canvas' : 'note'
        const name = node?.name ?? path.split('/').pop() ?? path
        const count = kind === 'folder' ? v.index.filter((e) => e.path.startsWith(path + '/')).length : undefined
        setToDelete({ path, name, kind, count })
      }
    }),
    []
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key === 'g') (e.preventDefault(), setView('graph'))
      if (e.key === 'i') (e.preventDefault(), setView('import'))
      if (e.key === ',') (e.preventDefault(), setSettingsOpen(true))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!vault) return <div className="flex h-full items-center justify-center text-muted-foreground">Loading…</div>

  if (onboarded === null) return null
  if (!onboarded) return <Onboarding vault={vault} setVault={setVault} onDone={() => setOnboarded(true)} />
  if (!vault.path) return <Welcome onOpen={setVault} />

  return (
    <div className="grid h-full grid-cols-[272px_1fr_auto]">
      <div className="drag-region" />
      <Sidebar
        vault={vault}
        current={current}
        view={view}
        setView={setView}
        actions={actions}
        openSettings={() => setSettingsOpen(true)}
      />
      <main className="relative h-full min-w-0 overflow-hidden">
        {view === 'note' && (
          <NoteView key={`${vault.path}:${current ?? ''}`} path={current} vault={vault} names={names} actions={actions} />
        )}
        {view === 'graph' && <GraphView vault={vault} current={current} actions={actions} />}
        {view === 'import' && <ImportView actions={actions} />}
        {view === 'mindmap' && <MindMapView vault={vault} names={names} actions={actions} />}
        {view === 'flow' && <FlowView vault={vault} actions={actions} openCanvas={actions.openCanvas} />}
        {view === 'health' && <HealthView vault={vault} actions={actions} />}
        {view === 'canvas' && (
          <CanvasView path={canvasPath} vault={vault} names={names} actions={actions} openCanvas={actions.openCanvas} />
        )}
        {!rightOpen && (
          <Button
            variant="outline"
            size="icon"
            className="absolute top-9 right-3 z-10"
            title="Open panel"
            onClick={() => setRightOpen(true)}
          >
            <PanelRightOpen />
          </Button>
        )}
      </main>
      {rightOpen && (
        <RightPanel
          key={vault.path}
          current={view === 'note' ? current : null}
          vault={vault}
          names={names}
          actions={actions}
          onClose={() => setRightOpen(false)}
        />
      )}
      <ConfirmDelete
        req={toDelete}
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          const req = toDelete!
          setToDelete(null)
          try {
            const res = await api.notes.delete(req.path)
            setVault(res.state)
            toast(`Moved “${req.name}” to the trash`, {
              action: {
                label: 'Undo',
                onClick: () =>
                  api.notes
                    .restore(res.trash, req.path)
                    .then((s) => {
                      setVault(s)
                      toast.success(`Restored “${req.name}”`)
                    })
                    .catch((e) => toast.error(errMsg(e)))
              }
            })
          } catch (e) {
            toast.error(errMsg(e))
          }
        }}
      />
      <SettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onRunSetup={() => {
          setSettingsOpen(false)
          api.settings.update({ onboarded: false }).then(() => setOnboarded(false))
        }}
      />
      <PromptModal
        req={prompt}
        onDone={(v) => {
          prompt?.resolve(v)
          setPrompt(null)
        }}
      />
    </div>
  )
}
