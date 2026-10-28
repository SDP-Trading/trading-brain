import { memo, useMemo, useState } from 'react'
import { Background, Controls, Handle, Position, ReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { hierarchy, tree } from 'd3-hierarchy'
import { Waypoints } from 'lucide-react'
import type { NoteIndexEntry, VaultState } from '@shared/types'
import { SOURCES_FOLDER, typeColor } from '@shared/types'
import { isAttachment, normalizeKey } from '@shared/markdown'
import type { AppActions } from '../../App'
import { useTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group'

interface TreeItem {
  id: string
  label: string
  path?: string
  type?: string
  folder?: boolean
  children: TreeItem[]
}

// Las aristas salen del centro de cada píldora, como en un mapa radial.
const CENTER = { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }

type MapNode = Node<{ item: TreeItem; depth: number; onOpen(i: TreeItem): void; onRoot(i: TreeItem): void }>

const Pill = memo(function Pill({ data }: NodeProps<MapNode>) {
  const { item, depth } = data
  const color = item.folder ? 'var(--muted-foreground)' : typeColor(item.type)
  return (
    <div
      className={cn(
        'cursor-pointer rounded-full border bg-card px-3 py-1 whitespace-nowrap shadow-sm hover:border-primary',
        depth === 0 && 'px-4 py-2 text-base font-semibold',
        depth === 1 && 'text-sm font-medium',
        depth >= 2 && 'text-xs'
      )}
      style={{ borderColor: depth === 0 ? 'var(--primary)' : undefined }}
      onClick={() => data.onOpen(item)}
      onDoubleClick={() => data.onRoot(item)}
      title={item.path ? `${item.path}\nClick to open · double-click to center the map here` : item.label}
    >
      <Handle type="target" position={Position.Left} style={CENTER} className="!opacity-0" />
      <span className="mr-1.5 inline-block size-2 rounded-full align-middle" style={{ background: color }} />
      {item.label}
      <Handle type="source" position={Position.Right} style={CENTER} className="!opacity-0" />
    </div>
  )
})

const nodeTypes = { pill: Pill }

/** Árbol por enlaces: BFS desde la raíz, cada nota aparece una sola vez (en su distancia mínima). */
function linkTree(rootPath: string, index: NoteIndexEntry[], names: Map<string, string>, maxDepth: number): TreeItem {
  const byPath = new Map(index.map((e) => [e.path, e]))
  const seen = new Set([rootPath])
  const make = (e: NoteIndexEntry): TreeItem => ({ id: e.path, label: e.title, path: e.path, type: e.type, children: [] })
  const root = make(byPath.get(rootPath)!)
  let level = [root]
  for (let d = 0; d < maxDepth && level.length; d++) {
    const next: TreeItem[] = []
    for (const item of level) {
      for (const l of byPath.get(item.path!)?.links ?? []) {
        const p = names.get(normalizeKey(l))
        if (!p || seen.has(p) || p.startsWith(SOURCES_FOLDER + '/') || isAttachment(l) || isAttachment(byPath.get(p)!.title)) continue
        seen.add(p)
        const child = make(byPath.get(p)!)
        item.children.push(child)
        next.push(child)
      }
    }
    level = next
  }
  return root
}

/** Árbol por carpetas: el vault como raíz, carpetas y notas como ramas. */
function folderTree(vault: VaultState): TreeItem {
  const typeOf = new Map(vault.index.map((e) => [e.path, e.type]))
  const conv = (nodes: VaultState['tree']): TreeItem[] =>
    nodes
      .filter((n) => n.path !== SOURCES_FOLDER && (n.type === 'dir' || (n.kind === 'note' && !isAttachment(n.name))))
      .map((n) =>
        n.type === 'dir'
          ? { id: n.path, label: n.name, folder: true, children: conv(n.children ?? []) }
          : { id: n.path, label: n.name, path: n.path, type: typeOf.get(n.path), children: [] }
      )
      .filter((i) => !i.folder || i.children.length)
  return { id: '__root__', label: vault.path?.split('/').pop() ?? 'Vault', folder: true, children: conv(vault.tree) }
}

/** Nota raíz por defecto: tipo model, o la que se llama como una carpeta, o la más enlazada. */
function defaultRoot(index: NoteIndexEntry[]): string | null {
  const notes = index.filter((e) => !e.path.startsWith(SOURCES_FOLDER + '/'))
  const model = notes.find((e) => e.type === 'model' && e.links.length)
  if (model) return model.path
  const folders = new Set(notes.flatMap((e) => e.path.split('/').slice(0, -1)).map(normalizeKey))
  const hub = notes.find((e) => folders.has(normalizeKey(e.title)))
  if (hub) return hub.path
  return [...notes].sort((a, b) => b.links.length - a.links.length)[0]?.path ?? null
}

export default function MindMapView({ vault, names, actions }: { vault: VaultState; names: Map<string, string>; actions: AppActions }) {
  const { isDark } = useTheme()
  const [mode, setMode] = useState<'links' | 'folders'>('links')
  const [rootPath, setRootPath] = useState<string | null>(() => defaultRoot(vault.index))
  const [depth, setDepth] = useState(2)

  const root = useMemo(() => {
    if (mode === 'folders') return folderTree(vault)
    const path = rootPath && vault.index.some((e) => e.path === rootPath) ? rootPath : defaultRoot(vault.index)
    return path ? linkTree(path, vault.index, names, depth) : null
  }, [mode, rootPath, depth, vault, names])

  const { nodes, edges } = useMemo(() => {
    if (!root) return { nodes: [] as MapNode[], edges: [] as Edge[] }
    const h = hierarchy(root)
    const leaves = h.leaves().length
    const radius = Math.max(260, leaves * 26) // más hojas → más radio para que no se solapen
    tree<TreeItem>()
      .size([2 * Math.PI, radius])
      .separation((a, b) => (a.parent === b.parent ? 1 : 2) / Math.max(1, a.depth))(h)
    const onOpen = (i: TreeItem) => i.path && actions.openNote(i.path)
    const onRoot = (i: TreeItem) => {
      if (!i.path) return
      setMode('links')
      setRootPath(i.path)
    }
    const nodes: MapNode[] = h.descendants().map((d) => {
      const angle = (d.x ?? 0) - Math.PI / 2
      const r = d.y ?? 0
      return {
        id: d.data.id,
        type: 'pill',
        position: { x: Math.cos(angle) * r, y: Math.sin(angle) * r },
        origin: [0.5, 0.5],
        data: { item: d.data, depth: d.depth, onOpen, onRoot },
        draggable: true
      }
    })
    const edges: Edge[] = h.links().map((l) => ({
      id: `${l.source.data.id}->${l.target.data.id}`,
      source: l.source.data.id,
      target: l.target.data.id,
      type: 'straight',
      style: { stroke: l.target.data.folder ? 'var(--muted-foreground)' : typeColor(l.target.data.type), strokeOpacity: 0.55, strokeWidth: Math.max(1, 3 - l.source.depth) }
    }))
    return { nodes, edges }
  }, [root, actions])

  const candidates = vault.index.filter((e) => !e.path.startsWith(SOURCES_FOLDER + '/') && e.links.length > 0).sort((a, b) => a.title.localeCompare(b.title))

  return (
    <div className="flex h-full flex-col pt-8">
      <div className="flex flex-wrap items-center gap-3 border-b px-4 pb-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          <Waypoints className="size-4 text-primary" /> Mind map
        </span>
        <ToggleGroup type="single" variant="outline" size="sm" value={mode} onValueChange={(v) => v && setMode(v as typeof mode)}>
          <ToggleGroupItem value="links">By links</ToggleGroupItem>
          <ToggleGroupItem value="folders">By folders</ToggleGroupItem>
        </ToggleGroup>
        {mode === 'links' && (
          <>
            <Select value={rootPath ?? ''} onValueChange={setRootPath}>
              <SelectTrigger size="sm" className="w-64">
                <SelectValue placeholder="Root note" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((e) => (
                  <SelectItem key={e.path} value={e.path}>
                    {e.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ToggleGroup type="single" variant="outline" size="sm" value={String(depth)} onValueChange={(v) => v && setDepth(Number(v))}>
              {[1, 2, 3, 4].map((d) => (
                <ToggleGroupItem key={d} value={String(d)} title={`${d} level${d > 1 ? 's' : ''} of links`}>
                  {d}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {nodes.length} nodes · click to open · double-click to center
        </span>
      </div>
      <div className="min-h-0 flex-1">
        {root ? (
          <ReactFlow
            key={`${mode}:${root.id}:${depth}`}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            colorMode={isDark ? 'dark' : 'light'}
            fitView
            minZoom={0.05}
            nodesConnectable={false}
            zoomOnDoubleClick={false}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={32} />
            <Controls showInteractive={false} />
          </ReactFlow>
        ) : (
          <p className="p-6 text-muted-foreground">No linked notes yet.</p>
        )}
      </div>
    </div>
  )
}
