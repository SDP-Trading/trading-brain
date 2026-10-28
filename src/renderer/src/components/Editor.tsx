import { useMemo, useRef } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { autocompletion, type CompletionContext } from '@codemirror/autocomplete'
import { EditorView } from '@codemirror/view'
import { WIKILINK_RE, normalizeKey, parseWikilink } from '@shared/markdown'
import { livePreview } from '../lib/livePreview'
import { useTheme } from '@/lib/theme'

interface Props {
  value: string
  onChange(v: string): void
  titles: string[]
  names: Map<string, string>
  onOpenLink(target: string): void
}

const theme = EditorView.theme(
  {
    '&': { height: '100%', fontSize: '15px', backgroundColor: 'transparent' },
    '.cm-content': { fontFamily: 'var(--font-text)', padding: '24px 0', maxWidth: '760px', margin: '0 auto', caretColor: 'var(--foreground)' },
    '.cm-cursor': { borderLeftColor: 'var(--foreground)' },
    '.cm-tooltip': { backgroundColor: 'var(--popover)', color: 'var(--popover-foreground)', border: '1px solid var(--border)', borderRadius: '6px' },
    '.cm-tooltip-autocomplete ul li[aria-selected]': { backgroundColor: 'var(--accent)', color: 'var(--accent-foreground)' },
    '.cm-scroller': { lineHeight: '1.65' },
    '.cm-gutters': { display: 'none' },
    '&.cm-focused': { outline: 'none' },
    '.cm-activeLine': { backgroundColor: 'transparent' }
  }
)

export default function Editor({ value, onChange, titles, names, onOpenLink }: Props) {
  // Refs para que las extensiones sean estables y no reinicien el editor.
  const titlesRef = useRef(titles)
  titlesRef.current = titles
  const openRef = useRef(onOpenLink)
  openRef.current = onOpenLink
  const namesRef = useRef(names)
  namesRef.current = names

  const { isDark } = useTheme()

  const extensions = useMemo(() => {
    const wikilinkCompletion = (ctx: CompletionContext) => {
      const m = ctx.matchBefore(/\[\[[^\]\n|#]*/)
      if (!m) return null
      return {
        from: m.from + 2,
        validFor: /^[^\]\n|#]*$/,
        options: titlesRef.current.map((t) => ({
          label: t,
          type: 'text',
          apply: (view: EditorView, _c: unknown, from: number, to: number) => {
            const closed = view.state.sliceDoc(to, to + 2) === ']]'
            const insert = closed ? t : `${t}]]`
            view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + insert.length + (closed ? 2 : 0) } })
          }
        }))
      }
    }

    // ⌘/Ctrl + clic sobre un [[enlace]] lo abre.
    const linkClick = EditorView.domEventHandlers({
      mousedown(e, view) {
        if (!(e.metaKey || e.ctrlKey)) return false
        const pos = view.posAtCoords({ x: e.clientX, y: e.clientY })
        if (pos == null) return false
        const line = view.state.doc.lineAt(pos)
        for (const m of line.text.matchAll(WIKILINK_RE)) {
          const start = line.from + m.index!
          if (pos >= start && pos <= start + m[0].length) {
            e.preventDefault()
            openRef.current(parseWikilink(m[1]).target)
            return true
          }
        }
        return false
      }
    })

    return [
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      EditorView.lineWrapping,
      autocompletion({ override: [wikilinkCompletion] }),
      linkClick,
      livePreview({
        exists: (t) => namesRef.current.has(normalizeKey(t)),
        openLink: (t) => openRef.current(t)
      }),
      theme
    ]
  }, [])

  return (
    <CodeMirror
      className="editor"
      value={value}
      onChange={onChange}
      theme={isDark ? 'dark' : 'light'}
      extensions={extensions}
      basicSetup={{ lineNumbers: false, foldGutter: false, highlightActiveLine: false }}
      height="100%"
    />
  )
}
