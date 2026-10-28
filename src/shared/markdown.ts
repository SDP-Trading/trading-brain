// Utilidades de Markdown sin dependencias, usadas por main y renderer.

export const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/
export const WIKILINK_RE = /!?\[\[([^\]\n]+?)\]\]/g

export function splitFrontmatter(text: string): { yaml: string | null; body: string } {
  const m = text.match(FRONTMATTER_RE)
  if (!m) return { yaml: null, body: text }
  return { yaml: m[1], body: text.slice(m[0].length) }
}

/** "Nota#Encabezado|Alias" -> { target: "Nota", heading, alias } */
export function parseWikilink(inner: string): { target: string; heading?: string; alias?: string } {
  const [left, alias] = inner.split('|', 2)
  const [target, heading] = left.split('#', 2)
  return { target: target.trim(), heading: heading?.trim(), alias: alias?.trim() }
}

export function extractWikilinks(text: string): string[] {
  const out = new Set<string>()
  for (const m of text.matchAll(WIKILINK_RE)) {
    const { target } = parseWikilink(m[1])
    if (target) out.add(target)
  }
  return [...out]
}

/** Nombre de archivo válido en macOS/Windows y en Obsidian. */
export function sanitizeFileName(name: string): string {
  return (
    name
      .replace(/[\\/:*?"<>|#^[\]]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || 'Untitled'
  )
}

export function basenameNoExt(path: string): string {
  const base = path.split('/').pop() ?? path
  return base.replace(/\.md$/i, '')
}

export function normalizeKey(s: string): string {
  return s.trim().toLowerCase()
}

const ATTACHMENT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|tiff?|heic|avif|pdf|mp4|mov|webm|mkv|mp3|wav|m4a|ogg|zip)$/i

/** ¿Es un adjunto (imagen, PDF, vídeo…) en vez de una nota? Sirve para enlaces y para notas con nombre de imagen. */
export function isAttachment(name: string): boolean {
  return ATTACHMENT_RE.test(name.trim())
}
