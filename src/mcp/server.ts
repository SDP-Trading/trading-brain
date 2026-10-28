// Servidor MCP de Trading Brain (stdio). Lo lanzan Claude Desktop / Claude Code con el propio
// binario de la app en modo Node (ELECTRON_RUN_AS_NODE=1), así que no hace falta tener Node instalado.
import { promises as fs } from 'node:fs'
import { basename } from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import type { NoteIndexEntry, VaultRef } from '@shared/types'
import { NOTE_TYPES, NOTE_TYPE_IDS, SOURCES_FOLDER, normalizeType } from '@shared/types'
import { basenameNoExt, normalizeKey, sanitizeFileName, splitFrontmatter } from '@shared/markdown'
import { Vault, serializeNote } from '../main/vault'
import { healthReport } from '../main/health'
import { HealthAuditSchema, saveHealthAudit } from '../main/healthStore'
import { HEALTH_INSTRUCTIONS, type HealthAudit } from '@shared/health'
import { FLOW_INSTRUCTIONS, flowToCanvas, serializeCanvas, type FlowSpec } from '@shared/canvas'

const SETTINGS = process.env.TRADING_BRAIN_SETTINGS

interface AppSettings {
  lastVault: string | null
  vaults: VaultRef[]
}

async function readSettings(): Promise<AppSettings> {
  if (!SETTINGS) throw new Error('TRADING_BRAIN_SETTINGS is not set. Reconnect Trading Brain from its Settings.')
  try {
    const raw = JSON.parse(await fs.readFile(SETTINGS, 'utf8'))
    const vaults: VaultRef[] = raw.vaults ?? []
    if (raw.lastVault && !vaults.some((v) => v.path === raw.lastVault))
      vaults.push({ path: raw.lastVault, name: basename(raw.lastVault) })
    return { lastVault: raw.lastVault ?? null, vaults }
  } catch {
    return { lastVault: null, vaults: [] }
  }
}

// Un Vault por carpeta; el índice se reconstruye en cada llamada (barato) para ver los cambios de la app.
const opened = new Map<string, Vault>()

async function getVault(name?: string): Promise<Vault> {
  const s = await readSettings()
  let path = s.lastVault
  if (name) {
    const key = normalizeKey(name)
    const match = s.vaults.find((v) => normalizeKey(v.name) === key || v.path === name)
    if (!match) throw new Error(`Unknown vault "${name}". Available: ${s.vaults.map((v) => v.name).join(', ') || 'none'}`)
    path = match.path
  }
  if (!path) throw new Error('No vault is open in Trading Brain. Open one in the app first.')
  let v = opened.get(path)
  if (!v) {
    v = new Vault(() => {})
    await v.open(path)
    opened.set(path, v)
  } else await v.rebuildIndex()
  return v
}

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] })
const fail = (t: string) => ({ content: [{ type: 'text' as const, text: t }], isError: true })
const isSource = (e: NoteIndexEntry) => e.path.startsWith(SOURCES_FOLDER + '/')
const line = (e: NoteIndexEntry) =>
  `- [[${e.title}]]${e.type ? ` (${e.type})` : ''}${e.summary ? ` — ${e.summary}` : ''}  \`${e.path}\``

const vaultArg = z.string().optional().describe('Vault name. Omit to use the vault currently open in Trading Brain.')

const server = new McpServer(
  { name: 'trading-brain', version: '0.1.0' },
  {
    instructions: `Trading Brain is the user's "second brain" for trading: an Obsidian-compatible Markdown vault describing their trading model (setups, rules, risk management, psychology, markets, examples).

When the user asks about their model, trading rules or setups:
- Start with get_model_overview if you don't know the vault yet, then use search_notes and read_note to find the relevant notes. Follow [[wikilinks]] with read_note when they matter.
- Answer from the notes. Cite the notes you used by title, like [[Note Title]]. If something is not in the notes, say so clearly and separate the user's model from your general opinion.
- Point out gaps or contradictions you notice in the model.
- Only create or update notes when the user asks for it. Prefer appending to existing notes over replacing them.
- Do not give personalized financial advice; help the user understand and apply their own model.`
  }
)

server.registerTool(
  'list_vaults',
  {
    title: 'List vaults',
    description: 'List the vaults known to Trading Brain and which one is currently open.',
    annotations: { readOnlyHint: true }
  },
  async () => {
    const s = await readSettings()
    if (!s.vaults.length) return text('No vaults yet. The user can add one in Trading Brain.')
    return text(s.vaults.map((v) => `- ${v.name}${v.path === s.lastVault ? ' (open)' : ''}: ${v.path}`).join('\n'))
  }
)

server.registerTool(
  'get_model_overview',
  {
    title: 'Get trading model overview',
    description:
      'Overview of the vault: the trading model notes (maps of content) in full, plus every note grouped by type with its summary. Call this first to get oriented.',
    inputSchema: { vault: vaultArg },
    annotations: { readOnlyHint: true }
  },
  async ({ vault: name }) => {
    const v = await getVault(name)
    const entries = v.entries().filter((e) => !isSource(e))
    // Notas principales: las de tipo model; si no hay (vault de Obsidian sin tipos), las que se llaman
    // igual que una carpeta ("The Unicorn Model.md" junto a "The Unicorn Model/") o las más enlazadas.
    let models = entries.filter((e) => e.type === 'model')
    if (!models.length) {
      const folders = new Set(entries.flatMap((e) => e.path.split('/').slice(0, -1)).map(normalizeKey))
      models = entries.filter((e) => folders.has(normalizeKey(e.title)))
      if (!models.length) models = [...entries].sort((x, y) => y.links.length - x.links.length).slice(0, 2)
    }
    const parts = [`# Vault: ${basename(v.root!)} (${entries.length} notes)`]
    for (const m of models.slice(0, 5)) {
      const body = splitFrontmatter(await v.read(m.path)).body.trim()
      parts.push(`## Main note: ${m.title}\n\n${body.slice(0, 15000)}`)
    }
    const groups = new Map<string, NoteIndexEntry[]>()
    for (const e of entries) {
      const key = e.type && (NOTE_TYPES as Record<string, unknown>)[e.type] ? e.type : `folder: ${e.path.split('/').slice(0, -1).join('/') || '(root)'}`
      groups.set(key, [...(groups.get(key) ?? []), e])
    }
    const order = [...NOTE_TYPE_IDS, ...[...groups.keys()].filter((k) => !(k in NOTE_TYPES)).sort()]
    let count = 0
    for (const k of order) {
      const list = groups.get(k)
      if (!list?.length) continue
      const label = (NOTE_TYPES as Record<string, { label: string }>)[k]?.label ?? k
      parts.push(`## ${label}\n${list.slice(0, 300).map(line).join('\n')}`)
      if ((count += list.length) > 800) break
    }
    return text(parts.join('\n\n'))
  }
)

server.registerTool(
  'search_notes',
  {
    title: 'Search notes',
    description: 'Keyword search across note titles, aliases, tags and content. Returns titles, paths and snippets.',
    inputSchema: {
      query: z.string().describe('Keywords, e.g. "unicorn stop loss"'),
      limit: z.number().int().min(1).max(50).optional().describe('Max results (default 10)'),
      vault: vaultArg
    },
    annotations: { readOnlyHint: true }
  },
  async ({ query, limit, vault: name }) => {
    const v = await getVault(name)
    const res = (await v.search(query, limit ?? 10)).filter((r) => !r.path.startsWith(SOURCES_FOLDER + '/'))
    if (!res.length) return text(`No notes match "${query}". Try other keywords or get_model_overview.`)
    return text(res.map((r) => `- [[${r.title}]] \`${r.path}\`\n  …${r.snippet}…`).join('\n'))
  }
)

server.registerTool(
  'read_note',
  {
    title: 'Read note',
    description: 'Read a note by title, alias, [[wikilink]] or path. Returns its full Markdown plus its backlinks and outgoing links.',
    inputSchema: { note: z.string().describe('Note title, alias or vault-relative path'), vault: vaultArg },
    annotations: { readOnlyHint: true }
  },
  async ({ note, vault: name }) => {
    const v = await getVault(name)
    const target = note.replace(/^\[\[|\]\]$/g, '').split('|')[0].split('#')[0]
    const path = v.resolveLink(target) ?? (target.endsWith('.md') && (await v.exists(target)) ? target : null)
    if (!path) {
      const similar = await v.search(target, 5)
      return fail(`Note "${note}" not found.${similar.length ? ` Similar: ${similar.map((s) => `[[${s.title}]]`).join(', ')}` : ''}`)
    }
    const entry = v.entries().find((e) => e.path === path)
    const backlinks = v.backlinks(path).map((b) => `[[${b.title}]]`)
    return text(
      [
        `# ${basenameNoExt(path)}  \`${path}\``,
        await v.read(path),
        `---\nOutgoing links: ${entry?.links.map((l) => `[[${l}]]`).join(', ') || 'none'}\nBacklinks: ${backlinks.join(', ') || 'none'}`
      ].join('\n\n')
    )
  }
)

server.registerTool(
  'list_notes',
  {
    title: 'List notes',
    description: `List notes, optionally filtered by type (${NOTE_TYPE_IDS.join(', ')}), folder or tag.`,
    inputSchema: {
      type: z.string().optional(),
      folder: z.string().optional().describe('Folder prefix, e.g. "02 Setups"'),
      tag: z.string().optional(),
      vault: vaultArg
    },
    annotations: { readOnlyHint: true }
  },
  async ({ type, folder, tag, vault: name }) => {
    const v = await getVault(name)
    const t = type ? normalizeType(type) : undefined
    const list = v
      .entries()
      .filter((e) => !isSource(e))
      .filter((e) => !t || e.type === t)
      .filter((e) => !folder || e.path.toLowerCase().startsWith(folder.toLowerCase().replace(/\/?$/, '/')))
      .filter((e) => !tag || e.tags.some((g) => g.toLowerCase() === tag.replace(/^#/, '').toLowerCase()))
    if (!list.length) return text('No notes match.')
    return text(list.slice(0, 500).map(line).join('\n') + (list.length > 500 ? `\n… and ${list.length - 500} more` : ''))
  }
)

server.registerTool(
  'create_note',
  {
    title: 'Create note',
    description:
      'Create a new note. Use [[Exact Title]] links to connect it to existing notes. The note is filed in the folder of its type unless a folder is given.',
    inputSchema: {
      title: z.string(),
      content: z.string().describe('Markdown body, without frontmatter or H1 title'),
      type: z.enum(NOTE_TYPE_IDS as [string, ...string[]]).optional(),
      folder: z.string().optional(),
      tags: z.array(z.string()).optional(),
      summary: z.string().optional().describe('One sentence describing the note'),
      vault: vaultArg
    },
    annotations: { readOnlyHint: false, destructiveHint: false }
  },
  async ({ title, content, type, folder, tags, summary, vault: name }) => {
    const v = await getVault(name)
    const existing = v.resolveLink(title)
    if (existing) return fail(`A note named "${title}" already exists at ${existing}. Use update_note instead.`)
    const dir = folder ?? (type ? NOTE_TYPES[type as keyof typeof NOTE_TYPES].folder : 'Inbox')
    const path = await v.freePath(dir, sanitizeFileName(title))
    const data: Record<string, unknown> = { ...(type ? { type } : {}), tags: tags ?? [], created: new Date().toISOString().slice(0, 10) }
    if (summary) data.summary = summary
    await v.write(path, serializeNote(data, `# ${basenameNoExt(path)}\n\n${content.trim()}\n`))
    return text(`Created [[${basenameNoExt(path)}]] at \`${path}\`. It is now visible in Trading Brain.`)
  }
)

server.registerTool(
  'update_note',
  {
    title: 'Update note',
    description:
      'Append Markdown to an existing note (default) or replace its body. Replacing keeps the frontmatter properties.',
    inputSchema: {
      note: z.string().describe('Note title, alias or path'),
      content: z.string(),
      mode: z.enum(['append', 'replace']).optional().describe('Default: append'),
      vault: vaultArg
    },
    annotations: { readOnlyHint: false, destructiveHint: true }
  },
  async ({ note, content, mode, vault: name }) => {
    const v = await getVault(name)
    const path = v.resolveLink(note.replace(/^\[\[|\]\]$/g, ''))
    if (!path) return fail(`Note "${note}" not found. Use create_note to create it.`)
    const current = await v.read(path)
    let next: string
    if (mode === 'replace') {
      const { yaml } = splitFrontmatter(current)
      next = (yaml != null ? `---\n${yaml}\n---\n\n` : '') + content.trim() + '\n'
    } else next = current.trimEnd() + '\n\n' + content.trim() + '\n'
    await v.write(path, next)
    return text(`${mode === 'replace' ? 'Replaced the body of' : 'Appended to'} [[${basenameNoExt(path)}]].`)
  }
)

server.registerTool(
  'get_model_health',
  {
    title: 'Get model health',
    description:
      'Check which parts of each setup are defined in the notes (context, entry, stop, target, invalidation, risk, example). 2 = own section, 1 = mentioned, 0 = missing. Useful to find gaps in the model.',
    inputSchema: {
      scope: z.string().optional().describe('"type:setup" or a folder path. Omit for the default.'),
      vault: vaultArg
    },
    annotations: { readOnlyHint: true }
  },
  async ({ scope, vault: name }) => {
    const v = await getVault(name)
    const r = await healthReport(v, scope)
    if (!r.rows.length) return text(`No notes found for scope "${r.scope}". Available scopes: ${r.scopes.join(', ')}`)
    const head = `| Note | ${r.criteria.map((c) => c.label).join(' | ')} | Score |`
    const sep = `|---|${r.criteria.map(() => '---').join('|')}|---|`
    const mark = (n: number) => (n === 2 ? '✅' : n === 1 ? '🟡' : '❌')
    const rows = r.rows.map(
      (row) => `| [[${row.title}]]${row.empty ? ' (empty)' : ''} | ${r.criteria.map((c) => mark(row.cells[c.id])).join(' | ')} | ${Math.round(row.score * 100)}% |`
    )
    return text(`Scope: ${r.scope}\n✅ own section · 🟡 mentioned · ❌ missing\n\n${[head, sep, ...rows].join('\n')}`)
  }
)

server.registerTool(
  'save_model_health',
  {
    title: 'Save model health audit',
    description: `Save an AI audit of the trading model so Trading Brain shows it in its "Model health" view. Read the relevant notes first (get_model_overview, read_note). get_model_health gives a quick keyword scan as a starting point.\n${HEALTH_INSTRUCTIONS}`,
    inputSchema: { ...HealthAuditSchema.shape, vault: vaultArg },
    annotations: { readOnlyHint: false, destructiveHint: false }
  },
  async ({ vault: name, ...audit }) => {
    const v = await getVault(name)
    const client = server.server.getClientVersion()?.name ?? 'MCP client'
    const saved = await saveHealthAudit(v, audit as HealthAudit, `${client} via MCP`)
    return text(`Saved the health audit (${saved.setups.length} setups, score ${saved.score}/100). It is now visible in Trading Brain → Model health.`)
  }
)

server.registerTool(
  'create_flow_canvas',
  {
    title: 'Create decision flow canvas',
    description: `Create an Obsidian .canvas file with a decision flowchart, laid out automatically, and save it in the "Flows" folder. Trading Brain shows it in its Canvas view.\n${FLOW_INSTRUCTIONS}`,
    inputSchema: {
      title: z.string(),
      nodes: z
        .array(
          z.object({
            id: z.string(),
            label: z.string(),
            kind: z.enum(['start', 'decision', 'step', 'action', 'end']),
            note: z.string().nullable().optional().describe('Exact title of the note explaining this box')
          })
        )
        .min(2),
      edges: z.array(z.object({ from: z.string(), to: z.string(), label: z.string().nullable().optional() })),
      vault: vaultArg
    },
    annotations: { readOnlyHint: false, destructiveHint: false }
  },
  async ({ title, nodes, edges, vault: name }) => {
    const v = await getVault(name)
    const spec: FlowSpec = { title, nodes, edges }
    const path = await v.createCanvas('Flows', title, serializeCanvas(flowToCanvas(spec)))
    return text(`Created the flow canvas at \`${path}\` (${nodes.length} boxes). Open it in Trading Brain → Canvas.`)
  }
)

server.registerPrompt(
  'ask_my_model',
  {
    title: 'Ask my trading model',
    description: 'Answer a question strictly from the trading model in Trading Brain.',
    argsSchema: { question: z.string() }
  },
  ({ question }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Using only my Trading Brain vault (get_model_overview, search_notes, read_note), answer: ${question}\n\nCite the notes you used as [[Title]]. If my notes don't cover something, say so explicitly instead of filling the gap with general knowledge.`
        }
      }
    ]
  })
)

server.connect(new StdioServerTransport()).catch((e) => {
  console.error(e)
  process.exit(1)
})
