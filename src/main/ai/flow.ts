import { z } from 'zod'
import { FLOW_INSTRUCTIONS, flowToCanvas, serializeCanvas, type FlowSpec } from '@shared/canvas'
import { complete, AIError } from './providers'
import { buildContext } from './chat'
import { getSettings } from '../settings'
import type { Vault } from '../vault'

const KINDS = ['start', 'decision', 'step', 'action', 'end'] as const
const str = { type: 'string' }

const FLOW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'nodes', 'edges'],
  properties: {
    title: str,
    nodes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'label', 'kind', 'note'],
        properties: {
          id: str,
          label: str,
          kind: { type: 'string', enum: KINDS },
          note: { anyOf: [{ type: 'string' }, { type: 'null' }] }
        }
      }
    },
    edges: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['from', 'to', 'label'],
        properties: { from: str, to: str, label: { anyOf: [{ type: 'string' }, { type: 'null' }] } }
      }
    }
  }
}

const FlowSchema = z.object({
  title: z.string().min(1),
  nodes: z.array(z.object({ id: z.string(), label: z.string(), kind: z.enum(KINDS), note: z.string().nullable() })).min(2),
  edges: z.array(z.object({ from: z.string(), to: z.string(), label: z.string().nullable() }))
})

export async function generateFlow(vault: Vault, signal: AbortSignal, focus?: string): Promise<{ path: string; spec: FlowSpec }> {
  const s = await getSettings()
  const context = await buildContext(vault, focus || 'entry setup stop target invalidation bias context', null, s.chatContextChars)
  const raw = await complete({
    system: `You are a trading analyst. ${FLOW_INSTRUCTIONS}\nReply only with JSON that matches the schema.`,
    context,
    messages: [{ role: 'user', content: focus ? `Build the flow for: ${focus}` : 'Build the decision flow of my trading model.' }],
    jsonSchema: { name: 'trading_model_flow', schema: FLOW_SCHEMA },
    signal
  })
  let parsed: unknown
  try {
    parsed = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1))
  } catch {
    throw new AIError('The AI did not return a valid flow. Try again.')
  }
  const check = FlowSchema.safeParse(parsed)
  if (!check.success) throw new AIError(`Unexpected flow format: ${check.error.issues[0]?.message}`)
  const spec = check.data as FlowSpec
  const path = await vault.createCanvas('Flows', `${spec.title}`, serializeCanvas(flowToCanvas(spec)))
  return { path, spec }
}
