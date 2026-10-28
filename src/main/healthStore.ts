// Guardado y validación de la auditoría de salud (sin dependencias de Electron: también lo usa el servidor MCP).
import { z } from 'zod'
import { AUDIT_CRITERIA, HEALTH_FILE, type HealthAudit } from '@shared/health'
import type { Vault } from './vault'

const Cell = z.object({ status: z.enum(['defined', 'partial', 'missing']), comment: z.string() })

export const HealthAuditSchema = z.object({
  model: z.string(),
  summary: z.string(),
  score: z.number().min(0).max(100),
  setups: z.array(
    z.object({
      name: z.string(),
      note: z.string().nullable(),
      criteria: z.object(Object.fromEntries(AUDIT_CRITERIA.map((c) => [c.id, Cell])) as Record<(typeof AUDIT_CRITERIA)[number]['id'], typeof Cell>)
    })
  ),
  fixes: z.array(z.object({ title: z.string(), detail: z.string(), notes: z.array(z.string()) })),
  contradictions: z.array(z.object({ description: z.string(), notes: z.array(z.string()) }))
})

export async function saveHealthAudit(vault: Vault, audit: HealthAudit, generatedBy: string): Promise<HealthAudit> {
  const full: HealthAudit = { ...audit, score: Math.round(audit.score), generatedAt: new Date().toISOString(), generatedBy }
  await vault.write(HEALTH_FILE, JSON.stringify(full, null, 2))
  return full
}

export async function readHealthAudit(vault: Vault): Promise<HealthAudit | null> {
  try {
    return JSON.parse(await vault.read(HEALTH_FILE)) as HealthAudit
  } catch {
    return null
  }
}
