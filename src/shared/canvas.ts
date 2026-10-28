// Formato JSON Canvas (el de los .canvas de Obsidian): https://jsoncanvas.org
import dagre from '@dagrejs/dagre'

export type CanvasColor = string // "1"-"6" (paleta de Obsidian) o "#RRGGBB"
export type CanvasSide = 'top' | 'right' | 'bottom' | 'left'

export interface CanvasNodeBase {
  id: string
  x: number
  y: number
  width: number
  height: number
  color?: CanvasColor
  [extra: string]: unknown
}
export interface CanvasTextNode extends CanvasNodeBase {
  type: 'text'
  text: string
}
export interface CanvasFileNode extends CanvasNodeBase {
  type: 'file'
  file: string
  subpath?: string
}
export interface CanvasLinkNode extends CanvasNodeBase {
  type: 'link'
  url: string
}
export interface CanvasGroupNode extends CanvasNodeBase {
  type: 'group'
  label?: string
}
export type CanvasNode = CanvasTextNode | CanvasFileNode | CanvasLinkNode | CanvasGroupNode

export interface CanvasEdge {
  id: string
  fromNode: string
  toNode: string
  fromSide?: CanvasSide
  toSide?: CanvasSide
  fromEnd?: 'none' | 'arrow'
  toEnd?: 'none' | 'arrow'
  color?: CanvasColor
  label?: string
  [extra: string]: unknown
}

export interface CanvasData {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  [extra: string]: unknown
}

/** Paleta de Obsidian para los colores "1"-"6". */
export const CANVAS_PRESETS: Record<string, string> = {
  '1': '#e93147', // rojo
  '2': '#ec7500', // naranja
  '3': '#e0ac00', // amarillo
  '4': '#08b94e', // verde
  '5': '#00bfbc', // cian
  '6': '#7852ee' // morado
}

export function canvasColor(c?: CanvasColor): string | undefined {
  if (!c) return undefined
  return CANVAS_PRESETS[c] ?? c
}

export const newCanvasId = () =>
  Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('')

export function parseCanvas(text: string): CanvasData {
  const data = text.trim() ? (JSON.parse(text) as Partial<CanvasData>) : {}
  return { ...data, nodes: data.nodes ?? [], edges: data.edges ?? [] } as CanvasData
}

export const serializeCanvas = (c: CanvasData) => JSON.stringify(c, null, '\t')

// ---------- Diagrama de flujo -> canvas ----------

/** Instrucciones comunes para la IA de la app y para la herramienta MCP. */
export const FLOW_INSTRUCTIONS = `Build the decision flowchart a trader follows when executing this trading model, from the first check to managing the trade.
- Order it the way the model is executed: higher-timeframe context and bias first, then the setup conditions, the entry trigger, stop placement, targets and trade management. Include the no-trade / invalidation exits.
- Use kind "decision" for yes/no checks (label them as a short question), "step" for things to observe or do, "action" for executing (enter, place stop, take profit), "start" for the single starting node and "end" for outcomes (no trade, trade taken, exit).
- Label decision edges "Yes" / "No" (in the language of the notes). Keep labels short (max ~8 words).
- Set "note" to the EXACT title of the note that explains that box, or null.
- Only use what the notes say. Aim for 8-25 nodes.`


export type FlowKind = 'start' | 'decision' | 'step' | 'action' | 'end'

export interface FlowSpec {
  title: string
  nodes: { id: string; label: string; kind: FlowKind; note?: string | null }[]
  edges: { from: string; to: string; label?: string | null }[]
}

const KIND_COLOR: Record<FlowKind, CanvasColor> = {
  start: '4',
  decision: '3',
  step: '5',
  action: '6',
  end: '1'
}

/** Dispone el diagrama de arriba abajo con dagre y lo convierte en un canvas. */
export function flowToCanvas(flow: FlowSpec): CanvasData {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 90, marginx: 20, marginy: 20 })
  g.setDefaultEdgeLabel(() => ({}))

  const ids = new Set(flow.nodes.map((n) => n.id))
  const size = (n: FlowSpec['nodes'][number]) => {
    const width = Math.min(340, Math.max(220, n.label.length * 7 + 60))
    const lines = Math.ceil((n.label.length * 7.5) / (width - 40)) + (n.note ? 1 : 0)
    return { width, height: Math.max(70, 34 + lines * 24) }
  }
  for (const n of flow.nodes) g.setNode(n.id, size(n))
  for (const e of flow.edges) if (ids.has(e.from) && ids.has(e.to)) g.setEdge(e.from, e.to)
  dagre.layout(g)

  const canvasId = new Map(flow.nodes.map((n) => [n.id, newCanvasId()]))
  const nodes: CanvasNode[] = flow.nodes.map((n) => {
    const p = g.node(n.id)
    const title = n.kind === 'decision' ? `**${n.label.replace(/\?*$/, '')}?**` : `**${n.label}**`
    return {
      id: canvasId.get(n.id)!,
      type: 'text',
      text: n.note ? `${title}\n\n[[${n.note}]]` : title,
      x: Math.round(p.x - p.width / 2),
      y: Math.round(p.y - p.height / 2),
      width: p.width,
      height: p.height,
      color: KIND_COLOR[n.kind] ?? '5'
    }
  })
  const edges: CanvasEdge[] = flow.edges
    .filter((e) => ids.has(e.from) && ids.has(e.to))
    .map((e) => ({
      id: newCanvasId(),
      fromNode: canvasId.get(e.from)!,
      fromSide: 'bottom',
      toNode: canvasId.get(e.to)!,
      toSide: 'top',
      ...(e.label ? { label: e.label } : {})
    }))
  return { nodes, edges }
}
