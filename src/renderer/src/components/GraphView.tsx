import { useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d'
import type { GraphData, GraphNode, VaultState } from '@shared/types'
import { NOTE_TYPES, typeColor } from '@shared/types'
import type { AppActions } from '../App'
import { api } from '../lib/util'
import GraphSettingsPanel, { loadGraphSettings, saveGraphSettings, type GraphSettings } from './GraphSettings'
import { Maximize, Search, SlidersHorizontal } from 'lucide-react'
import { useTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { Button } from './ui/button'
import { Input } from './ui/input'

interface Props {
  vault: VaultState
  current: string | null
  actions: AppActions
}

type FGNode = GraphNode & { x?: number; y?: number }
type FGLink = { source: string | FGNode; target: string | FGNode }

const FOLDER_PALETTE = [
  '#61afef', '#98c379', '#e5c07b', '#c678dd', '#e06c75', '#56b6c2',
  '#d19a66', '#ea76cb', '#a9b665', '#7fbbb3', '#f2cdcd', '#89b4fa'
]
// Colores del lienzo por tema (el canvas no puede leer las variables CSS directamente).
const CANVAS = {
  dark: { missing: '#6b6f78', label: '#d4d4d8', labelMissing: '#7a7d85', link: 'rgba(140,140,160,0.25)', arrow: 'rgba(160,160,180,0.6)', focus: 'rgba(115,133,255,0.95)', current: '#ffffff' },
  light: { missing: '#a1a1aa', label: '#27272a', labelMissing: '#a1a1aa', link: 'rgba(80,80,100,0.22)', arrow: 'rgba(80,80,100,0.5)', focus: 'rgba(0,34,255,0.85)', current: '#18181b' }
}

const idOf = (n: string | FGNode) => (typeof n === 'string' ? n : n.id)
const topFolder = (folder: string) => folder.split('/')[0]

export default function GraphView({ vault, current, actions }: Props) {
  const [data, setData] = useState<GraphData>({ nodes: [], links: [] })
  const [size, setSize] = useState({ w: 800, h: 600 })
  const [filter, setFilter] = useState('')
  const [hover, setHover] = useState<string | null>(null)
  const [settings, setSettings] = useState<GraphSettings>(loadGraphSettings)
  const [panelOpen, setPanelOpen] = useState(false)
  const { isDark } = useTheme()
  const c = isDark ? CANVAS.dark : CANVAS.light
  const box = useRef<HTMLDivElement>(null)
  const fg = useRef<ForceGraphMethods<FGNode, FGLink> | undefined>(undefined)

  const update = (patch: Partial<GraphSettings>) =>
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      saveGraphSettings(next)
      return next
    })

  useEffect(() => {
    api.notes.graph().then(setData)
  }, [vault])

  // force-graph escala el canvas con el devicePixelRatio de su creación. Si la ventana pasa
  // a otra pantalla (retina ↔ externa) hay que recrearlo o quedan restos sin borrar.
  const [dpr, setDpr] = useState(window.devicePixelRatio)
  useEffect(() => {
    const mq = window.matchMedia(`(resolution: ${dpr}dppx)`)
    const onChange = () => setDpr(window.devicePixelRatio)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [dpr])

  useEffect(() => {
    if (!box.current) return
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(box.current)
    return () => ro.disconnect()
  }, [])

  const folders = useMemo(
    () => [...new Set(data.nodes.filter((n) => n.exists).map((n) => topFolder(n.folder)))].sort(),
    [data]
  )

  const graph = useMemo(() => {
    const hidden = new Set(settings.hiddenFolders)
    let nodes = data.nodes.filter((n) =>
      n.exists ? !hidden.has(topFolder(n.folder)) : !settings.hideMissing
    )
    let ids = new Set(nodes.map((n) => n.id))
    let links = data.links.filter((l) => ids.has(l.source) && ids.has(l.target))
    if (settings.hideOrphans) {
      const linked = new Set(links.flatMap((l) => [l.source, l.target]))
      nodes = nodes.filter((n) => linked.has(n.id))
      ids = new Set(nodes.map((n) => n.id))
      links = links.filter((l) => ids.has(l.source) && ids.has(l.target))
    }
    return {
      nodes: nodes.map((n) => ({ ...n })) as FGNode[],
      links: links.map((l) => ({ ...l })) as FGLink[]
    }
  }, [data, settings.hiddenFolders, settings.hideMissing, settings.hideOrphans])

  // Fuerzas: se reaplican al cambiar los ajustes sin rehacer el encuadre.
  useEffect(() => {
    const g = fg.current
    if (!g) return
    g.d3Force('charge')?.strength(-settings.repel).distanceMax(Math.max(350, settings.repel * 2))
    ;(g.d3Force('link') as unknown as { distance?: (d: number) => void } | undefined)?.distance?.(settings.linkDistance)
    // Gravedad hacia el centro para que las notas sueltas no se alejen indefinidamente.
    let simNodes: { x?: number; y?: number; vx?: number; vy?: number }[] = []
    const k = settings.gravity
    const gravity = Object.assign(
      (alpha: number) => {
        for (const n of simNodes) {
          n.vx = (n.vx ?? 0) - (n.x ?? 0) * k * alpha
          n.vy = (n.vy ?? 0) - (n.y ?? 0) * k * alpha
        }
      },
      { initialize: (ns: typeof simNodes) => void (simNodes = ns) }
    )
    g.d3Force('gravity', gravity as never)
    g.d3ReheatSimulation()
  }, [graph, dpr, settings.repel, settings.linkDistance, settings.gravity])

  useEffect(() => {
    const t = setTimeout(fit, 1500)
    return () => clearTimeout(t)
  }, [graph, dpr]) // eslint-disable-line react-hooks/exhaustive-deps

  function fit() {
    const g = fg.current
    if (!g || !graph.nodes.length) return
    g.zoomToFit(400, 60)
    // Con pocas notas zoomToFit acerca demasiado.
    setTimeout(() => g.zoom() > 2.5 && g.zoom(2.5, 200), 450)
  }

  const neighbors = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const l of data.links) {
      if (!m.has(l.source)) m.set(l.source, new Set())
      if (!m.has(l.target)) m.set(l.target, new Set())
      m.get(l.source)!.add(l.target)
      m.get(l.target)!.add(l.source)
    }
    return m
  }, [data])

  // "auto": por tipo solo si la mayoría de las notas tienen tipo; si no (p. ej. un vault de Obsidian
  // existente con alguna nota tipada), por carpeta, para que el grafo no quede casi todo gris.
  const existing = data.nodes.filter((n) => n.exists)
  const typed = existing.filter((n) => n.type && (NOTE_TYPES as Record<string, unknown>)[n.type]).length
  const mode = settings.colorMode !== 'auto' ? settings.colorMode : existing.length && typed / existing.length >= 0.5 ? 'type' : 'folder'

  const groups = useMemo(() => {
    if (mode === 'type')
      return Object.entries(NOTE_TYPES).map(([id, t]) => ({
        key: `type:${id}`,
        label: t.label,
        color: settings.customColors[`type:${id}`] ?? t.color
      }))
    const all = [...new Set(data.nodes.filter((n) => n.exists).map((n) => n.folder))].sort()
    // El índice de paleta se calcula sobre todas las carpetas para que los colores no cambien al ocultar alguna.
    return all
      .map((f, i) => ({ f, i }))
      .filter(({ f }) => !settings.hiddenFolders.includes(topFolder(f)))
      .map(({ f, i }) => ({
      key: `folder:${f}`,
      label: f || '(root)',
      color: settings.customColors[`folder:${f}`] ?? FOLDER_PALETTE[i % FOLDER_PALETTE.length]
    }))
  }, [mode, data, settings.customColors, settings.hiddenFolders])

  const groupColor = useMemo(() => new Map(groups.map((g) => [g.key, g.color])), [groups])
  const colorOf = (n: GraphNode) =>
    groupColor.get(mode === 'type' ? `type:${n.type}` : `folder:${n.folder}`) ?? typeColor(undefined)

  const radius = (n: GraphNode) => (settings.sizeByLinks ? Math.sqrt(1 + n.degree) * 4 : 5) * settings.nodeSize

  // Grado mínimo para estar entre las N notas más conectadas (siempre rotuladas).
  const hubDegree = useMemo(() => {
    if (settings.hubLabels <= 0) return Infinity
    const d = graph.nodes.map((n) => n.degree).sort((a, b) => b - a)
    return Math.max(1, d[Math.min(settings.hubLabels, d.length) - 1] ?? Infinity)
  }, [graph, settings.hubLabels])

  const q = filter.trim().toLowerCase()
  const focus = settings.highlightNeighbors ? hover : null
  const isDim = (id: string, title: string) => {
    if (q) return !title.toLowerCase().includes(q)
    if (focus) return id !== focus && !neighbors.get(focus)?.has(id)
    return false
  }
  const touchesFocus = (l: FGLink) => !!focus && (idOf(l.source) === focus || idOf(l.target) === focus)

  return (
    <div className="flex h-full flex-col pt-8">
      <div className="flex flex-wrap items-center gap-2 px-4 py-1.5">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 w-52 pl-8"
            placeholder="Filter nodes…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <Button variant="outline" size="sm" onClick={fit}>
          <Maximize /> Fit
        </Button>
        <Button
          variant={panelOpen ? 'secondary' : 'outline'}
          size="sm"
          className={cn(panelOpen && 'border-primary/50')}
          onClick={() => setPanelOpen(!panelOpen)}
        >
          <SlidersHorizontal /> Display
        </Button>
        <span className="text-xs whitespace-nowrap text-muted-foreground">
          {graph.nodes.length} nodes · {graph.links.length} links
        </span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 px-4 pb-2 text-xs text-muted-foreground">
        {groups.map((g) => (
          <label
            key={g.key}
            title="Click to change the color"
            className="relative inline-flex cursor-pointer items-center gap-1.5 hover:text-foreground"
          >
            <i className="inline-block size-2 rounded-full" style={{ background: g.color }} />
            <input
              type="color"
              className="legend-color"
              value={g.color}
              onChange={(e) => update({ customColors: { ...settings.customColors, [g.key]: e.target.value } })}
            />
            {g.label}
          </label>
        ))}
      </div>
      <div className="relative min-h-0 flex-1" ref={box}>
        {panelOpen && (
          <GraphSettingsPanel
            settings={settings}
            onChange={update}
            folders={folders}
            onClose={() => setPanelOpen(false)}
          />
        )}
        <ForceGraph2D<FGNode, FGLink>
          key={dpr}
          ref={fg}
          onRenderFramePre={(ctx) => {
            // Borra todo el búfer del canvas, no solo el área que calcula force-graph.
            ctx.save()
            ctx.setTransform(1, 0, 0, 1, 0, 0)
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
            ctx.restore()
          }}
          width={size.w}
          height={size.h}
          graphData={graph}
          backgroundColor="rgba(0,0,0,0)"
          cooldownTime={4000}
          onEngineStop={fit}
          // nodeRelSize/nodeVal reproducen radius() para que las flechas lleguen al borde del nodo.
          nodeRelSize={4 * settings.nodeSize}
          nodeVal={(n) => (settings.sizeByLinks ? 1 + n.degree : 25 / 16)}
          linkColor={(l) => (touchesFocus(l) ? c.focus : c.link)}
          linkWidth={(l) => (touchesFocus(l) ? 1.6 : 0.6) * settings.linkWidth}
          linkDirectionalArrowLength={settings.arrows ? 3.5 * Math.max(1, settings.linkWidth) : 0}
          linkDirectionalArrowRelPos={1}
          linkDirectionalArrowColor={(l) => (touchesFocus(l) ? c.focus : c.arrow)}
          onNodeHover={(n) => setHover(n?.id ?? null)}
          onNodeClick={(n) => (n.exists ? actions.openNote(n.id) : actions.openLink(n.title))}
          nodeCanvasObject={(n, ctx, scale) => {
            const r = radius(n)
            const dim = isDim(n.id, n.title)
            ctx.globalAlpha = dim ? 0.15 : 1
            ctx.beginPath()
            ctx.arc(n.x!, n.y!, r, 0, 2 * Math.PI)
            if (n.exists) {
              ctx.fillStyle = colorOf(n)
              ctx.fill()
            } else {
              ctx.strokeStyle = c.missing
              ctx.lineWidth = 1 / scale + 0.5
              ctx.stroke()
            }
            if (n.id === current) {
              ctx.strokeStyle = c.current
              ctx.lineWidth = 2 / scale
              ctx.stroke()
            }
            if (scale >= settings.labelZoom || n.degree >= hubDegree || (focus && !dim) || (q && !dim)) {
              const fs = Math.max(settings.labelSize / scale, settings.labelSize / 4)
              ctx.font = `${fs}px -apple-system, sans-serif`
              ctx.textAlign = 'center'
              ctx.textBaseline = 'top'
              ctx.fillStyle = n.exists ? c.label : c.labelMissing
              ctx.fillText(n.title, n.x!, n.y! + r + 2)
            }
            ctx.globalAlpha = 1
          }}
          nodePointerAreaPaint={(n, color, ctx) => {
            ctx.fillStyle = color
            ctx.beginPath()
            ctx.arc(n.x!, n.y!, radius(n) + 2, 0, 2 * Math.PI)
            ctx.fill()
          }}
        />
      </div>
    </div>
  )
}
