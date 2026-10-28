import { useEffect, useState } from 'react'
import {
  ChevronRight,
  FilePlus,
  FileText,
  FolderOpen,
  FolderPlus,
  GitFork,
  HeartPulse,
  Layers,
  Waypoints,
  MoreHorizontal,
  Network,
  Pencil,
  Search,
  Settings,
  Sparkles,
  Trash2
} from 'lucide-react'
import type { SearchResult, TreeNode, VaultState } from '@shared/types'
import { typeColor } from '@shared/types'
import type { AppActions, View } from '../App'
import { api, errMsg, folderOf } from '../lib/util'
import { cn } from '@/lib/utils'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { ScrollArea } from './ui/scroll-area'
import { Separator } from './ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from './ui/dropdown-menu'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from './ui/context-menu'
import ThemeToggle from './ThemeToggle'
import VaultSwitcher from './VaultSwitcher'

interface Props {
  vault: VaultState
  current: string | null
  view: View
  setView(v: View): void
  actions: AppActions
  openSettings(): void
}

const NAV: { id: View; label: string; icon: typeof FileText }[] = [
  { id: 'note', label: 'Notes', icon: FileText },
  { id: 'graph', label: 'Graph', icon: Network },
  { id: 'mindmap', label: 'Mind map', icon: Waypoints },
  { id: 'flow', label: 'Decision flow', icon: GitFork },
  { id: 'health', label: 'Model health', icon: HeartPulse },
  { id: 'canvas', label: 'Canvas', icon: Layers },
  { id: 'import', label: 'Import with AI', icon: Sparkles }
]

function IconButton({ label, onClick, children }: { label: string; onClick(): void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" onClick={onClick} aria-label={label}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export default function Sidebar({ vault, current, view, setView, actions, openSettings }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [selectedDir, setSelectedDir] = useState('')
  const typeByPath = new Map(vault.index.map((e) => [e.path, e.type]))

  useEffect(() => {
    if (!query.trim()) return setResults([])
    const t = setTimeout(() => api.notes.search(query).then(setResults), 150)
    return () => clearTimeout(t)
  }, [query, vault])

  // Expande las carpetas de la nota abierta.
  useEffect(() => {
    if (!current) return
    const parts = current.split('/').slice(0, -1)
    setExpanded((prev) => {
      const next = new Set(prev)
      parts.forEach((_, i) => next.add(parts.slice(0, i + 1).join('/')))
      return next
    })
    setSelectedDir(folderOf(current))
  }, [current])

  const run = async (fn: () => Promise<void>) => {
    try {
      await fn()
    } catch (e) {
      actions.notify(errMsg(e))
    }
  }

  const newNote = () =>
    run(async () => {
      const title = await actions.ask('New note', 'Untitled')
      if (!title) return
      const res = await api.notes.create(selectedDir, title)
      actions.setVault(res.state)
      actions.openNote(res.path)
    })

  const newFolder = () =>
    run(async () => {
      const name = await actions.ask('New folder')
      if (!name) return
      actions.setVault(await api.notes.createFolder(selectedDir ? `${selectedDir}/${name}` : name))
    })

  const rename = (node: TreeNode) =>
    run(async () => {
      const name = await actions.ask('Rename note (links are updated)', node.name)
      if (!name || name === node.name) return
      const res = await api.notes.rename(node.path, name)
      actions.setVault(res.state)
      if (current === node.path) actions.openNote(res.path)
    })

  const remove = (node: TreeNode) => actions.remove(node.path)

  const newNoteIn = (dir: string) =>
    run(async () => {
      const title = await actions.ask('New note', 'Untitled')
      if (!title) return
      const res = await api.notes.create(dir, title)
      actions.setVault(res.state)
      actions.openNote(res.path)
    })

  /** Menú de clic derecho común a notas, canvas y carpetas. */
  const withMenu = (node: TreeNode, row: React.ReactNode) => (
    <ContextMenu key={node.path}>
      <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        {node.type === 'dir' ? (
          <ContextMenuItem onClick={() => newNoteIn(node.path)}>
            <FilePlus /> New note here
          </ContextMenuItem>
        ) : (
          <ContextMenuItem onClick={() => rename(node)}>
            <Pencil /> Rename
          </ContextMenuItem>
        )}
        <ContextMenuItem onClick={() => api.notes.reveal(node.path)}>
          <FolderOpen /> Reveal in Finder
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onClick={() => remove(node)}>
          <Trash2 /> Delete{node.type === 'dir' ? ' folder' : ''}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )

  const toggle = (path: string) => {
    setSelectedDir(path)
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(path) ? next.delete(path) : next.add(path)
      return next
    })
  }

  const rowBase =
    'group flex h-7 w-full cursor-pointer items-center gap-1.5 rounded-md pr-1 text-left text-[13px] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'

  const renderNode = (node: TreeNode, depth: number) => {
    const pad = { paddingLeft: 8 + depth * 14 }
    if (node.type === 'dir') {
      const open = expanded.has(node.path)
      return (
        <div key={node.path}>
          {withMenu(
            node,
            <button
              className={cn(rowBase, 'font-medium text-muted-foreground', selectedDir === node.path && 'text-foreground')}
              style={pad}
              onClick={() => toggle(node.path)}
            >
              <ChevronRight className={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-90')} />
              <span className="truncate">{node.name}</span>
            </button>
          )}
          {open && node.children?.map((c) => renderNode(c, depth + 1))}
        </div>
      )
    }
    const isCanvas = node.kind === 'canvas'
    const active = current === node.path && view === 'note'
    return withMenu(
      node,
      <div
        data-note={node.name}
        className={cn(rowBase, active && 'bg-sidebar-accent font-medium text-sidebar-accent-foreground')}
        style={pad}
        onClick={() => (isCanvas ? actions.openCanvas(node.path) : actions.openNote(node.path))}
      >
        {isCanvas ? (
          <Layers className="size-3.5 shrink-0 text-primary" />
        ) : (
          <span className="size-1.5 shrink-0 rounded-full" style={{ background: typeColor(typeByPath.get(node.path)) }} />
        )}
        <span className="flex-1 truncate">{node.name}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              className="size-5 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
              aria-label="Note actions"
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={() => rename(node)}>
              <Pencil /> Rename
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => api.notes.reveal(node.path)}>
              <FolderOpen /> Reveal in Finder
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => remove(node)}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    )
  }

  return (
    <aside className="flex min-h-0 flex-col border-r border-sidebar-border bg-sidebar pt-8 text-sidebar-foreground">
      <div className="flex items-center justify-between gap-1 px-2 pb-1">
        <VaultSwitcher vault={vault} onSwitch={actions.setVault} notify={actions.notify} />
        <div className="flex shrink-0">
          <IconButton label="New note" onClick={newNote}>
            <FilePlus />
          </IconButton>
          <IconButton label="New folder" onClick={newFolder}>
            <FolderPlus />
          </IconButton>
        </div>
      </div>

      <nav className="flex flex-col gap-0.5 px-2 py-1">
        {NAV.map((n) => (
          <Button
            key={n.id}
            variant="ghost"
            className={cn(
              'h-8 justify-start gap-2 px-2 font-normal text-muted-foreground',
              view === n.id && 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
            )}
            onClick={() => (n.id === 'canvas' ? actions.openCanvas(null) : setView(n.id))}
          >
            <n.icon /> {n.label}
          </Button>
        ))}
      </nav>

      <div className="relative px-2 py-2">
        <Search className="pointer-events-none absolute top-1/2 left-4.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-8 pl-8 text-[13px]"
          placeholder="Search the vault…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
        />
      </div>

      <ScrollArea className="min-h-0 flex-1 px-2">
        <div className="pb-3" onClick={(e) => e.target === e.currentTarget && setSelectedDir('')}>
          {query.trim() ? (
            results.length ? (
              results.map((r) => (
                <button
                  key={r.path}
                  className="w-full rounded-md px-2 py-1.5 text-left hover:bg-sidebar-accent"
                  onClick={() => actions.openNote(r.path)}
                >
                  <div className="text-[13px] font-medium">{r.title}</div>
                  <div className="line-clamp-2 text-xs text-muted-foreground">{r.snippet}</div>
                </button>
              ))
            ) : (
              <div className="p-3 text-sm text-muted-foreground">No results</div>
            )
          ) : (
            vault.tree.map((n) => renderNode(n, 0))
          )}
        </div>
      </ScrollArea>

      <Separator />
      <div className="flex items-center justify-between px-3 py-1.5">
        <span className="text-xs text-muted-foreground">{vault.index.length} notes</span>
        <div className="flex">
          <ThemeToggle />
          <IconButton label="Settings (⌘,)" onClick={openSettings}>
            <Settings />
          </IconButton>
        </div>
      </div>
    </aside>
  )
}
