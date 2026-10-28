// Auditoría de salud del modelo hecha por IA (la IA de la app o Claude/ChatGPT vía MCP).
// Se guarda en el vault para que la vista la muestre.

export const HEALTH_FILE = '.trading-brain/health.json'

export const AUDIT_CRITERIA = [
  { id: 'context', label: 'Context', hint: 'When the setup applies: HTF context, bias, session, market conditions' },
  { id: 'entry', label: 'Entry', hint: 'Exact, checkable entry trigger' },
  { id: 'stop', label: 'Stop', hint: 'Where the stop goes and why' },
  { id: 'target', label: 'Target', hint: 'Take-profit / exit rules' },
  { id: 'invalidation', label: 'Invalidation', hint: 'What cancels the setup / when not to trade it' },
  { id: 'risk', label: 'Risk', hint: 'Risk per trade, sizing, R:R' },
  { id: 'example', label: 'Example', hint: 'At least one concrete example or trade' }
] as const

export type AuditCriterion = (typeof AUDIT_CRITERIA)[number]['id']
export type AuditStatus = 'defined' | 'partial' | 'missing'

export interface HealthAudit {
  model: string
  summary: string
  /** 0-100 */
  score: number
  setups: {
    name: string
    /** Título exacto de la nota principal del setup, o null. */
    note: string | null
    criteria: Record<AuditCriterion, { status: AuditStatus; comment: string }>
  }[]
  /** Mejoras concretas, de más a menos importantes. */
  fixes: { title: string; detail: string; notes: string[] }[]
  contradictions: { description: string; notes: string[] }[]
  /** Metadatos que añade la app al guardar. */
  generatedAt?: string
  generatedBy?: string
}

export const HEALTH_INSTRUCTIONS = `Audit how well the trading model in the notes is defined, as an experienced trading coach would.
- Identify the actual setups / entry models of the trading model (not every concept note). For each one, rate the criteria: ${AUDIT_CRITERIA.map((c) => `${c.id} (${c.hint})`).join('; ')}.
- status: "defined" = explicit and checkable; "partial" = mentioned but vague, incomplete or scattered; "missing" = not in the notes. The comment explains why in one short sentence and names the note where it is (or should be).
- note: the EXACT title of the setup's main note, or null.
- score: 0-100 for the whole model's completeness and consistency.
- fixes: the most valuable improvements first (max 8), each with the exact titles of the notes involved. Mention notes that are empty stubs.
- contradictions: rules that conflict between notes (with the note titles). Empty array if none.
- summary: 2-4 sentences on the state of the model.
Only judge what the notes say; do not invent rules. Write in the language of the notes.`

const str = { type: 'string' }
const status = { type: 'string', enum: ['defined', 'partial', 'missing'] }
const cell = { type: 'object', additionalProperties: false, required: ['status', 'comment'], properties: { status, comment: str } }

export const HEALTH_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['model', 'summary', 'score', 'setups', 'fixes', 'contradictions'],
  properties: {
    model: str,
    summary: str,
    score: { type: 'number' },
    setups: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'note', 'criteria'],
        properties: {
          name: str,
          note: { anyOf: [str, { type: 'null' }] },
          criteria: {
            type: 'object',
            additionalProperties: false,
            required: AUDIT_CRITERIA.map((c) => c.id),
            properties: Object.fromEntries(AUDIT_CRITERIA.map((c) => [c.id, cell]))
          }
        }
      }
    },
    fixes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'detail', 'notes'],
        properties: { title: str, detail: str, notes: { type: 'array', items: str } }
      }
    },
    contradictions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['description', 'notes'],
        properties: { description: str, notes: { type: 'array', items: str } }
      }
    }
  }
}

export const MCP_HEALTH_PROMPT =
  'Using my Trading Brain vault, audit the health of my trading model: call get_model_overview, read the key setup notes, then save the audit with save_model_health.'
