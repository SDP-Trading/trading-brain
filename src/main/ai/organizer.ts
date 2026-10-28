import { z } from 'zod'
import type {
  ImportPreview,
  ImportPreviewNote,
  ImportResult,
  SaveImportRequest,
  SaveImportResponse
} from '@shared/types'
import { NOTE_TYPES, NOTE_TYPE_IDS, SOURCES_FOLDER, type NoteType } from '@shared/types'
import { basenameNoExt, normalizeKey, sanitizeFileName } from '@shared/markdown'
import { complete, AIError } from './providers'
import { parseFrontmatter, serializeNote, type Vault } from '../vault'

// La nota "modelo" (MOC) la genera la app, así que la IA no la usa.
const AI_TYPES = NOTE_TYPE_IDS.filter((t) => t !== 'model')

const str = { type: 'string' }
const strArr = { type: 'array', items: str }

const IMPORT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['modelName', 'overview', 'openQuestions', 'notes'],
  properties: {
    modelName: str,
    overview: str,
    openQuestions: strArr,
    notes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'type', 'tags', 'aliases', 'summary', 'content'],
        properties: {
          title: str,
          type: { type: 'string', enum: AI_TYPES },
          tags: strArr,
          aliases: strArr,
          summary: str,
          content: str
        }
      }
    }
  }
}

const ImportResultSchema = z.object({
  modelName: z.string().min(1),
  overview: z.string(),
  openQuestions: z.array(z.string()),
  notes: z.array(
    z.object({
      title: z.string().min(1),
      type: z.enum(AI_TYPES as [NoteType, ...NoteType[]]),
      tags: z.array(z.string()),
      aliases: z.array(z.string()),
      summary: z.string(),
      content: z.string()
    })
  )
})

const TYPE_GUIDE = `
- concept: an idea or notion in the model (e.g. "Order block", "Liquidity", "Market structure").
- setup: a concrete tradable pattern. Sections: ## Context, ## Conditions, ## Entry, ## Stop loss, ## Targets, ## Invalidation, ## Notes.
- rule: an explicit, checkable rule (entry, exit, filter, position management). Write it as a verifiable condition.
- risk: risk and capital management: % per trade, R:R, daily/weekly limits, position sizing, scaling.
- psychology: discipline, biases, mental routines, behavioral rules.
- market: instruments, sessions, times, news, market conditions where the model does or does not apply.
- tool: indicators, chart settings, timeframes, platforms.
- checklist: pre-trade, in-trade and post-trade checklists (use "- [ ] ").
- example: example trades or concrete cases described in the material.
- glossary: terms and abbreviations with a short definition.`.trim()

function buildSystemPrompt(existing: string): string {
  return `You are a trading analyst and knowledge architect. You turn messy material about a trading model into an Obsidian vault: atomic, well-typed, densely linked notes.

## Rules
- One idea per note. Split into as many notes as needed; do not summarize the material, organize it while keeping every useful detail.
- Absolute fidelity: do not invent rules, levels, numbers or conditions. Keep figures, timeframes and times exactly as they appear. If something is ambiguous, contradictory, or missing for the model to be tradable, add it to "openQuestions" instead of assuming.
- Write in the same language as the source material.
- "title": short, unique and descriptive, without the characters / \\ : * ? " < > | # ^ [ ].
- "content": Markdown without frontmatter and without an H1 title. Use ## headings, lists and tables where they help.
- Link with [[Exact Title]] to other notes in this import or to existing vault notes whenever the concept is mentioned. Every note must link to at least one other note.
- If a concept already exists in the vault, reuse its EXACT title as "title": the content will be appended to that note. Include only new information.
- "summary": one sentence that explains the note.
- "tags": lowercase, hyphenated, without "#" (e.g. "liquidity", "london-session").
- "aliases": synonyms or abbreviations used for the concept (may be empty).
- "modelName": name of the trading model or system (if it is not named, propose a descriptive one). If a model note with that name already exists, use the exact name.
- "overview": 1-3 Markdown paragraphs explaining the model at a glance (core idea, market, timeframe, style), linking the key notes with [[ ]].

## Note types
${TYPE_GUIDE}

## Existing notes in the vault
${existing || '(empty vault)'}

Reply only with the JSON that matches the schema.`
}

function existingNotesList(vault: Vault): string {
  return vault
    .entries()
    .filter((e) => !e.path.startsWith(SOURCES_FOLDER + '/'))
    .slice(0, 800)
    .map((e) => `- ${e.title}${e.type ? ` (${e.type})` : ''}${e.summary ? `: ${e.summary}` : ''}`)
    .join('\n')
}

export async function organize(
  vault: Vault,
  text: string,
  modelHint: string,
  signal: AbortSignal,
  onProgress: (chars: number) => void
): Promise<ImportPreview> {
  if (!text.trim()) throw new AIError('There is nothing to import.')
  let received = 0
  const userContent =
    (modelHint.trim() ? `Model name: ${modelHint.trim()}\n\n` : '') +
    `Material to organize:\n\n<material>\n${text}\n</material>`

  const raw = await complete({
    system: buildSystemPrompt(existingNotesList(vault)),
    messages: [{ role: 'user', content: userContent }],
    jsonSchema: { name: 'trading_vault_import', schema: IMPORT_SCHEMA },
    signal,
    onText: (d) => {
      received += d.length
      onProgress(received)
    }
  })

  let parsed: unknown
  try {
    parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1))
  } catch {
    throw new AIError('The AI did not return valid JSON. Retry or try another model.')
  }
  const check = ImportResultSchema.safeParse(parsed)
  if (!check.success) throw new AIError(`Unexpected response format: ${check.error.issues[0]?.message}`)

  const result: ImportResult = { ...check.data, modelName: sanitizeFileName(check.data.modelName) }
  return { result, notes: await buildPreview(vault, result) }
}

async function buildPreview(vault: Vault, result: ImportResult): Promise<ImportPreviewNote[]> {
  // Fusiona títulos duplicados dentro de la misma importación.
  const merged = new Map<string, ImportResult['notes'][number]>()
  for (const n of result.notes) {
    const title = sanitizeFileName(n.title)
    const key = normalizeKey(title)
    const prev = merged.get(key)
    if (prev) {
      prev.content += `\n\n${n.content}`
      prev.tags = [...new Set([...prev.tags, ...n.tags])]
      prev.aliases = [...new Set([...prev.aliases, ...n.aliases])]
    } else merged.set(key, { ...n, title })
  }

  const reserved = new Set<string>()
  const out: ImportPreviewNote[] = []
  for (const n of merged.values()) {
    const existingPath = vault.resolveLink(n.title)
    let targetPath = existingPath
    if (!targetPath) {
      targetPath = await vault.freePath(NOTE_TYPES[n.type].folder, n.title)
      for (let i = 2; reserved.has(targetPath); i++)
        targetPath = await vault.freePath(NOTE_TYPES[n.type].folder, `${n.title} ${i}`)
    }
    reserved.add(targetPath)
    out.push({ ...n, existingPath, targetPath })
  }
  return out
}

const today = () => new Date().toISOString().slice(0, 10)
const cleanTag = (t: string) => t.replace(/^#/, '').trim().toLowerCase().replace(/\s+/g, '-')

export async function saveImport(vault: Vault, req: SaveImportRequest): Promise<SaveImportResponse> {
  const { result, notes } = req
  const date = today()
  const model = sanitizeFileName(result.modelName)
  const modelLink = `[[${model}]]`

  // 1. Fuente original, para trazabilidad.
  const sourcePath = await vault.freePath(SOURCES_FOLDER, `${date} ${sanitizeFileName(req.sourceLabel || model)}`)
  const sourceTitle = basenameNoExt(sourcePath)
  await vault.write(
    sourcePath,
    serializeNote({ type: 'source', model: modelLink, created: date }, `# ${sourceTitle}\n\n${req.sourceText}\n`)
  )

  // 2. Notas atómicas.
  const created: string[] = []
  const updated: string[] = []
  const savedPath = new Map<(typeof notes)[number], string>()
  for (const n of notes) {
    const tags = [...new Set([`trading/${n.type}`, ...n.tags.map(cleanTag).filter(Boolean)])]
    if (n.existingPath && (await vault.exists(n.existingPath))) {
      const { data, body } = parseFrontmatter(await vault.read(n.existingPath))
      const merge = (k: string, extra: string[]) => {
        const cur = Array.isArray(data[k]) ? (data[k] as unknown[]).map(String) : []
        data[k] = [...new Set([...cur, ...extra])]
      }
      merge('tags', tags)
      merge('aliases', n.aliases)
      data.updated = date
      const addition = `\n\n## Update ${date}\n\n${n.content.trim()}\n\n_Source: [[${sourceTitle}]]_\n`
      await vault.write(n.existingPath, serializeNote(data, body.trimEnd() + addition))
      updated.push(n.existingPath)
      savedPath.set(n, n.existingPath)
    } else {
      // El título o el tipo pueden haberse editado en la vista previa.
      const path = await vault.freePath(NOTE_TYPES[n.type].folder, n.title)
      savedPath.set(n, path)
      const data = {
        type: n.type,
        model: modelLink,
        tags,
        aliases: n.aliases,
        summary: n.summary,
        created: date,
        source: `[[${sourceTitle}]]`
      }
      await vault.write(path, serializeNote(data, `# ${basenameNoExt(path)}\n\n${n.content.trim()}\n`))
      created.push(path)
    }
  }

  // 3. MOC del modelo.
  const titleOf = (n: (typeof notes)[number]) => basenameNoExt(savedPath.get(n)!)
  const sections = NOTE_TYPE_IDS.filter((t) => t !== 'model')
    .map((t) => {
      const items = notes.filter((n) => n.type === t)
      if (!items.length) return ''
      return `## ${NOTE_TYPES[t].label}\n\n${items.map((n) => `- [[${titleOf(n)}]] — ${n.summary}`).join('\n')}`
    })
    .filter(Boolean)
    .join('\n\n')
  const questions = result.openQuestions.length
    ? `## Open questions\n\n${result.openQuestions.map((q) => `- [ ] ${q}`).join('\n')}`
    : ''

  let mocPath = vault.resolveLink(model)
  if (mocPath) {
    const { data, body } = parseFrontmatter(await vault.read(mocPath))
    data.updated = date
    const addition = [`## Import ${date}`, result.overview, sections, questions, `Source: [[${sourceTitle}]]`]
      .filter(Boolean)
      .join('\n\n')
    await vault.write(mocPath, serializeNote(data, `${body.trimEnd()}\n\n${addition}\n`))
    updated.push(mocPath)
  } else {
    mocPath = await vault.freePath(NOTE_TYPES.model.folder, model)
    const body = [
      `# ${model}`,
      result.overview,
      sections,
      questions,
      `## Sources\n\n- [[${sourceTitle}]]`
    ]
      .filter(Boolean)
      .join('\n\n')
    await vault.write(
      mocPath,
      serializeNote({ type: 'model', tags: ['trading/model'], created: date }, body + '\n')
    )
    created.push(mocPath)
  }

  return { created, updated, mocPath }
}
