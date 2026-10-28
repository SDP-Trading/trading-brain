import type {
  ChatMessage,
  GraphData,
  ImportedFile,
  ImportPreview,
  NoteIndexEntry,
  PublicSettings,
  SaveImportRequest,
  SaveImportResponse,
  SearchResult,
  HealthReport,
  OllamaStatus,
  VaultListItem,
  Settings,
  VaultState,
  McpStatus
} from './types'
import type { HealthAudit } from './health'

/** API expuesta al renderer por el preload en `window.api`. */
export interface BrainAPI {
  vault: {
    select(): Promise<VaultState | null>
    open(path: string): Promise<VaultState>
    list(): Promise<VaultListItem[]>
    forget(path: string): Promise<VaultState>
    state(): Promise<VaultState>
    reveal(): Promise<void>
    onChanged(cb: (state: VaultState) => void): () => void
  }
  notes: {
    read(path: string): Promise<string>
    write(path: string, content: string, root?: string): Promise<VaultState>
    create(folder: string, title: string): Promise<{ path: string; state: VaultState }>
    createFolder(path: string): Promise<VaultState>
    delete(path: string): Promise<{ trash: string; state: VaultState }>
    restore(trash: string, path: string): Promise<VaultState>
    reveal(path: string): Promise<void>
    rename(path: string, newName: string): Promise<{ path: string; state: VaultState }>
    resolve(target: string): Promise<string | null>
    backlinks(path: string): Promise<NoteIndexEntry[]>
    search(query: string): Promise<SearchResult[]>
    graph(): Promise<GraphData>
  }
  settings: {
    get(): Promise<PublicSettings>
    update(patch: Partial<Settings>): Promise<PublicSettings>
    setKey(provider: 'anthropic' | 'openai', key: string): Promise<PublicSettings>
  }
  canvas: {
    read(path: string): Promise<string>
    write(path: string, content: string): Promise<void>
    create(folder: string, title: string): Promise<{ path: string; state: VaultState }>
  }
  views: {
    health(scope?: string): Promise<HealthReport>
    healthAudit(): Promise<HealthAudit | null>
  }
  mcp: {
    status(): Promise<McpStatus>
    connectDesktop(): Promise<McpStatus>
    disconnectDesktop(): Promise<McpStatus>
    openClaude(): Promise<boolean>
    connectChatGPT(): Promise<McpStatus>
    disconnectChatGPT(): Promise<McpStatus>
  }
  ai: {
    test(): Promise<string>
    configured(): Promise<boolean>
    ollamaStatus(): Promise<OllamaStatus>
    ollamaPull(model: string): Promise<void>
    onPullProgress(cb: (model: string, progress: number, status: string) => void): () => void
    pickFiles(): Promise<ImportedFile[]>
    organize(requestId: string, text: string, modelHint: string): Promise<ImportPreview>
    saveImport(req: SaveImportRequest): Promise<SaveImportResponse & { state: VaultState }>
    healthAudit(requestId: string): Promise<HealthAudit>
    flow(requestId: string, focus?: string): Promise<{ path: string; state: VaultState }>
    chat(requestId: string, messages: ChatMessage[], currentPath: string | null): Promise<string>
    cancel(requestId: string): Promise<void>
    onDelta(cb: (requestId: string, delta: string) => void): () => void
    onProgress(cb: (requestId: string, chars: number) => void): () => void
  }
}
