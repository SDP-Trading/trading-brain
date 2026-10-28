import { app, safeStorage } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { basename } from 'node:path'
import type { PublicSettings, Settings, VaultRef } from '@shared/types'

type KeyProvider = 'anthropic' | 'openai'

interface StoredSettings extends Settings {
  /** API keys cifradas con safeStorage (base64). */
  keys: Partial<Record<KeyProvider, string>>
}

const DEFAULTS: StoredSettings = {
  provider: 'anthropic',
  models: { anthropic: 'claude-opus-5-5', openai: 'gpt-5', ollama: 'llama3.1' },
  ollamaBaseUrl: 'http://localhost:11434',
  effort: 'high',
  chatContextChars: 300_000,
  lastVault: null,
  vaults: [],
  theme: 'system',
  onboarded: false,
  keys: {}
}

const file = () => join(app.getPath('userData'), 'settings.json')
let cache: StoredSettings | null = null

async function load(): Promise<StoredSettings> {
  if (cache) return cache
  try {
    const raw = JSON.parse(await fs.readFile(file(), 'utf8'))
    cache = { ...DEFAULTS, ...raw, models: { ...DEFAULTS.models, ...raw.models }, keys: raw.keys ?? {} }
    // Ajustes de versiones anteriores: solo había un vault (lastVault).
    if (cache!.lastVault && !cache!.vaults.some((v) => v.path === cache!.lastVault))
      cache!.vaults = [...cache!.vaults, { path: cache!.lastVault, name: basename(cache!.lastVault) }]
  } catch {
    cache = structuredClone(DEFAULTS)
  }
  return cache!
}

async function save(s: StoredSettings): Promise<void> {
  cache = s
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  await fs.writeFile(file(), JSON.stringify(s, null, 2), { encoding: 'utf8', mode: 0o600 })
}

export async function getSettings(): Promise<Settings> {
  const { keys: _keys, ...rest } = await load()
  return rest
}

export async function getPublicSettings(): Promise<PublicSettings> {
  const s = await load()
  const { keys, ...rest } = s
  return { ...rest, hasKey: { anthropic: !!keys.anthropic, openai: !!keys.openai } }
}

export async function updateSettings(patch: Partial<Settings>): Promise<PublicSettings> {
  const s = await load()
  await save({ ...s, ...patch, models: { ...s.models, ...(patch.models ?? {}) } })
  return getPublicSettings()
}

export async function setApiKey(provider: KeyProvider, key: string): Promise<PublicSettings> {
  const s = await load()
  const keys = { ...s.keys }
  if (!key.trim()) delete keys[provider]
  else if (safeStorage.isEncryptionAvailable())
    keys[provider] = 'enc:' + safeStorage.encryptString(key.trim()).toString('base64')
  else keys[provider] = 'raw:' + key.trim()
  await save({ ...s, keys })
  return getPublicSettings()
}

export async function getApiKey(provider: KeyProvider): Promise<string | undefined> {
  const stored = (await load()).keys[provider]
  if (!stored) return undefined
  if (stored.startsWith('enc:')) return safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'))
  return stored.slice(4)
}

/** Añade el vault a la lista (si no estaba) y lo marca como el último abierto. */
export async function rememberVault(path: string): Promise<void> {
  const s = await load()
  const vaults: VaultRef[] = s.vaults.some((v) => v.path === path) ? s.vaults : [...s.vaults, { path, name: basename(path) }]
  await save({ ...s, vaults, lastVault: path })
}

export async function forgetVault(path: string): Promise<void> {
  const s = await load()
  await save({ ...s, vaults: s.vaults.filter((v) => v.path !== path), lastVault: s.lastVault === path ? null : s.lastVault })
}
