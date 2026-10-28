import { HEALTH_INSTRUCTIONS, HEALTH_JSON_SCHEMA, type HealthAudit } from '@shared/health'
import { HealthAuditSchema, saveHealthAudit } from '../healthStore'
import { complete, AIError } from './providers'
import { buildContext } from './chat'
import { getSettings } from '../settings'
import type { Vault } from '../vault'

export async function generateHealthAudit(vault: Vault, signal: AbortSignal): Promise<HealthAudit> {
  const s = await getSettings()
  const context = await buildContext(vault, 'setup entry stop target invalidation risk example rules', null, s.chatContextChars)
  const raw = await complete({
    system: `You are a trading coach reviewing a student's trading model. ${HEALTH_INSTRUCTIONS}\nReply only with JSON that matches the schema.`,
    context,
    messages: [{ role: 'user', content: 'Audit the health of my trading model.' }],
    jsonSchema: { name: 'trading_model_health', schema: HEALTH_JSON_SCHEMA },
    signal
  })
  let parsed: unknown
  try {
    parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1))
  } catch {
    throw new AIError('The AI did not return a valid audit. Try again.')
  }
  const check = HealthAuditSchema.safeParse(parsed)
  if (!check.success) throw new AIError(`Unexpected audit format: ${check.error.issues[0]?.message}`)
  return saveHealthAudit(vault, check.data as HealthAudit, `${s.provider} · ${s.models[s.provider]}`)
}
