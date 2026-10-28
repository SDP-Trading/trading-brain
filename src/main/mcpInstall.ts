// Registro del servidor MCP de Trading Brain en Claude Desktop y Claude Code.
import { app, shell } from 'electron'
import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { McpStatus } from '@shared/types'

const SERVER_NAME = 'trading-brain'

/** Cómo arrancar el servidor: el binario de la propia app en modo Node, sin necesitar Node instalado. */
function launchSpec() {
  return {
    command: process.execPath,
    args: [join(__dirname, 'mcp.js')],
    env: {
      ELECTRON_RUN_AS_NODE: '1',
      TRADING_BRAIN_SETTINGS: join(app.getPath('userData'), 'settings.json')
    }
  }
}

function claudeDesktopConfigPath(): string {
  if (process.platform === 'darwin') return join(homedir(), 'Library/Application Support/Claude/claude_desktop_config.json')
  if (process.platform === 'win32') return join(process.env.APPDATA ?? join(homedir(), 'AppData/Roaming'), 'Claude/claude_desktop_config.json')
  return join(homedir(), '.config/Claude/claude_desktop_config.json')
}

async function readConfig(path: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await fs.readFile(path, 'utf8'))
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw new Error(`Could not read ${path}: it is not valid JSON. Fix or remove it and try again.`)
  }
}

const quote = (s: string) => `"${s.replace(/(["\\$`])/g, '\\$1')}"`

export async function mcpStatus(): Promise<McpStatus> {
  const spec = launchSpec()
  const configPath = claudeDesktopConfigPath()
  const desktopInstalled = await fs.stat(dirname(configPath)).then(
    () => true,
    () => false
  )
  let desktopConnected = false
  if (desktopInstalled) {
    const cfg = await readConfig(configPath).catch(() => ({}) as Record<string, unknown>)
    const entry = (cfg.mcpServers as Record<string, { command?: string; args?: string[] }> | undefined)?.[SERVER_NAME]
    desktopConnected = !!entry && entry.command === spec.command && entry.args?.[0] === spec.args[0]
  }
  const envFlags = Object.entries(spec.env)
    .map(([k, v]) => `-e ${k}=${quote(v)}`)
    .join(' ')
  const codexPath = codexConfigPath()
  const codexText = await fs.readFile(codexPath, 'utf8').catch(() => '')
  const chatgptInstalled =
    (await exists(codexPath)) || (await exists(dirname(codexPath))) || (await exists(CHATGPT_APP))
  const codexEnv = Object.entries(spec.env)
    .map(([k, v]) => `--env ${k}=${quote(v)}`)
    .join(' ')
  return {
    desktopInstalled,
    desktopConnected,
    desktopConfigPath: configPath,
    claudeCodeCommand: `claude mcp add ${SERVER_NAME} --scope user ${envFlags} -- ${quote(spec.command)} ${spec.args.map(quote).join(' ')}`,
    chatgptInstalled,
    chatgptConnected: findCodexBlock(codexText) != null && codexText.includes(tomlString(spec.command)),
    codexConfigPath: codexPath,
    codexCommand: `codex mcp add ${SERVER_NAME} ${codexEnv} -- ${quote(spec.command)} ${spec.args.map(quote).join(' ')}`
  }
}

/** Añade (o actualiza) la entrada en claude_desktop_config.json, conservando el resto y con copia de seguridad. */
export async function connectClaudeDesktop(): Promise<McpStatus> {
  const path = claudeDesktopConfigPath()
  const cfg = await readConfig(path)
  await fs.mkdir(dirname(path), { recursive: true })
  if (Object.keys(cfg).length) await fs.writeFile(path + '.bak', JSON.stringify(cfg, null, 2), 'utf8')
  const servers = { ...((cfg.mcpServers as Record<string, unknown>) ?? {}), [SERVER_NAME]: launchSpec() }
  await fs.writeFile(path, JSON.stringify({ ...cfg, mcpServers: servers }, null, 2), 'utf8')
  return mcpStatus()
}

export async function disconnectClaudeDesktop(): Promise<McpStatus> {
  const path = claudeDesktopConfigPath()
  const cfg = await readConfig(path)
  const servers = { ...((cfg.mcpServers as Record<string, unknown>) ?? {}) }
  if (SERVER_NAME in servers) {
    delete servers[SERVER_NAME]
    await fs.writeFile(path, JSON.stringify({ ...cfg, mcpServers: servers }, null, 2), 'utf8')
  }
  return mcpStatus()
}

/** Abre Claude Desktop. */
export async function openClaudeDesktop(): Promise<boolean> {
  if (process.platform === 'darwin')
    return new Promise((res) => execFile('open', ['-b', 'com.anthropic.claudefordesktop'], (err) => res(!err)))
  return shell.openExternal('claude://').then(
    () => true,
    () => false
  )
}

// ---------- ChatGPT desktop / Codex (~/.codex/config.toml) ----------

const CHATGPT_APP = '/Applications/ChatGPT.app'
const exists = (p: string) =>
  fs.access(p).then(
    () => true,
    () => false
  )

function codexConfigPath(): string {
  return join(process.env.CODEX_HOME ?? join(homedir(), '.codex'), 'config.toml')
}

const tomlString = (s: string) => JSON.stringify(s) // las cadenas JSON son cadenas básicas TOML válidas

/** Rango de líneas del bloque [mcp_servers.trading-brain] (y sus subtablas), o null. */
function findCodexBlock(text: string): [number, number] | null {
  const lines = text.split('\n')
  const header = /^\s*\[mcp_servers\.("trading-brain"|trading-brain)(\.[^\]]+)?\]\s*(#.*)?$/
  const start = lines.findIndex((l) => header.test(l))
  if (start < 0) return null
  let end = start + 1
  while (end < lines.length && !(/^\s*\[/.test(lines[end]) && !header.test(lines[end]))) end++
  return [start, end]
}

function withoutCodexBlock(text: string): string {
  let out = text
  for (let range = findCodexBlock(out); range; range = findCodexBlock(out)) {
    const lines = out.split('\n')
    lines.splice(range[0], range[1] - range[0])
    out = lines.join('\n')
  }
  return out.replace(/\n{3,}/g, '\n\n')
}

/** Edita el TOML como texto para conservar comentarios y formato; solo toca el bloque de Trading Brain. */
export async function connectChatGPT(): Promise<McpStatus> {
  const path = codexConfigPath()
  const current = await fs.readFile(path, 'utf8').catch(() => '')
  await fs.mkdir(dirname(path), { recursive: true })
  if (current) await fs.writeFile(path + '.bak', current, 'utf8')
  const spec = launchSpec()
  const env = Object.entries(spec.env)
    .map(([k, v]) => `${k} = ${tomlString(v)}`)
    .join(', ')
  const block = [
    `[mcp_servers.${SERVER_NAME}]`,
    `command = ${tomlString(spec.command)}`,
    `args = [${spec.args.map(tomlString).join(', ')}]`,
    `env = { ${env} }`
  ].join('\n')
  const base = withoutCodexBlock(current).trimEnd()
  await fs.writeFile(path, (base ? base + '\n\n' : '') + block + '\n', 'utf8')
  return mcpStatus()
}

export async function disconnectChatGPT(): Promise<McpStatus> {
  const path = codexConfigPath()
  const current = await fs.readFile(path, 'utf8').catch(() => '')
  if (findCodexBlock(current)) await fs.writeFile(path, withoutCodexBlock(current).trimEnd() + '\n', 'utf8')
  return mcpStatus()
}
