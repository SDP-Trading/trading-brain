import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  ConnectionMode,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  NodeResizer,
  Position,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { FileText, Layers, Link2, Plus, StickyNote, Trash2 } from 'lucide-react'
import type { VaultState } from '@shared/types'
import {
  CANVAS_PRESETS,
  canvasColor,
  newCanvasId,
  parseCanvas,
  serializeCanvas,
  type CanvasData,
  type CanvasEdge,
  type CanvasNode,
  type CanvasSide
} from '@shared/canvas'
import { basenameNoExt } from '@shared/markdown'
import type { AppActions } from '../../App'
import { api, errMsg } from '../../lib/util'
import { useTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { Button } from '../ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import Preview from '../Preview'

interface Props {
  path: string | null
  vault: VaultState
  names: Map<string, string>
  actions: AppActions
  openCanvas(path: string): void
}

type CardData = {
  node: CanvasNode
  names: Map<string, string>
  actions: AppActions
  onText(id: string, text: string): void
}
type Card = Node<CardData>

const SIDES: CanvasSide[] = ['top', 'right', 'bottom', 'left']
const POS: Record<CanvasSide, Position> = { top: Position.Top, right: Position.Right, bottom: Position.Bottom, left: Position.Left }

function Handles() {
  return (
    <>
      {SIDES.map((s) => (
        <Handle key={s} id={s} type="source" position={POS[s]} className="!size-2.5 !border-background !bg-muted-foreground opacity-0 group-hover:opacity-100" />
      ))}
    </>
  )
}

function cardStyle(color?: string) {
  const c = canvasColor(color)
  return c ? { borderColor: c, background: `color-mix(in oklab, ${c} 12%, var(--card))` } : undefined
}

// ---------- Tarjetas ----------

const TextCard = memo(function TextCard({ id, data, selected }: NodeProps<Card>) {
  const node = data.node as Extract<CanvasNode, { type: 'text' }>
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(node.text)
  useEffect(() => setDraft(node.text), [node.text])
  return (
    <div
      className="group h-full w-full overflow-hidden rounded-lg border-2 bg-card text-card-foreground shadow-sm"
      style={cardStyle(node.color)}
      onDoubleClick={(e) => {
        e.stopPropagation()
        setEditing(true)
      }}
    >
      <NodeResizer isVisible={selected} minWidth={120} minHeight={50} lineClassName="!border-primary" handleClassName="!bg-primary" />
      <Handles />
      {editing ? (
        <textarea
          autoFocus
          className="nodrag nowheel h-full w-full resize-none bg-transparent p-3 font-mono text-xs outline-none"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            setEditing(false)
            if (draft !== node.text) data.onText(id, draft)
          }}
          onKeyDown={(e) => e.key === 'Escape' && (e.currentTarget as HTMLTextAreaElement).blur()}
        />
      ) : (
        <div className="nowheel h-full overflow-auto px-3 py-2 text-[13px] [&_.markdown]:leading-snug [&_h1]:mt-0 [&_h2]:mt-0 [&_h3]:mt-0">
          <Preview content={node.text} names={data.names} onLink={data.actions.openLink} showProperties={false} />
        </div>
      )}
    </div>
  )
})

const FileCard = memo(function FileCard({ data, selected }: NodeProps<Card>) {
  const node = data.node as Extract<CanvasNode, { type: 'file' }>
  const [content, setContent] = useState<string | null>(null)
  const isNote = node.file.toLowerCase().endsWith('.md')
  useEffect(() => {
    if (isNote) api.notes.read(node.file).then(setContent, () => setContent(null))
  }, [node.file, isNote])
  return (
    <div className="group flex h-full w-full flex-col overflow-hidden rounded-lg border-2 bg-card shadow-sm" style={cardStyle(node.color)}>
      <NodeResizer isVisible={selected} minWidth={160} minHeight={60} lineClassName="!border-primary" handleClassName="!bg-primary" />
      <Handles />
      <button
        className="nodrag flex items-center gap-1.5 border-b px-3 py-1.5 text-left text-xs font-medium text-link hover:underline"
        onClick={() => (isNote ? data.actions.openLink(basenameNoExt(node.file)) : undefined)}
      >
        <FileText className="size-3.5 shrink-0" />
        <span className="truncate">{basenameNoExt(node.file.split('/').pop() ?? node.file)}</span>
      </button>
      <div className="nowheel min-h-0 flex-1 overflow-auto px-3 py-2 text-[12px]">
        {isNote ? (
          content != null ? (
            <Preview content={content} names={data.names} onLink={data.actions.openLink} showProperties={false} />
          ) : (
            <span className="text-muted-foreground">Note not found</span>
          )
        ) : (
          <span className="text-muted-foreground">{node.file}</span>
        )}
      </div>
    </div>
  )
})

const LinkCard = memo(function LinkCard({ data, selected }: NodeProps<Card>) {
  const node = data.node as Extract<CanvasNode, { type: 'link' }>
  return (
    <div className="group flex h-full w-full items-center gap-2 overflow-hidden rounded-lg border-2 bg-card px-3 shadow-sm" style={cardStyle(node.color)}>
      <NodeResizer isVisible={selected} minWidth={140} minHeight={40} lineClassName="!border-primary" handleClassName="!bg-primary" />
      <Handles />
      <Link2 className="size-4 shrink-0 text-muted-foreground" />
      <a className="nodrag truncate text-sm text-link hover:underline" href={node.url} target="_blank" rel="noreferrer">
        {node.url}
      </a>
    </div>
  )
})

const GroupCard = memo(function GroupCard({ data, selected }: NodeProps<Card>) {
  const node = data.node as Extract<CanvasNode, { type: 'group' }>
  const c = canvasColor(node.color)
  return (
    <div
      className="h-full w-full rounded-xl border-2 border-dashed"
      style={{ borderColor: c ?? 'var(--border)', background: c ? `color-mix(in oklab, ${c} 6%, transparent)` : 'color-mix(in oklab, var(--muted) 40%, transparent)' }}
    >
      <NodeResizer isVisible={selected} minWidth={200} minHeight={120} lineClassName="!border-primary" handleClassName="!bg-primary" />
      {node.label && (
        <div className="absolute -top-7 left-1 rounded-md bg-muted px-2 py-0.5 text-sm font-medium" style={c ? { color: c } : undefined}>
          {node.label}
        </div>
      )}
    </div>
  )
})

const nodeTypes = { text: TextCard, file: FileCard, link: LinkCard, group: GroupCard }

// ---------- Conversión canvas <-> React Flow ----------

function toFlow(data: CanvasData, extra: Omit<CardData, 'node'>): { nodes: Card[]; edges: Edge[] } {
  // Los grupos primero, para que queden detrás.
  const sorted = [...data.nodes].sort((a, b) => (a.type === 'group' ? -1 : 0) - (b.type === 'group' ? -1 : 0))
  return {
    nodes: sorted.map((n) => ({
      id: n.id,
      type: n.type,
      position: { x: n.x, y: n.y },
      width: n.width,
      height: n.height,
      zIndex: n.type === 'group' ? -1 : 0,
      data: { ...extra, node: n }
    })),
    edges: data.edges.map((e) => toFlowEdge(e))
  }
}

function toFlowEdge(e: CanvasEdge): Edge {
  const color = canvasColor(e.color) ?? 'var(--muted-foreground)'
  return {
    id: e.id,
    source: e.fromNode,
    target: e.toNode,
    sourceHandle: e.fromSide ?? null,
    targetHandle: e.toSide ?? null,
    label: e.label,
    labelBgStyle: { fill: 'var(--background)' },
    labelStyle: { fill: 'var(--foreground)', fontSize: 12 },
    style: { stroke: color, strokeWidth: 2 },
    markerEnd: e.toEnd === 'none' ? undefined : { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
    markerStart: e.fromEnd === 'arrow' ? { type: MarkerType.ArrowClosed, color, width: 16, height: 16 } : undefined,
    data: { edge: e }
  }
}

function toCanvas(base: CanvasData, nodes: Card[], edges: Edge[]): CanvasData {
  return {
    ...base,
    nodes: nodes.map((n) => ({
      ...n.data.node,
      x: Math.round(n.position.x),
      y: Math.round(n.position.y),
      width: Math.round(n.width ?? n.measured?.width ?? n.data.node.width),
      height: Math.round(n.height ?? n.measured?.height ?? n.data.node.height)
    })),
    edges: edges.map((e) => ({
      ...((e.data?.edge as CanvasEdge | undefined) ?? {}),
      id: e.id,
      fromNode: e.source,
      toNode: e.target,
      ...(e.sourceHandle ? { fromSide: e.sourceHandle as CanvasSide } : {}),
      ...(e.targetHandle ? { toSide: e.targetHandle as CanvasSide } : {})
    }))
  }
}

// ---------- Vista ----------

export default function CanvasView(props: Props) {
  if (!props.path) return <CanvasPicker {...props} />
  return (
    <ReactFlowProvider key={props.path}>
      <CanvasEditor {...props} path={props.path} />
    </ReactFlowProvider>
  )
}

function CanvasEditor({ path, names, actions }: Props & { path: string }) {
  const { isDark } = useTheme()
  const rf = useReactFlow()
  const [base, setBase] = useState<CanvasData | null>(null)
  const [nodes, setNodes] = useState<Card[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [saving, setSaving] = useState<'saved' | 'dirty'>('saved')
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef({ nodes, edges, base })
  latest.current = { nodes, edges, base }

  const onText = useCallback((id: string, text: string) => {
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, node: { ...n.data.node, text } as CanvasNode } } : n)))
    scheduleSave()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const extra = useMemo(() => ({ names, actions, onText }), [names, actions, onText])

  useEffect(() => {
    api.canvas
      .read(path)
      .then((text) => {
        const data = parseCanvas(text)
        const flow = toFlow(data, extra)
        setBase(data)
        setNodes(flow.nodes)
        setEdges(flow.edges)
      })
      .catch((e) => setError(errMsg(e)))
  }, [path]) // eslint-disable-line react-hooks/exhaustive-deps

  // Al cambiar names/actions (p. ej. nuevas notas) se actualizan las tarjetas sin recargar.
  useEffect(() => setNodes((ns) => ns.map((n) => ({ ...n, data: { ...n.data, ...extra } }))), [extra])

  const flush = useCallback(async () => {
    timer.current = null
    const { nodes, edges, base } = latest.current
    if (!base) return
    try {
      await api.canvas.write(path, serializeCanvas(toCanvas(base, nodes, edges)))
      setSaving('saved')
    } catch (e) {
      actions.notify(`Could not save the canvas: ${errMsg(e)}`)
    }
  }, [path, actions])

  function scheduleSave() {
    setSaving('dirty')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, 600)
  }
  useEffect(() => () => void (timer.current && (clearTimeout(timer.current), flush())), [flush])

  const onNodesChange = (changes: NodeChange<Card>[]) => {
    setNodes((ns) => applyNodeChanges(changes, ns))
    if (changes.some((c) => c.type !== 'select' && c.type !== 'dimensions' || (c.type === 'dimensions' && c.resizing)))
      scheduleSave()
  }
  const onEdgesChange = (changes: EdgeChange[]) => {
    setEdges((es) => applyEdgeChanges(changes, es))
    if (changes.some((c) => c.type !== 'select')) scheduleSave()
  }
  const onConnect = (c: Connection) => {
    const edge: CanvasEdge = {
      id: newCanvasId(),
      fromNode: c.source,
      toNode: c.target,
      ...(c.sourceHandle ? { fromSide: c.sourceHandle as CanvasSide } : {}),
      ...(c.targetHandle ? { toSide: c.targetHandle as CanvasSide } : {})
    }
    setEdges((es) => addEdge(toFlowEdge(edge), es))
    scheduleSave()
  }

  const addNode = (node: { type: CanvasNode['type']; width: number; height: number; x?: number; y?: number; [k: string]: unknown }) => {
    const center = rf.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
    const full = { id: newCanvasId(), x: Math.round(center.x - node.width / 2), y: Math.round(center.y - node.height / 2), ...node } as CanvasNode
    setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), ...toFlow({ nodes: [full], edges: [] }, extra).nodes.map((n) => ({ ...n, selected: true }))])
    scheduleSave()
  }

  const addNote = async () => {
    const title = await actions.ask('Add a note card (title of an existing note)')
    if (!title) return
    const target = await api.notes.resolve(title)
    if (!target) return actions.notify(`No note named "${title}"`)
    addNode({ type: 'file', file: target, width: 360, height: 260 })
  }

  const selected = nodes.filter((n) => n.selected)
  const setColor = (color?: string) => {
    const ids = new Set(selected.map((n) => n.id))
    setNodes((ns) =>
      ns.map((n) => (ids.has(n.id) ? { ...n, data: { ...n.data, node: { ...n.data.node, color } as CanvasNode } } : n))
    )
    scheduleSave()
  }
  const removeSelected = () => {
    const ids = new Set(selected.map((n) => n.id))
    setNodes((ns) => ns.filter((n) => !ids.has(n.id)))
    setEdges((es) => es.filter((e) => !e.selected && !ids.has(e.source) && !ids.has(e.target)))
    scheduleSave()
  }

  if (error) return <div className="p-6 text-destructive">{error}</div>

  return (
    <div className="flex h-full flex-col pt-8">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 pb-2">
        <span className="mr-2 truncate text-sm font-semibold">{basenameNoExt(path.split('/').pop()!.replace(/\.canvas$/i, ''))}</span>
        <ToolButton label="Add text card (or double-click the canvas)" onClick={() => addNode({ type: 'text', text: '', width: 260, height: 120 })}>
          <StickyNote /> Card
        </ToolButton>
        <ToolButton label="Add a card showing a note" onClick={addNote}>
          <FileText /> Note
        </ToolButton>
        <ToolButton label="Add a group" onClick={() => addNode({ type: 'group', label: 'Group', width: 600, height: 400 })}>
          <Layers /> Group
        </ToolButton>
        {selected.length > 0 && (
          <div className="flex items-center gap-1 border-l pl-2">
            {Object.entries(CANVAS_PRESETS).map(([k, c]) => (
              <button key={k} className="size-5 rounded-full border" style={{ background: c }} onClick={() => setColor(k)} title={`Color ${k}`} />
            ))}
            <button className="size-5 rounded-full border bg-card" onClick={() => setColor(undefined)} title="No color" />
            <Button variant="ghost" size="icon" className="size-7" onClick={removeSelected} title="Delete selected">
              <Trash2 />
            </Button>
          </div>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {nodes.length} cards · {edges.length} arrows · {saving === 'saved' ? 'Saved' : 'Saving…'}
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <ReactFlow<Card>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          connectionMode={ConnectionMode.Loose}
          colorMode={isDark ? 'dark' : 'light'}
          fitView
          minZoom={0.05}
          maxZoom={2.5}
          deleteKeyCode={['Backspace', 'Delete']}
          onDoubleClick={(e) => {
            if (!(e.target as HTMLElement).classList.contains('react-flow__pane')) return
            const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })
            addNode({ type: 'text', text: '', width: 260, height: 120, x: Math.round(p.x - 130), y: Math.round(p.y - 60) })
          }}
          zoomOnDoubleClick={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={24} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable className="!bg-card" nodeColor={(n) => canvasColor((n.data as CardData).node.color) ?? 'var(--muted-foreground)'} />
        </ReactFlow>
      </div>
    </div>
  )
}

function ToolButton({ label, onClick, children }: { label: string; onClick(): void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline" size="sm" onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** Sin archivo seleccionado: lista de lienzos del vault y botón para crear uno. */
function CanvasPicker({ vault, actions, openCanvas }: Props) {
  const canvases: { path: string; name: string }[] = []
  const walk = (nodes: VaultState['tree']) => {
    for (const n of nodes) {
      if (n.type === 'dir') walk(n.children ?? [])
      else if (n.kind === 'canvas') canvases.push({ path: n.path, name: n.name })
    }
  }
  walk(vault.tree)

  const create = async () => {
    const title = await actions.ask('New canvas', 'Untitled canvas')
    if (!title) return
    try {
      const res = await api.canvas.create('', title)
      actions.setVault(res.state)
      openCanvas(res.path)
    } catch (e) {
      actions.notify(errMsg(e))
    }
  }

  return (
    <div className="mx-auto h-full max-w-3xl overflow-y-auto px-12 pt-12 pb-20">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Canvas</h2>
          <p className="mt-1 text-muted-foreground">Infinite boards with cards, notes and arrows — the same .canvas files Obsidian uses.</p>
        </div>
        <Button onClick={create}>
          <Plus /> New canvas
        </Button>
      </div>
      {canvases.length ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {canvases.map((c) => (
            <button
              key={c.path}
              onClick={() => openCanvas(c.path)}
              className={cn('flex items-center gap-3 rounded-lg border p-3 text-left hover:border-primary hover:bg-primary/5')}
            >
              <Layers className="size-5 shrink-0 text-primary" />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{c.name}</div>
                <div className="truncate text-xs text-muted-foreground">{c.path}</div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No canvases yet in this vault.</p>
      )}
    </div>
  )
}
