// Matriz de salud del modelo: qué partes de cada setup están definidas en las notas. Sin IA.
import type { HealthCriterion, HealthReport, HealthRow } from '@shared/types'
import { SOURCES_FOLDER } from '@shared/types'
import { splitFrontmatter } from '@shared/markdown'
import type { Vault } from './vault'

export const HEALTH_CRITERIA: { id: HealthCriterion; label: string; re: RegExp }[] = [
  { id: 'context', label: 'Context', re: /\b(context|contexto|htf|higher time ?frame|bias|sesgo|market structure|estructura)\b/i },
  { id: 'entry', label: 'Entry', re: /\b(entry|entries|entrada|enter|trigger|gatillo)\b/i },
  { id: 'stop', label: 'Stop', re: /\b(stop[ -]?loss|stop|sl)\b/i },
  { id: 'target', label: 'Target', re: /\b(targets?|take[ -]?profit|tp\d?|objetivos?|exit|salida)\b/i },
  { id: 'invalidation', label: 'Invalidation', re: /\b(invalidat\w*|invalida\w*|no[- ]trade|don'?t trade|avoid|evitar)\b/i },
  { id: 'risk', label: 'Risk', re: /\b(risk|riesgo|position siz\w*|lot size|\d+(\.\d+)?\s?%|r:r|rr|\d+(\.\d+)?r)\b/i },
  { id: 'example', label: 'Example', re: /\b(examples?|ejemplos?|case study|trade review)\b|!\[\[[^\]]+\.(png|jpe?g|gif|webp)/i }
]

/** Notas que se analizan: las de tipo setup, o las de una carpeta (incluye subcarpetas). */
export async function healthReport(vault: Vault, scope?: string): Promise<HealthReport> {
  const entries = vault.entries().filter((e) => !e.path.startsWith(SOURCES_FOLDER + '/'))
  const folders = [...new Set(entries.flatMap((e) => {
    const parts = e.path.split('/').slice(0, -1)
    return parts.map((_, i) => parts.slice(0, i + 1).join('/'))
  }))].sort()
  const hasSetups = entries.some((e) => e.type === 'setup')

  // Por defecto: los setups, o la carpeta de primer nivel con más notas.
  let chosen = scope
  if (!chosen) {
    if (hasSetups) chosen = 'type:setup'
    else {
      const count = new Map<string, number>()
      for (const e of entries) {
        const top = e.path.includes('/') ? e.path.split('/')[0] : ''
        if (top) count.set(top, (count.get(top) ?? 0) + 1)
      }
      chosen = [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
    }
  }
  const selected =
    chosen === 'type:setup'
      ? entries.filter((e) => e.type === 'setup')
      : entries.filter((e) => (chosen ? e.path.startsWith(chosen + '/') : !e.path.includes('/')))

  const rows: HealthRow[] = []
  for (const e of selected) {
    const { body } = splitFrontmatter(await vault.read(e.path).catch(() => ''))
    const headings = body
      .split('\n')
      .filter((l) => /^#{1,6}\s/.test(l))
      .join('\n')
    // Los títulos de las notas enlazadas cuentan como "mencionado" (p. ej. un enlace a [[Stop Loss Placement]]).
    const linked = e.links.join('\n')
    const cells = {} as HealthRow['cells']
    for (const c of HEALTH_CRITERIA) {
      cells[c.id] = c.re.test(headings) ? 2 : c.re.test(body) || c.re.test(linked) ? 1 : 0
    }
    const score = Object.values(cells).reduce<number>((n, v) => n + v, 0) / (HEALTH_CRITERIA.length * 2)
    const words = body
      .split('\n')
      .filter((l) => !/^#{1,6}\s/.test(l))
      .join(' ')
      .replace(/\[\[[^\]]*\]\]|[⬆#*_>`-]/g, ' ')
      .split(/\s+/)
      .filter(Boolean).length
    rows.push({ path: e.path, title: e.title, type: e.type, cells, score, empty: words < 12 })
  }
  rows.sort((a, b) => a.score - b.score || a.title.localeCompare(b.title))
  return {
    scope: chosen ?? '',
    scopes: [...(hasSetups ? ['type:setup'] : []), ...folders],
    criteria: HEALTH_CRITERIA.map(({ id, label }) => ({ id, label })),
    rows
  }
}
