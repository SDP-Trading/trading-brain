import type { ChatMessage } from '@shared/types'
import { SOURCES_FOLDER } from '@shared/types'
import { complete } from './providers'
import { tokenize, type Vault } from '../vault'
import { getSettings } from '../settings'

const SYSTEM = `You are the assistant for the user's "trading brain": an Obsidian vault with their trading model (setups, rules, risk management, psychology…).

- Answer based on the vault notes included below. If the answer is not in the notes, say so clearly and distinguish between what their model says and your general opinion.
- Cite the notes you use with [[Exact Title]] so the user can open them.
- If you spot contradictions or gaps in the model, point them out.
- Be concrete and actionable. Reply in the user's language. Use Markdown.
- Do not give personalized financial advice; help the user understand and apply their own model.`

/**
 * Elige qué notas enviar. Si todo el vault cabe en el presupuesto se envía completo
 * (orden estable para aprovechar la caché de prompts); si no, se priorizan la nota abierta,
 * los MOC de modelos y las notas más relevantes para la pregunta.
 */
export async function buildContext(vault: Vault, question: string, currentPath: string | null, budget: number) {
  const entries = vault.entries().filter((e) => !e.path.startsWith(SOURCES_FOLDER + '/'))
  const total = entries.reduce((n, e) => n + e.size, 0)

  let selected = entries
  if (total > budget) {
    const terms = tokenize(question)
    const scored = await Promise.all(
      entries.map(async (e) => {
        let score = e.type === 'model' ? 50 : 0
        if (e.path === currentPath) score += 1000
        const text = (await vault.read(e.path).catch(() => '')).toLowerCase()
        for (const t of terms) {
          if (e.title.toLowerCase().includes(t)) score += 20
          score += Math.min(10, text.split(t).length - 1)
        }
        return { e, score }
      })
    )
    let used = 0
    selected = []
    for (const { e, score } of scored.sort((a, b) => b.score - a.score)) {
      if (score <= 0 && selected.length > 0) break
      if (used + e.size > budget) continue
      selected.push(e)
      used += e.size
    }
    selected.sort((a, b) => a.path.localeCompare(b.path))
  }

  const parts: string[] = []
  for (const e of selected) {
    const text = await vault.read(e.path).catch(() => '')
    parts.push(`<note path="${e.path}" title="${e.title}">\n${text}\n</note>`)
  }
  const header =
    selected.length < entries.length
      ? `Including ${selected.length} of ${entries.length} notes (the most relevant ones).`
      : `Including all ${entries.length} notes in the vault.`
  return `# Vault notes\n${header}\n\n${parts.join('\n\n')}`
}

export async function chat(
  vault: Vault,
  messages: ChatMessage[],
  currentPath: string | null,
  signal: AbortSignal,
  onText: (d: string) => void
): Promise<string> {
  const s = await getSettings()
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''
  const context = await buildContext(vault, lastUser, currentPath, s.chatContextChars)
  const current = currentPath ? `\n\nCurrently open note: ${currentPath}` : ''
  const withCurrent = [...messages]
  if (current && withCurrent.length) {
    const last = withCurrent[withCurrent.length - 1]
    withCurrent[withCurrent.length - 1] = { ...last, content: last.content + current }
  }
  return complete({ system: SYSTEM, context, messages: withCurrent, signal, onText })
}
