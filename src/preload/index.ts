import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { BrainAPI } from '@shared/api'

const invoke = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args)

function on<A extends unknown[]>(channel: string, cb: (...args: A) => void): () => void {
  const listener = (_e: IpcRendererEvent, ...args: unknown[]) => cb(...(args as A))
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: BrainAPI = {
  vault: {
    select: () => invoke('vault:select'),
    open: (p) => invoke('vault:open', p),
    list: () => invoke('vault:list'),
    forget: (p) => invoke('vault:forget', p),
    state: () => invoke('vault:state'),
    reveal: () => invoke('vault:reveal'),
    onChanged: (cb) => on('vault:changed', cb)
  },
  notes: {
    read: (p) => invoke('notes:read', p),
    write: (p, c, r) => invoke('notes:write', p, c, r),
    create: (f, t) => invoke('notes:create', f, t),
    createFolder: (p) => invoke('notes:createFolder', p),
    delete: (p) => invoke('notes:delete', p),
    restore: (t, p) => invoke('notes:restore', t, p),
    reveal: (p) => invoke('notes:reveal', p),
    rename: (p, n) => invoke('notes:rename', p, n),
    resolve: (t) => invoke('notes:resolve', t),
    backlinks: (p) => invoke('notes:backlinks', p),
    search: (q) => invoke('notes:search', q),
    graph: () => invoke('notes:graph')
  },
  settings: {
    get: () => invoke('settings:get'),
    update: (p) => invoke('settings:update', p),
    setKey: (p, k) => invoke('settings:setKey', p, k)
  },
  canvas: {
    read: (p) => invoke('canvas:read', p),
    write: (p, c) => invoke('canvas:write', p, c),
    create: (f, t) => invoke('canvas:create', f, t)
  },
  views: {
    health: (s) => invoke('views:health', s),
    healthAudit: () => invoke('views:healthAudit')
  },
  mcp: {
    status: () => invoke('mcp:status'),
    connectDesktop: () => invoke('mcp:connectDesktop'),
    disconnectDesktop: () => invoke('mcp:disconnectDesktop'),
    openClaude: () => invoke('mcp:openClaude'),
    connectChatGPT: () => invoke('mcp:connectChatGPT'),
    disconnectChatGPT: () => invoke('mcp:disconnectChatGPT')
  },
  ai: {
    test: () => invoke('ai:test'),
    configured: () => invoke('ai:configured'),
    ollamaStatus: () => invoke('ai:ollamaStatus'),
    ollamaPull: (m) => invoke('ai:ollamaPull', m),
    onPullProgress: (cb) => on('ai:pullProgress', cb),
    pickFiles: () => invoke('ai:pickFiles'),
    organize: (id, text, hint) => invoke('ai:organize', id, text, hint),
    saveImport: (req) => invoke('ai:saveImport', req),
    healthAudit: (id) => invoke('ai:healthAudit', id),
    flow: (id, focus) => invoke('ai:flow', id, focus),
    chat: (id, msgs, cur) => invoke('ai:chat', id, msgs, cur),
    cancel: (id) => invoke('ai:cancel', id),
    onDelta: (cb) => on('ai:delta', cb),
    onProgress: (cb) => on('ai:progress', cb)
  }
}

contextBridge.exposeInMainWorld('api', api)
