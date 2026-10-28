import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import type { ChatMessage, Effort, OllamaStatus, ProviderId } from '@shared/types'
import { getApiKey, getSettings } from '../settings'
import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface LLMRequest {
  /** Instrucciones estables. */
  system: string
  /** Contexto grande (p. ej. el vault). Va tras el system y se cachea en Claude. */
  context?: string
  messages: ChatMessage[]
  /** Si se indica, se exige una respuesta JSON que cumpla el esquema. */
  jsonSchema?: { name: string; schema: Record<string, unknown> }
  effort?: Effort
  signal?: AbortSignal
  onText?: (delta: string) => void
}

export class AIError extends Error {}

/** Prefijo para errores de configuración: el renderer muestra un botón para abrir Settings. */
const CONFIG = '[config] '
const notConfigured = (what: string) =>
  new AIError(`${CONFIG}${what} Add it in Settings, or use Claude Desktop through "Use with Claude" (no API key needed).`)

export async function complete(req: LLMRequest): Promise<string> {
  const s = await getSettings()
  const model = s.models[s.provider]
  if (!model) throw notConfigured(`No model is set for ${s.provider}.`)
  switch (s.provider) {
    case 'anthropic':
      return completeAnthropic(model, req.effort ?? s.effort, req)
    case 'openai':
    case 'ollama':
      return completeOpenAICompatible(s.provider, model, s.ollamaBaseUrl, req)
  }
}

// ---------- Claude (SDK oficial de Anthropic) ----------

// Modelos que admiten `output_config.effort` y el fallback de servidor `"default"`.
const supportsEffort = (m: string) => /opus|sonnet-5|sonnet-4-6|fable|mythos/.test(m)
const supportsDefaultFallback = (m: string) =>
  ['claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5', 'claude-fable-5-1'].includes(m)

async function anthropicClient(): Promise<Anthropic> {
  const apiKey = await getApiKey('anthropic')
  // Sin clave guardada, el SDK resuelve ANTHROPIC_API_KEY o el perfil de `ant auth login`.
  return apiKey ? new Anthropic({ apiKey }) : new Anthropic()
}

async function completeAnthropic(model: string, effort: Effort, req: LLMRequest): Promise<string> {
  let client: Anthropic
  try {
    client = await anthropicClient()
  } catch (err) {
    throw translateAnthropicError(err)
  }

  const system: Anthropic.Beta.BetaTextBlockParam[] = [{ type: 'text', text: req.system }]
  if (req.context) system.push({ type: 'text', text: req.context })
  system[system.length - 1].cache_control = { type: 'ephemeral' }

  const fallback = supportsDefaultFallback(model)
  try {
    const stream = client.beta.messages.stream(
      {
        model,
        max_tokens: 64000,
        system,
        messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
        output_config: {
          ...(supportsEffort(model) ? { effort } : {}),
          ...(req.jsonSchema ? { format: { type: 'json_schema', schema: req.jsonSchema.schema } } : {})
        },
        ...(fallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {})
      },
      { signal: req.signal }
    )
    if (req.onText) stream.on('text', (delta) => req.onText!(delta))
    const msg = await stream.finalMessage()

    if (msg.stop_reason === 'refusal') {
      const why = msg.stop_details?.explanation ?? msg.stop_details?.category ?? 'no details'
      throw new AIError(`The model declined the request (${why}).`)
    }
    if (msg.stop_reason === 'max_tokens' && req.jsonSchema)
      throw new AIError('The response was cut off for length. Try importing the text in smaller parts.')

    return msg.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
  } catch (err) {
    throw translateAnthropicError(err)
  }
}

function translateAnthropicError(err: unknown): Error {
  if (err instanceof AIError) return err
  if (err instanceof Anthropic.APIUserAbortError) return new AIError('Cancelled')
  if (err instanceof Anthropic.AuthenticationError) return notConfigured('Your Anthropic API key is invalid or expired.')
  if (err instanceof Anthropic.PermissionDeniedError) return new AIError('This API key does not have access to this model.')
  if (err instanceof Anthropic.NotFoundError) return new AIError('Claude model not found. Check the model ID in Settings.')
  if (err instanceof Anthropic.RateLimitError) return new AIError('Rate limit reached. Wait a moment and try again.')
  if (err instanceof Anthropic.BadRequestError) return new AIError(`Invalid request: ${err.message}`)
  if (err instanceof Anthropic.APIConnectionError) return new AIError('Could not connect to the Anthropic API.')
  if (err instanceof Anthropic.APIError) return new AIError(`API error (${err.status}): ${err.message}`)
  if (err instanceof Error && /credentials|api key/i.test(err.message))
    return notConfigured('There is no Anthropic API key.')
  return err instanceof Error ? err : new Error(String(err))
}

// ---------- OpenAI y Ollama (API compatible con OpenAI) ----------

async function completeOpenAICompatible(
  provider: Exclude<ProviderId, 'anthropic'>,
  model: string,
  ollamaBaseUrl: string,
  req: LLMRequest
): Promise<string> {
  const apiKey = provider === 'ollama' ? 'ollama' : ((await getApiKey('openai')) ?? process.env.OPENAI_API_KEY)
  if (!apiKey) throw notConfigured('There is no OpenAI API key.')
  const client =
    provider === 'ollama'
      ? new OpenAI({ baseURL: ollamaBaseUrl.replace(/\/+$/, '') + '/v1', apiKey })
      : new OpenAI({ apiKey })

  const system = req.context ? `${req.system}\n\n${req.context}` : req.system
  try {
    const stream = await client.chat.completions.create(
      {
        model,
        stream: true,
        messages: [{ role: 'system', content: system }, ...req.messages],
        ...(req.jsonSchema
          ? {
              response_format: {
                type: 'json_schema' as const,
                json_schema: { name: req.jsonSchema.name, schema: req.jsonSchema.schema, strict: true }
              }
            }
          : {})
      },
      { signal: req.signal }
    )
    let text = ''
    let finish: string | null = null
    for await (const chunk of stream) {
      const choice = chunk.choices[0]
      const delta = choice?.delta?.content
      if (delta) {
        text += delta
        req.onText?.(delta)
      }
      if (choice?.finish_reason) finish = choice.finish_reason
    }
    if (finish === 'length' && req.jsonSchema)
      throw new AIError('The response was cut off for length. Try importing the text in smaller parts.')
    return text
  } catch (err) {
    if (err instanceof AIError) throw err
    if (err instanceof OpenAI.APIUserAbortError) throw new AIError('Cancelled')
    if (err instanceof OpenAI.AuthenticationError) throw notConfigured('Your OpenAI API key is invalid or expired.')
    if (err instanceof OpenAI.APIConnectionError)
      throw new AIError(
        provider === 'ollama' ? `Could not connect to Ollama at ${ollamaBaseUrl}. Is it running?` : 'Could not connect to OpenAI.'
      )
    if (err instanceof OpenAI.APIError) throw new AIError(`${provider} error (${err.status}): ${err.message}`)
    throw err
  }
}

/** Petición mínima para comprobar la configuración. */
export async function testConnection(): Promise<string> {
  const s = await getSettings()
  const out = await complete({
    system: 'Reply with the single word OK.',
    messages: [{ role: 'user', content: 'Say OK.' }],
    effort: 'low'
  })
  return `${s.provider} · ${s.models[s.provider]} → ${out.trim().slice(0, 40)}`
}

/** Si el chat integrado puede funcionar con el proveedor actual (sin hacer ninguna llamada). */
export async function isConfigured(): Promise<boolean> {
  const s = await getSettings()
  if (!s.models[s.provider]) return false
  if (s.provider === 'ollama') return true
  if (s.provider === 'openai') return !!((await getApiKey('openai')) ?? process.env.OPENAI_API_KEY)
  if ((await getApiKey('anthropic')) || process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return true
  // Perfil OAuth de `ant auth login` (el SDK lo usa automáticamente).
  const dir = process.env.ANTHROPIC_CONFIG_DIR ?? join(homedir(), '.config/anthropic')
  return fs.readdir(join(dir, 'credentials')).then(
    (files) => files.some((f) => f.endsWith('.json')),
    () => false
  )
}

// ---------- Ollama ----------

const ollamaUrl = async (path: string) => (await getSettings()).ollamaBaseUrl.replace(/\/+$/, '') + path

export async function ollamaStatus(): Promise<OllamaStatus> {
  try {
    const res = await fetch(await ollamaUrl('/api/tags'), { signal: AbortSignal.timeout(2000) })
    if (!res.ok) return { running: false, models: [] }
    const data = (await res.json()) as { models?: { name: string }[] }
    return { running: true, models: (data.models ?? []).map((m) => m.name) }
  } catch {
    return { running: false, models: [] }
  }
}

/** Descarga un modelo con `POST /api/pull`, informando del progreso (0-1). */
export async function ollamaPull(model: string, onProgress: (p: number, status: string) => void): Promise<void> {
  const res = await fetch(await ollamaUrl('/api/pull'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, stream: true })
  })
  if (!res.ok || !res.body) throw new AIError(`Ollama could not download "${model}" (${res.status}).`)
  const decoder = new TextDecoder()
  let buf = ''
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    buf += decoder.decode(chunk, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line) continue
      const ev = JSON.parse(line) as { status?: string; total?: number; completed?: number; error?: string }
      if (ev.error) throw new AIError(`Ollama: ${ev.error}`)
      onProgress(ev.total ? (ev.completed ?? 0) / ev.total : 0, ev.status ?? '')
    }
  }
}
