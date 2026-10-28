// Tipos compartidos entre el proceso main, preload y renderer.

export interface TreeNode {
  name: string
  /** Ruta relativa al vault, con separador "/". */
  path: string
  type: 'file' | 'dir'
  /** Solo archivos: nota Markdown o lienzo (.canvas de Obsidian). */
  kind?: 'note' | 'canvas'
  children?: TreeNode[]
}

export interface NoteIndexEntry {
  path: string
  title: string
  type?: string
  tags: string[]
  aliases: string[]
  summary?: string
  /** Destinos de [[wikilinks]] tal como aparecen (sin alias ni encabezado). */
  links: string[]
  size: number
  mtime: number
}

export interface VaultRef {
  path: string
  name: string
}

export interface VaultListItem extends VaultRef {
  /** false si la carpeta ya no existe (movida o borrada). */
  exists: boolean
  current: boolean
}

export interface VaultState {
  path: string | null
  tree: TreeNode[]
  index: NoteIndexEntry[]
}

export interface GraphNode {
  id: string
  title: string
  type?: string
  /** Carpeta que contiene la nota ("" en la raíz). */
  folder: string
  /** false para enlaces a notas que aún no existen. */
  exists: boolean
  degree: number
}

export interface GraphData {
  nodes: GraphNode[]
  links: { source: string; target: string }[]
}

export interface SearchResult {
  path: string
  title: string
  snippet: string
  score: number
}

export type ProviderId = 'anthropic' | 'openai' | 'ollama'
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export type ThemeMode = 'system' | 'light' | 'dark'

export interface Settings {
  provider: ProviderId
  models: Record<ProviderId, string>
  ollamaBaseUrl: string
  effort: Effort
  /** Máximo de caracteres del vault que se envían como contexto al chat. */
  chatContextChars: number
  lastVault: string | null
  /** Vaults conocidos, en el orden en que se añadieron. */
  vaults: VaultRef[]
  theme: ThemeMode
  /** Se completó (o se saltó) el asistente de primer arranque. */
  onboarded: boolean
}

export interface PublicSettings extends Settings {
  hasKey: { anthropic: boolean; openai: boolean }
}

export interface GeneratedNote {
  title: string
  type: NoteType
  tags: string[]
  aliases: string[]
  summary: string
  content: string
}

export interface ImportResult {
  modelName: string
  overview: string
  openQuestions: string[]
  notes: GeneratedNote[]
}

export interface ImportPreviewNote extends GeneratedNote {
  /** Ruta existente si ya hay una nota con ese título (se añadirá contenido). */
  existingPath: string | null
  targetPath: string
}

export interface ImportPreview {
  result: ImportResult
  notes: ImportPreviewNote[]
}

export interface SaveImportRequest {
  result: ImportResult
  notes: ImportPreviewNote[]
  sourceText: string
  sourceLabel: string
}

export interface SaveImportResponse {
  created: string[]
  updated: string[]
  mocPath: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface McpStatus {
  /** Claude Desktop instalado (existe su carpeta de configuración). */
  desktopInstalled: boolean
  desktopConnected: boolean
  desktopConfigPath: string
  /** Comando para registrar el servidor en Claude Code. */
  claudeCodeCommand: string
  /** ChatGPT desktop / Codex (comparten ~/.codex/config.toml). */
  chatgptInstalled: boolean
  chatgptConnected: boolean
  codexConfigPath: string
  codexCommand: string
}

export type HealthCriterion = 'context' | 'entry' | 'stop' | 'target' | 'invalidation' | 'risk' | 'example'

export interface HealthRow {
  path: string
  title: string
  type?: string
  /** 2 = tiene sección propia, 1 = se menciona, 0 = no aparece. */
  cells: Record<HealthCriterion, 0 | 1 | 2>
  score: number
  /** La nota apenas tiene contenido propio (solo título, enlaces o encabezados). */
  empty: boolean
}

export interface HealthReport {
  /** "type:setup" o una carpeta. */
  scope: string
  scopes: string[]
  criteria: { id: HealthCriterion; label: string }[]
  rows: HealthRow[]
}

export interface OllamaStatus {
  running: boolean
  models: string[]
}

export interface ImportedFile {
  name: string
  content: string
}

// Taxonomía del cerebro de trading. Cada tipo vive en su carpeta.
export const NOTE_TYPES = {
  model: { folder: '00 Models', label: 'Model', color: '#e5c07b' },
  concept: { folder: '01 Concepts', label: 'Concept', color: '#61afef' },
  setup: { folder: '02 Setups', label: 'Setup', color: '#98c379' },
  rule: { folder: '03 Rules', label: 'Rule', color: '#c678dd' },
  risk: { folder: '04 Risk Management', label: 'Risk', color: '#e06c75' },
  psychology: { folder: '05 Psychology', label: 'Psychology', color: '#d19a66' },
  market: { folder: '06 Markets & Sessions', label: 'Market', color: '#56b6c2' },
  tool: { folder: '07 Indicators & Tools', label: 'Tool', color: '#a9b665' },
  checklist: { folder: '08 Checklists', label: 'Checklist', color: '#7fbbb3' },
  example: { folder: '09 Examples & Trades', label: 'Example', color: '#ea76cb' },
  glossary: { folder: '10 Glossary', label: 'Glossary', color: '#9da5b4' }
} as const

export type NoteType = keyof typeof NOTE_TYPES
export const NOTE_TYPE_IDS = Object.keys(NOTE_TYPES) as NoteType[]
export const SOURCES_FOLDER = '_Sources'

/** Ids de tipo de la primera versión (en español), mapeados a los actuales. */
const LEGACY_TYPES: Record<string, NoteType> = {
  modelo: 'model',
  concepto: 'concept',
  regla: 'rule',
  riesgo: 'risk',
  psicologia: 'psychology',
  mercado: 'market',
  herramienta: 'tool',
  ejemplo: 'example',
  glosario: 'glossary'
}

export function normalizeType(type: string): string {
  const t = type.trim().toLowerCase()
  return LEGACY_TYPES[t] ?? t
}

export function typeColor(type?: string): string {
  return (type && (NOTE_TYPES as Record<string, { color: string }>)[type]?.color) || '#7f848e'
}
