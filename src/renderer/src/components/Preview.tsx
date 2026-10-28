import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { load } from 'js-yaml'
import { WIKILINK_RE, normalizeKey, parseWikilink, splitFrontmatter } from '@shared/markdown'

interface Props {
  content: string
  names: Map<string, string>
  onLink(target: string): void
  showProperties?: boolean
}

const WL_PREFIX = '#wl:'

/** Convierte [[Nota|Alias]] en enlaces Markdown que el componente <a> intercepta. */
function wikilinksToMarkdown(body: string): string {
  // No tocar bloques de código.
  return body
    .split(/(```[\s\S]*?```|`[^`\n]*`)/g)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part.replace(WIKILINK_RE, (_m, inner: string, offset: number, whole: string) => {
            const { target, heading, alias } = parseWikilink(inner)
            let label = (alias || (heading ? `${target} › ${heading}` : target)).replace(/[[\]]/g, '')
            // Alias con forma de título ("[[Nota|## Nota]]", habitual en canvas): título enlazado.
            const h = /^(#{1,6})\s+(.+)$/.exec(label)
            const lineStart = offset === 0 || whole[offset - 1] === '\n'
            if (h) label = h[2]
            const link = `[${label}](${WL_PREFIX}${encodeURIComponent(target)})`
            return h && lineStart ? `${h[1]} ${link}` : link
          })
    )
    .join('')
}

function Properties({ raw }: { raw: string }) {
  let data: Record<string, unknown> = {}
  try {
    data = (load(raw) as Record<string, unknown>) ?? {}
  } catch {
    return <pre className="mb-4 rounded-lg border bg-muted p-3 text-xs">{raw}</pre>
  }
  const entries = Object.entries(data)
  if (!entries.length) return null
  const fmt = (v: unknown) => (Array.isArray(v) ? v.join(', ') : v instanceof Date ? v.toISOString().slice(0, 10) : String(v))
  return (
    <div className="mb-4 rounded-lg border bg-muted px-3 py-2 text-[13px]">
      {entries.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[110px_1fr] gap-2 py-0.5">
          <span className="text-muted-foreground">{k}</span>
          <span className="break-words">{fmt(v)}</span>
        </div>
      ))}
    </div>
  )
}

function Preview({ content, names, onLink, showProperties = true }: Props) {
  const { yaml: raw, body } = splitFrontmatter(content)
  return (
    <div className="markdown">
      {showProperties && raw && <Properties raw={raw} />}
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a({ href, children }) {
            if (href?.startsWith(WL_PREFIX)) {
              const target = decodeURIComponent(href.slice(WL_PREFIX.length))
              const exists = names.has(normalizeKey(target))
              return (
                <a
                  href="#"
                  className={`wikilink ${exists ? '' : 'missing'}`}
                  title={exists ? target : `${target} (does not exist: click to create)`}
                  onClick={(e) => {
                    e.preventDefault()
                    onLink(target)
                  }}
                >
                  {children}
                </a>
              )
            }
            return (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            )
          }
        }}
      >
        {wikilinksToMarkdown(body)}
      </ReactMarkdown>
    </div>
  )
}

export default memo(Preview)
