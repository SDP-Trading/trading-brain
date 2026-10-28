import { promises as fs, watch, type FSWatcher } from 'node:fs'
import { join, resolve, relative, sep, dirname } from 'node:path'
import { dump, load } from 'js-yaml'
import type {
  GraphData,
  GraphNode,
  NoteIndexEntry,
  SearchResult,
  TreeNode,
  VaultState
} from '@shared/types'
import { NOTE_TYPES, SOURCES_FOLDER, normalizeType } from '@shared/types'
import {
  basenameNoExt,
  isAttachment,
  extractWikilinks,
  normalizeKey,
  sanitizeFileName,
  splitFrontmatter
} from '@shared/markdown'

const IGNORED = new Set(['.obsidian', '.git', '.trash', 'node_modules', '.DS_Store'])

export function parseFrontmatter(text: string): { data: Record<string, unknown>; body: string } {
  const { yaml: raw, body } = splitFrontmatter(text)
  if (!raw) return { data: {}, body }
  try {
    const data = load(raw)
    return { data: data && typeof data === 'object' ? (data as Record<string, unknown>) : {}, body }
  } catch {
    return { data: {}, body }
  }
}

export function serializeNote(data: Record<string, unknown>, body: string): string {
  const fm = dump(data, { lineWidth: -1, quoteStyle: 'double' }).trimEnd()
  return `---\n${fm}\n---\n\n${body.trimStart()}`
}

function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean)
  if (typeof v === 'string' && v.trim()) return v.split(',').map((s) => s.trim()).filter(Boolean)
  return []
}

export class Vault {
  root: string | null = null
  private index = new Map<string, NoteIndexEntry>()
  /** clave normalizada (título o alias) -> ruta */
  private byName = new Map<string, string>()
  private watcher: FSWatcher | null = null
  private debounce: NodeJS.Timeout | null = null
  /** Escrituras propias recientes, para no re-notificar al renderer. */
  private ownWrites = new Map<string, number>()

  constructor(private onChange: () => void) {}

  async open(root: string): Promise<void> {
    const stat = await fs.stat(root)
    if (!stat.isDirectory()) throw new Error('The path is not a folder')
    this.close()
    this.root = resolve(root)
    await this.scaffoldIfEmpty()
    await this.rebuildIndex()
    this.startWatching()
  }

  close(): void {
    this.watcher?.close()
    this.watcher = null
    this.root = null
    this.index.clear()
    this.byName.clear()
  }

  /** Convierte una ruta relativa del vault en absoluta, impidiendo salir del vault. */
  abs(rel: string): string {
    if (!this.root) throw new Error('No vault is open')
    const p = resolve(this.root, rel)
    if (p !== this.root && !p.startsWith(this.root + sep)) throw new Error('Path is outside the vault')
    return p
  }

  rel(abs: string): string {
    return relative(this.root!, abs).split(sep).join('/')
  }

  private async scaffoldIfEmpty(): Promise<void> {
    const entries = (await fs.readdir(this.root!)).filter((e) => !IGNORED.has(e))
    if (entries.length > 0) return
    for (const t of Object.values(NOTE_TYPES)) await fs.mkdir(join(this.root!, t.folder), { recursive: true })
    await fs.mkdir(join(this.root!, SOURCES_FOLDER), { recursive: true })
    await fs.writeFile(join(this.root!, 'Home.md'), WELCOME_NOTE, 'utf8')
  }

  // ---------- Índice ----------

  async rebuildIndex(): Promise<void> {
    if (!this.root) return
    const files = await this.listMarkdown(this.root)
    const next = new Map<string, NoteIndexEntry>()
    await Promise.all(
      files.map(async (abs) => {
        try {
          const entry = await this.indexFile(abs)
          next.set(entry.path, entry)
        } catch {
          /* archivo borrado durante el escaneo */
        }
      })
    )
    this.index = next
    this.rebuildNameMap()
  }

  private async indexFile(abs: string): Promise<NoteIndexEntry> {
    const [text, stat] = await Promise.all([fs.readFile(abs, 'utf8'), fs.stat(abs)])
    const { data, body } = parseFrontmatter(text)
    const path = this.rel(abs)
    const inlineTags = [...body.matchAll(/(?:^|\s)#([\p{L}\p{N}_/-]+)/gu)].map((m) => m[1])
    return {
      path,
      title: basenameNoExt(path),
      type: typeof data.type === 'string' ? normalizeType(data.type) : typeFromFolder(path),
      tags: [...new Set([...toStringArray(data.tags), ...inlineTags])],
      aliases: toStringArray(data.aliases),
      summary: typeof data.summary === 'string' ? data.summary : undefined,
      links: extractWikilinks(text),
      size: text.length,
      mtime: stat.mtimeMs
    }
  }

  private rebuildNameMap(): void {
    this.byName.clear()
    // Los títulos tienen prioridad sobre los alias.
    for (const e of this.index.values()) for (const a of e.aliases) this.byName.set(normalizeKey(a), e.path)
    for (const e of this.index.values()) {
      this.byName.set(normalizeKey(e.title), e.path)
      this.byName.set(normalizeKey(e.path.replace(/\.md$/i, '')), e.path)
    }
  }

  private async listMarkdown(dir: string): Promise<string[]> {
    const out: string[] = []
    for (const d of await fs.readdir(dir, { withFileTypes: true })) {
      if (IGNORED.has(d.name) || d.name.startsWith('.')) continue
      const p = join(dir, d.name)
      if (d.isDirectory()) out.push(...(await this.listMarkdown(p)))
      else if (d.isFile() && d.name.toLowerCase().endsWith('.md')) out.push(p)
    }
    return out
  }

  async tree(dir = this.root!): Promise<TreeNode[]> {
    const nodes: TreeNode[] = []
    for (const d of await fs.readdir(dir, { withFileTypes: true })) {
      if (IGNORED.has(d.name) || d.name.startsWith('.')) continue
      const p = join(dir, d.name)
      if (d.isDirectory()) nodes.push({ name: d.name, path: this.rel(p), type: 'dir', children: await this.tree(p) })
      else if (d.name.toLowerCase().endsWith('.md'))
        nodes.push({ name: d.name.replace(/\.md$/i, ''), path: this.rel(p), type: 'file', kind: 'note' })
      else if (d.name.toLowerCase().endsWith('.canvas'))
        nodes.push({ name: d.name.replace(/\.canvas$/i, ''), path: this.rel(p), type: 'file', kind: 'canvas' })
    }
    return nodes.sort((a, b) =>
      a.type !== b.type ? (a.type === 'dir' ? -1 : 1) : a.name.localeCompare(b.name, 'en', { numeric: true })
    )
  }

  async state(): Promise<VaultState> {
    if (!this.root) return { path: null, tree: [], index: [] }
    return { path: this.root, tree: await this.tree(), index: this.entries() }
  }

  entries(): NoteIndexEntry[] {
    return [...this.index.values()].sort((a, b) => a.path.localeCompare(b.path))
  }

  resolveLink(target: string): string | null {
    return this.byName.get(normalizeKey(target.replace(/\.md$/i, ''))) ?? null
  }

  backlinks(path: string): NoteIndexEntry[] {
    return this.entries().filter((e) => e.path !== path && e.links.some((l) => this.resolveLink(l) === path))
  }

  graph(): GraphData {
    const nodes = new Map<string, GraphNode>()
    const links: GraphData['links'] = []
    for (const e of this.index.values()) {
      if (e.path.startsWith(SOURCES_FOLDER + '/') || isAttachment(e.title)) continue
      nodes.set(e.path, { id: e.path, title: e.title, type: e.type, folder: e.path.includes('/') ? e.path.slice(0, e.path.lastIndexOf('/')) : '', exists: true, degree: 0 })
    }
    const seen = new Set<string>()
    for (const e of this.index.values()) {
      if (!nodes.has(e.path)) continue
      for (const l of e.links) {
        if (isAttachment(l)) continue // imágenes y otros adjuntos incrustados no son nodos del grafo
        const target = this.resolveLink(l) ?? `missing:${normalizeKey(l)}`
        if (target === e.path || target.startsWith(SOURCES_FOLDER + '/')) continue
        if (!nodes.has(target)) nodes.set(target, { id: target, title: l, folder: '', exists: false, degree: 0 })
        const key = [e.path, target].sort().join('→')
        if (seen.has(key)) continue
        seen.add(key)
        links.push({ source: e.path, target })
        nodes.get(e.path)!.degree++
        nodes.get(target)!.degree++
      }
    }
    return { nodes: [...nodes.values()], links }
  }

  /** Búsqueda por palabras clave: título > alias/tags > contenido. */
  async search(query: string, limit = 30): Promise<SearchResult[]> {
    const terms = tokenize(query)
    if (!terms.length) return []
    const results: SearchResult[] = []
    for (const e of this.index.values()) {
      const text = await this.read(e.path).catch(() => '')
      const lower = text.toLowerCase()
      const title = e.title.toLowerCase()
      let score = 0
      for (const t of terms) {
        if (title.includes(t)) score += 10
        if (e.aliases.some((a) => a.toLowerCase().includes(t)) || e.tags.some((g) => g.toLowerCase().includes(t)))
          score += 5
        let idx = lower.indexOf(t)
        let n = 0
        while (idx !== -1 && n < 20) {
          n++
          idx = lower.indexOf(t, idx + t.length)
        }
        score += n
      }
      if (score === 0) continue
      const first = Math.max(0, lower.indexOf(terms[0]))
      const snippet = text.slice(Math.max(0, first - 60), first + 140).replace(/\s+/g, ' ').trim()
      results.push({ path: e.path, title: e.title, snippet, score })
    }
    return results.sort((a, b) => b.score - a.score).slice(0, limit)
  }

  // ---------- Archivos ----------

  read(rel: string): Promise<string> {
    return fs.readFile(this.abs(rel), 'utf8')
  }

  async write(rel: string, content: string): Promise<void> {
    const p = this.abs(rel)
    await fs.mkdir(dirname(p), { recursive: true })
    this.ownWrites.set(rel, Date.now())
    await fs.writeFile(p, content, 'utf8')
    if (!rel.toLowerCase().endsWith('.md')) return // los .canvas no se indexan como notas
    const entry = await this.indexFile(p)
    this.index.set(entry.path, entry)
    this.rebuildNameMap()
  }

  async exists(rel: string): Promise<boolean> {
    return fs.access(this.abs(rel)).then(
      () => true,
      () => false
    )
  }

  /** Devuelve una ruta libre "carpeta/Título.md" (añade sufijo si existe). */
  async freePath(folder: string, title: string, ext = '.md'): Promise<string> {
    const base = sanitizeFileName(title)
    const prefix = folder ? folder.replace(/\/+$/, '') + '/' : ''
    let candidate = `${prefix}${base}${ext}`
    for (let i = 2; await this.exists(candidate); i++) candidate = `${prefix}${base} ${i}${ext}`
    return candidate
  }

  async createNote(folder: string, title: string, content?: string): Promise<string> {
    const path = await this.freePath(folder, title)
    await this.write(path, content ?? `# ${basenameNoExt(path)}\n\n`)
    return path
  }

  async createCanvas(folder: string, title: string, content?: string): Promise<string> {
    const path = await this.freePath(folder, title, '.canvas')
    await this.write(path, content ?? JSON.stringify({ nodes: [], edges: [] }, null, '\t'))
    return path
  }

  async createFolder(rel: string): Promise<void> {
    await fs.mkdir(this.abs(rel), { recursive: true })
  }

  /** Igual que Obsidian: mueve a .trash dentro del vault en lugar de borrar. Devuelve el nombre en la papelera. */
  async delete(rel: string): Promise<string> {
    const p = this.abs(rel)
    if (p === this.root) throw new Error('Cannot delete the vault itself')
    const trash = join(this.root!, '.trash')
    await fs.mkdir(trash, { recursive: true })
    const name = `${Date.now()}-${p.split(sep).pop()}`
    await fs.rename(p, join(trash, name))
    await this.rebuildIndex()
    return name
  }

  /** Deshace un delete: devuelve el archivo o carpeta de .trash a su ruta original (si sigue libre). */
  async restore(trashName: string, rel: string): Promise<void> {
    if (trashName.includes('/') || trashName.includes(sep)) throw new Error('Invalid trash item')
    const from = join(this.root!, '.trash', trashName)
    const to = this.abs(rel)
    if (await this.exists(rel)) throw new Error(`"${rel}" already exists`)
    await fs.mkdir(dirname(to), { recursive: true })
    await fs.rename(from, to)
    await this.rebuildIndex()
  }

  /** Renombra una nota y actualiza los [[wikilinks]] que apuntan a ella. */
  async rename(rel: string, newName: string): Promise<string> {
    const oldTitle = basenameNoExt(rel)
    const folder = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : ''
    if (rel.toLowerCase().endsWith('.canvas')) {
      const target = await this.freePath(folder, newName, '.canvas')
      await fs.rename(this.abs(rel), this.abs(target))
      return target
    }
    const newPath = await this.freePath(folder, newName)
    await fs.rename(this.abs(rel), this.abs(newPath))
    const newTitle = basenameNoExt(newPath)
    const escaped = oldTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`\\[\\[${escaped}(#[^\\]|]*)?(\\|[^\\]]*)?\\]\\]`, 'gi')
    for (const e of this.index.values()) {
      if (!e.links.some((l) => normalizeKey(l) === normalizeKey(oldTitle))) continue
      const p = e.path === rel ? newPath : e.path
      const text = await this.read(p)
      const updated = text.replace(re, (_m, h = '', a = '') => `[[${newTitle}${h}${a}]]`)
      if (updated !== text) await this.write(p, updated)
    }
    await this.rebuildIndex()
    return newPath
  }

  // ---------- Watcher ----------

  private startWatching(): void {
    try {
      this.watcher = watch(this.root!, { recursive: true }, (_ev, file) => {
        if (!file) return
        const rel = file.split(sep).join('/')
        if (rel.split('/').some((seg) => IGNORED.has(seg) || seg.startsWith('.'))) return
        const own = this.ownWrites.get(rel)
        if (own && Date.now() - own < 1500) return
        if (this.debounce) clearTimeout(this.debounce)
        this.debounce = setTimeout(async () => {
          await this.rebuildIndex()
          this.onChange()
        }, 300)
      })
    } catch {
      /* fs.watch recursivo no disponible: sin recarga automática */
    }
  }
}

/** Sin `type` en el frontmatter, deduce el tipo si la nota está en una carpeta de la taxonomía. */
function typeFromFolder(path: string): string | undefined {
  const top = path.split('/')[0]
  return Object.entries(NOTE_TYPES).find(([, t]) => t.folder === top)?.[0]
}

export function tokenize(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 2)
}

const WELCOME_NOTE = `---
type: model
tags: [home]
---

# Home

Welcome to your **trading brain**. This vault is a plain Markdown folder: you can open it with Obsidian too.

## How to use it

1. Open **Import with AI** and paste everything you have about a model: loose notes, rules, transcripts, checklists…
2. The AI splits it into atomic notes linked to each other (wikilinks) and files each one in its folder:
${Object.values(NOTE_TYPES)
  .map((t) => `   - \`${t.folder}\` — ${t.label}`)
  .join('\n')}
3. Review the preview and save. A map of content (MOC) note for the model links everything together.
4. Use the **Graph** to see relationships and the **Chat** to ask your brain questions.

The original text of every import is saved in \`${SOURCES_FOLDER}\` for traceability.
`
