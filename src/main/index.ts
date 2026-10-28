import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } from 'electron'
import { promises as fs } from 'node:fs'
import { basename, dirname, join, resolve, sep } from 'node:path'
import type { ChatMessage, SaveImportRequest, Settings } from '@shared/types'
import { Vault } from './vault'
import { forgetVault, getPublicSettings, getSettings, rememberVault, setApiKey, updateSettings } from './settings'
import { organize, saveImport } from './ai/organizer'
import { chat } from './ai/chat'
import { generateFlow } from './ai/flow'
import { healthReport } from './health'
import { generateHealthAudit } from './ai/healthAudit'
import { readHealthAudit } from './healthStore'
import { isConfigured, ollamaPull, ollamaStatus, testConnection } from './ai/providers'
import {
  connectChatGPT,
  connectClaudeDesktop,
  disconnectChatGPT,
  disconnectClaudeDesktop,
  mcpStatus,
  openClaudeDesktop
} from './mcpInstall'

let win: BrowserWindow | null = null
const vault = new Vault(async () => win?.webContents.send('vault:changed', await vault.state()))
const requests = new Map<string, AbortController>()

// Mismos valores que --background en styles.css, para que no haya destello al abrir.
const windowBackground = () => (nativeTheme.shouldUseDarkColors ? '#09090b' : '#ffffff')

function createWindow(): void {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: windowBackground(),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    title: 'Trading Brain',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  // Los enlaces externos se abren en el navegador, nunca dentro de la app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win?.webContents.getURL()) {
      e.preventDefault()
      if (/^https?:/.test(url)) shell.openExternal(url)
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

async function openVault(path: string) {
  await vault.open(path)
  await rememberVault(vault.root!)
  return vault.state()
}

function registerIpc(): void {
  const state = () => vault.state()

  // ---- Vault ----
  ipcMain.handle('vault:select', async () => {
    const res = await dialog.showOpenDialog(win!, {
      title: 'Choose or create the vault folder',
      properties: ['openDirectory', 'createDirectory']
    })
    if (res.canceled || !res.filePaths[0]) return null
    return openVault(res.filePaths[0])
  })
  ipcMain.handle('vault:open', (_e, path: string) => openVault(path))
  ipcMain.handle('vault:list', async () => {
    const { vaults } = await getSettings()
    return Promise.all(
      vaults.map(async (v) => ({
        ...v,
        exists: await fs.stat(v.path).then((s) => s.isDirectory(), () => false),
        current: v.path === vault.root
      }))
    )
  })
  ipcMain.handle('vault:forget', async (_e, path: string) => {
    await forgetVault(path)
    if (path === vault.root) vault.close()
    return state()
  })
  ipcMain.handle('vault:state', state)
  ipcMain.handle('vault:reveal', () => vault.root && shell.openPath(vault.root))

  // ---- Notas ----
  ipcMain.handle('notes:read', (_e, path: string) => vault.read(path))
  ipcMain.handle('notes:write', async (_e, path: string, content: string, root?: string) => {
    // Un autoguardado pendiente puede llegar después de cambiar de vault: se escribe en el suyo.
    if (root && root !== vault.root) {
      const { vaults } = await getSettings()
      if (!vaults.some((v) => v.path === root)) throw new Error('Unknown vault')
      const abs = resolve(root, path)
      if (!abs.startsWith(resolve(root) + sep)) throw new Error('Path is outside the vault')
      await fs.mkdir(dirname(abs), { recursive: true })
      await fs.writeFile(abs, content, 'utf8')
      return state()
    }
    await vault.write(path, content)
    return state()
  })
  ipcMain.handle('notes:create', async (_e, folder: string, title: string) => {
    const path = await vault.createNote(folder, title)
    return { path, state: await state() }
  })
  ipcMain.handle('notes:createFolder', async (_e, path: string) => {
    await vault.createFolder(path)
    return state()
  })
  ipcMain.handle('notes:delete', async (_e, path: string) => {
    const trash = await vault.delete(path)
    return { trash, state: await state() }
  })
  ipcMain.handle('notes:restore', async (_e, trash: string, path: string) => {
    await vault.restore(trash, path)
    return state()
  })
  ipcMain.handle('notes:reveal', (_e, path: string) => shell.showItemInFolder(vault.abs(path)))
  ipcMain.handle('notes:rename', async (_e, path: string, newName: string) => {
    const newPath = await vault.rename(path, newName)
    return { path: newPath, state: await state() }
  })
  ipcMain.handle('notes:resolve', (_e, target: string) => vault.resolveLink(target))
  ipcMain.handle('notes:backlinks', (_e, path: string) => vault.backlinks(path))
  ipcMain.handle('notes:search', (_e, q: string) => vault.search(q))
  ipcMain.handle('notes:graph', () => vault.graph())

  // ---- Vistas: canvas, salud, flujo ----
  ipcMain.handle('canvas:read', (_e, path: string) => vault.read(path))
  ipcMain.handle('canvas:write', async (_e, path: string, content: string) => {
    await vault.write(path, content)
  })
  ipcMain.handle('canvas:create', async (_e, folder: string, title: string) => {
    const path = await vault.createCanvas(folder, title)
    return { path, state: await state() }
  })
  ipcMain.handle('views:health', (_e, scope?: string) => healthReport(vault, scope))
  ipcMain.handle('views:healthAudit', () => (vault.root ? readHealthAudit(vault) : null))

  // ---- Ajustes ----
  ipcMain.handle('settings:get', () => getPublicSettings())
  ipcMain.handle('settings:update', (_e, patch: Partial<Settings>) => {
    // themeSource también cambia prefers-color-scheme en el renderer y el aspecto de los diálogos nativos.
    if (patch.theme) nativeTheme.themeSource = patch.theme
    return updateSettings(patch)
  })
  ipcMain.handle('settings:setKey', (_e, provider: 'anthropic' | 'openai', key: string) => setApiKey(provider, key))

  // ---- MCP (Claude Desktop / Claude Code) ----
  ipcMain.handle('mcp:status', () => mcpStatus())
  ipcMain.handle('mcp:connectDesktop', () => connectClaudeDesktop())
  ipcMain.handle('mcp:disconnectDesktop', () => disconnectClaudeDesktop())
  ipcMain.handle('mcp:openClaude', () => openClaudeDesktop())
  ipcMain.handle('mcp:connectChatGPT', () => connectChatGPT())
  ipcMain.handle('mcp:disconnectChatGPT', () => disconnectChatGPT())

  // ---- IA ----
  const withAbort = async <T>(id: string, fn: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    const ctrl = new AbortController()
    requests.set(id, ctrl)
    try {
      return await fn(ctrl.signal)
    } finally {
      requests.delete(id)
    }
  }

  ipcMain.handle('ai:test', () => testConnection())
  ipcMain.handle('ai:configured', () => isConfigured())
  ipcMain.handle('ai:ollamaStatus', () => ollamaStatus())
  ipcMain.handle('ai:ollamaPull', (e, model: string) =>
    ollamaPull(model, (p, status) => e.sender.send('ai:pullProgress', model, p, status))
  )
  ipcMain.handle('ai:cancel', (_e, id: string) => requests.get(id)?.abort())
  ipcMain.handle('ai:pickFiles', async () => {
    const res = await dialog.showOpenDialog(win!, {
      title: 'Files with information about your model',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Text', extensions: ['md', 'txt', 'markdown', 'csv', 'json', 'pine', 'srt', 'vtt'] }]
    })
    if (res.canceled) return []
    return Promise.all(
      res.filePaths.map(async (p) => ({ name: basename(p), content: await fs.readFile(p, 'utf8') }))
    )
  })
  ipcMain.handle('ai:organize', (e, id: string, text: string, hint: string) => {
    if (!vault.root) throw new Error('Open a vault first')
    return withAbort(id, (signal) =>
      organize(vault, text, hint, signal, (chars) => e.sender.send('ai:progress', id, chars))
    )
  })
  ipcMain.handle('ai:saveImport', async (_e, req: SaveImportRequest) => {
    const res = await saveImport(vault, req)
    return { ...res, state: await state() }
  })
  ipcMain.handle('ai:healthAudit', (_e, id: string) => {
    if (!vault.root) throw new Error('Open a vault first')
    return withAbort(id, (signal) => generateHealthAudit(vault, signal))
  })
  ipcMain.handle('ai:flow', (_e, id: string, focus?: string) => {
    if (!vault.root) throw new Error('Open a vault first')
    return withAbort(id, async (signal) => ({ ...(await generateFlow(vault, signal, focus)), state: await state() }))
  })
  ipcMain.handle('ai:chat', (e, id: string, messages: ChatMessage[], currentPath: string | null) => {
    if (!vault.root) throw new Error('Open a vault first')
    return withAbort(id, (signal) => chat(vault, messages, currentPath, signal, (d) => e.sender.send('ai:delta', id, d)))
  })
}

app.whenReady().then(async () => {
  registerIpc()
  const { lastVault, theme } = await getSettings()
  nativeTheme.themeSource = theme
  nativeTheme.on('updated', () => win?.setBackgroundColor(windowBackground()))
  if (lastVault) await vault.open(lastVault).catch(() => updateSettings({ lastVault: null }))
  if (vault.root) await rememberVault(vault.root)
  createWindow()
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow())
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
