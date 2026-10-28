import type { NoteIndexEntry } from '@shared/types'
import { normalizeKey } from '@shared/markdown'

export const api = window.api

/** Quita el prefijo "Error invoking remote method…" que añade Electron. */
export function errMsg(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, '')
}

export const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36)

/** Mapa título/alias -> ruta, igual que la resolución de enlaces del main. */
export function nameMap(index: NoteIndexEntry[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const e of index) for (const a of e.aliases) m.set(normalizeKey(a), e.path)
  for (const e of index) {
    m.set(normalizeKey(e.title), e.path)
    m.set(normalizeKey(e.path.replace(/\.md$/i, '')), e.path)
  }
  return m
}

export function folderOf(path: string): string {
  return path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
}
