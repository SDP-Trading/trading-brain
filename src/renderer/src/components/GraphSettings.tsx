import { useId, useState, type ReactNode } from 'react'
import { ChevronRight, RotateCcw, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible'
import { Label } from './ui/label'
import { Slider as UISlider } from './ui/slider'
import { Switch } from './ui/switch'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'

export interface GraphSettings {
  colorMode: 'auto' | 'type' | 'folder'
  /** Colores personalizados: clave "type:<id>" o "folder:<ruta>". */
  customColors: Record<string, string>
  hideMissing: boolean
  hideOrphans: boolean
  /** Carpetas de primer nivel ocultas ("" = raíz). */
  hiddenFolders: string[]
  nodeSize: number
  sizeByLinks: boolean
  linkWidth: number
  arrows: boolean
  highlightNeighbors: boolean
  labelSize: number
  /** Zoom a partir del cual se muestran todas las etiquetas. */
  labelZoom: number
  /** Número de notas más conectadas que siempre llevan etiqueta. */
  hubLabels: number
  repel: number
  linkDistance: number
  gravity: number
}

export const DEFAULT_GRAPH_SETTINGS: GraphSettings = {
  colorMode: 'auto',
  customColors: {},
  hideMissing: false,
  hideOrphans: false,
  hiddenFolders: [],
  nodeSize: 1,
  sizeByLinks: true,
  linkWidth: 1,
  arrows: false,
  highlightNeighbors: true,
  labelSize: 11,
  labelZoom: 1.6,
  hubLabels: 8,
  repel: 180,
  linkDistance: 70,
  gravity: 0.03
}

const STORAGE_KEY = 'graph-settings'

export function loadGraphSettings(): GraphSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...DEFAULT_GRAPH_SETTINGS, ...JSON.parse(raw) } : DEFAULT_GRAPH_SETTINGS
  } catch {
    return DEFAULT_GRAPH_SETTINGS
  }
}

export function saveGraphSettings(s: GraphSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    /* almacenamiento no disponible: los ajustes duran solo esta sesión */
  }
}

interface Props {
  settings: GraphSettings
  onChange(patch: Partial<GraphSettings>): void
  folders: string[]
  onClose(): void
}

export default function GraphSettingsPanel({ settings: s, onChange, folders, onClose }: Props) {
  const toggleFolder = (f: string, visible: boolean) =>
    onChange({ hiddenFolders: visible ? s.hiddenFolders.filter((x) => x !== f) : [...s.hiddenFolders, f] })

  return (
    <div
      className="absolute top-2 right-3 z-10 flex max-h-[calc(100%-16px)] w-72 flex-col rounded-xl border bg-popover text-popover-foreground shadow-lg"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-sm font-semibold">Graph settings</span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7" onClick={() => onChange(DEFAULT_GRAPH_SETTINGS)}>
            <RotateCcw /> Reset
          </Button>
          <Button variant="ghost" size="icon" className="size-7" onClick={onClose} aria-label="Close">
            <X />
          </Button>
        </div>
      </div>
      <div className="min-h-0 overflow-y-auto px-3 pb-3">
        <Section title="Filters">
          <Toggle label="Hide missing notes" value={s.hideMissing} onChange={(v) => onChange({ hideMissing: v })} />
          <Toggle label="Hide orphans" value={s.hideOrphans} onChange={(v) => onChange({ hideOrphans: v })} />
          {folders.length > 1 && (
            <div className="flex flex-col gap-2 border-l-2 pl-2.5">
              <span className="text-xs text-muted-foreground">Folders</span>
              {folders.map((f) => (
                <Toggle
                  key={f}
                  label={f || '(root)'}
                  value={!s.hiddenFolders.includes(f)}
                  onChange={(v) => toggleFolder(f, v)}
                />
              ))}
            </div>
          )}
        </Section>

        <Section title="Groups">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            className="w-full"
            value={s.colorMode}
            onValueChange={(v) => v && onChange({ colorMode: v as GraphSettings['colorMode'] })}
          >
            <ToggleGroupItem value="auto" className="flex-1">Auto</ToggleGroupItem>
            <ToggleGroupItem value="type" className="flex-1">By type</ToggleGroupItem>
            <ToggleGroupItem value="folder" className="flex-1">By folder</ToggleGroupItem>
          </ToggleGroup>
          <p className="text-xs text-muted-foreground">Click a color in the legend to change it.</p>
          {Object.keys(s.customColors).length > 0 && (
            <Button variant="outline" size="sm" onClick={() => onChange({ customColors: {} })}>
              Reset colors
            </Button>
          )}
        </Section>

        <Section title="Display">
          <Slider label="Node size" value={s.nodeSize} min={0.3} max={3} step={0.1} onChange={(v) => onChange({ nodeSize: v })} />
          <Toggle label="Size by number of links" value={s.sizeByLinks} onChange={(v) => onChange({ sizeByLinks: v })} />
          <Slider label="Link thickness" value={s.linkWidth} min={0.2} max={4} step={0.1} onChange={(v) => onChange({ linkWidth: v })} />
          <Toggle label="Arrows" value={s.arrows} onChange={(v) => onChange({ arrows: v })} />
          <Toggle
            label="Highlight neighbors on hover"
            value={s.highlightNeighbors}
            onChange={(v) => onChange({ highlightNeighbors: v })}
          />
          <Slider label="Label size" value={s.labelSize} min={6} max={20} step={1} onChange={(v) => onChange({ labelSize: v })} />
          <Slider
            label="Show all labels from zoom"
            value={s.labelZoom}
            min={0.2}
            max={5}
            step={0.1}
            format={(v) => `${v.toFixed(1)}×`}
            onChange={(v) => onChange({ labelZoom: v })}
          />
          <Slider label="Always label top hubs" value={s.hubLabels} min={0} max={50} step={1} onChange={(v) => onChange({ hubLabels: v })} />
        </Section>

        <Section title="Forces">
          <Slider label="Repel force" value={s.repel} min={0} max={800} step={10} onChange={(v) => onChange({ repel: v })} />
          <Slider label="Link distance" value={s.linkDistance} min={10} max={300} step={5} onChange={(v) => onChange({ linkDistance: v })} />
          <Slider
            label="Center force"
            value={s.gravity}
            min={0}
            max={0.3}
            step={0.01}
            format={(v) => v.toFixed(2)}
            onChange={(v) => onChange({ gravity: v })}
          />
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-b py-2 last:border-b-0">
      <CollapsibleTrigger className="flex w-full items-center gap-1.5 py-1 text-sm font-medium">
        <ChevronRight className={cn('size-3.5 text-muted-foreground transition-transform', open && 'rotate-90')} />
        {title}
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-3 pt-2">{children}</CollapsibleContent>
    </Collapsible>
  )
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange(v: boolean): void }) {
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-2" data-toggle={label}>
      <Label htmlFor={id} className="truncate font-normal">
        {label}
      </Label>
      <Switch id={id} checked={value} onCheckedChange={onChange} />
    </div>
  )
}

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  format?(v: number): string
  onChange(v: number): void
}

function Slider({ label, value, min, max, step, format, onChange }: SliderProps) {
  return (
    <div className="flex flex-col gap-2" data-slider={label}>
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {format ? format(value) : step < 1 ? value.toFixed(1) : value}
        </span>
      </div>
      <UISlider min={min} max={max} step={step} value={[value]} onValueChange={([v]) => onChange(v)} />
    </div>
  )
}
