// "Live preview" al estilo Obsidian: el Markdown se ve formateado y solo las líneas
// donde está el cursor muestran la sintaxis para editarla.
import { ensureSyntaxTree, syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { EditorState, Prec, StateEffect, StateField, type Extension, type Range } from '@codemirror/state'
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { load } from 'js-yaml'
import { FRONTMATTER_RE, WIKILINK_RE, parseWikilink } from '@shared/markdown'

export interface LivePreviewOptions {
  /** ¿Existe una nota con este título o alias? */
  exists(target: string): boolean
  openLink(target: string): void
}

// ---------- Foco ----------

const setFocus = StateEffect.define<boolean>()
const focusField = StateField.define<boolean>({
  create: () => false,
  update: (v, tr) => tr.effects.reduce((acc, e) => (e.is(setFocus) ? e.value : acc), v)
})

// ---------- Widgets ----------

class BulletWidget extends WidgetType {
  eq() {
    return true
  }
  toDOM() {
    const s = document.createElement('span')
    s.className = 'cm-lp-bullet'
    s.textContent = '•'
    return s
  }
}

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super()
  }
  eq(o: CheckboxWidget) {
    return o.checked === this.checked
  }
  toDOM(view: EditorView) {
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.className = 'cm-lp-task'
    box.checked = this.checked
    box.addEventListener('mousedown', (e) => {
      e.preventDefault()
      const pos = view.posAtDOM(box)
      const marker = view.state.sliceDoc(pos, pos + 3)
      if (!/^\[[ xX]\]$/.test(marker)) return
      view.dispatch({ changes: { from: pos + 1, to: pos + 2, insert: this.checked ? ' ' : 'x' } })
    })
    return box
  }
  ignoreEvent() {
    return true
  }
}

class HrWidget extends WidgetType {
  eq() {
    return true
  }
  toDOM() {
    const hr = document.createElement('span')
    hr.className = 'cm-lp-hr'
    return hr
  }
}

/** Bloque que, al pulsarlo, coloca el cursor en `editPos` para editar el Markdown original. */
abstract class EditableBlock extends WidgetType {
  constructor(readonly editPos: number) {
    super()
  }
  protected wrap(view: EditorView, el: HTMLElement): HTMLElement {
    el.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).closest('[data-wikilink]')) return
      e.preventDefault()
      view.dispatch({ selection: { anchor: this.editPos } })
      view.focus()
    })
    return el
  }
  ignoreEvent() {
    return true
  }
}

class PropertiesWidget extends EditableBlock {
  constructor(
    readonly yaml: string,
    editPos: number
  ) {
    super(editPos)
  }
  eq(o: PropertiesWidget) {
    return o.yaml === this.yaml && o.editPos === this.editPos
  }
  toDOM(view: EditorView) {
    const box = document.createElement('div')
    box.className = 'cm-lp-properties'
    let data: Record<string, unknown> = {}
    try {
      data = (load(this.yaml) as Record<string, unknown>) ?? {}
    } catch {
      box.textContent = this.yaml
      return this.wrap(view, box)
    }
    for (const [k, v] of Object.entries(data)) {
      const row = document.createElement('div')
      row.className = 'cm-lp-prop'
      const key = document.createElement('span')
      key.className = 'cm-lp-prop-key'
      key.textContent = k
      const val = document.createElement('span')
      val.className = 'cm-lp-prop-val'
      val.innerHTML = renderInline(Array.isArray(v) ? v.join(', ') : String(v))
      row.append(key, val)
      box.append(row)
    }
    if (!box.childElementCount) box.textContent = 'Properties'
    return this.wrap(view, box)
  }
}

class TableWidget extends EditableBlock {
  constructor(
    readonly rows: string[][],
    editPos: number
  ) {
    super(editPos)
  }
  eq(o: TableWidget) {
    return o.editPos === this.editPos && JSON.stringify(o.rows) === JSON.stringify(this.rows)
  }
  toDOM(view: EditorView) {
    const table = document.createElement('table')
    table.className = 'cm-lp-table'
    this.rows.forEach((cells, i) => {
      const tr = document.createElement('tr')
      for (const c of cells) {
        const td = document.createElement(i === 0 ? 'th' : 'td')
        td.innerHTML = renderInline(c)
        tr.append(td)
      }
      table.append(tr)
    })
    return this.wrap(view, table)
  }
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** Markdown en línea mínimo para celdas y propiedades: wikilinks, negrita, cursiva y código. */
function renderInline(text: string): string {
  return escapeHtml(text)
    .replace(/\[\[([^\]\n]+?)\]\]/g, (_m, inner: string) => {
      const { target, alias } = parseWikilink(inner)
      return `<span class="cm-lp-wikilink" data-wikilink="${target}">${alias || target}</span>`
    })
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
}

// ---------- Decoraciones ----------

const hidden = Decoration.replace({})

function buildDecorations(state: EditorState, opts: LivePreviewOptions): DecorationSet {
  const doc = state.doc
  const focused = state.field(focusField)
  const deco: Range<Decoration>[] = []

  // Líneas "activas": las que tocan la selección mientras el editor tiene el foco.
  const activeLines = new Set<number>()
  if (focused)
    for (const r of state.selection.ranges) {
      const a = doc.lineAt(r.from).number
      const b = doc.lineAt(r.to).number
      for (let n = a; n <= b; n++) activeLines.add(n)
    }
  const isActive = (from: number, to: number) => {
    const a = doc.lineAt(from).number
    const b = doc.lineAt(Math.min(to, doc.length)).number
    for (let n = a; n <= b; n++) if (activeLines.has(n)) return true
    return false
  }
  const lineDeco = (pos: number, cls: string) => deco.push(Decoration.line({ class: cls }).range(doc.lineAt(pos).from))

  // Frontmatter -> panel de propiedades.
  const text = doc.toString()
  const fm = text.match(FRONTMATTER_RE)
  const fmEnd = fm ? doc.lineAt(Math.max(0, fm[0].trimEnd().length)).to : -1
  if (fm) {
    if (isActive(0, fmEnd)) {
      for (let n = 1; n <= doc.lineAt(fmEnd).number; n++) lineDeco(doc.line(n).from, 'cm-lp-fm-line')
    } else {
      deco.push(
        Decoration.replace({ widget: new PropertiesWidget(fm[1], doc.line(2).from), block: true }).range(0, fmEnd)
      )
    }
  }

  // Rangos de código: dentro no se buscan wikilinks ni etiquetas.
  const codeRanges: [number, number][] = []
  const tree = ensureSyntaxTree(state, doc.length, 200)
  tree?.iterate({
    enter: (n) => {
      if (n.name === 'FencedCode' || n.name === 'CodeBlock' || n.name === 'InlineCode') codeRanges.push([n.from, n.to])
    }
  })
  const inCode = (pos: number) => codeRanges.some(([a, b]) => pos >= a && pos < b)

  // Wikilinks (antes que el árbol: "[[a|b]]" se parsea como un enlace normal "[a|b]").
  const wikiRanges: [number, number][] = []
  for (const m of text.matchAll(WIKILINK_RE)) {
    const from = m.index!
    const to = from + m[0].length
    if (from < fmEnd || inCode(from)) continue
    wikiRanges.push([from, to])
    const { target, alias } = parseWikilink(m[1])
    const missing = opts.exists(target) ? '' : ' cm-lp-missing'
    const embed = m[0].startsWith('!') ? 1 : 0
    if (isActive(from, to)) {
      deco.push(Decoration.mark({ class: 'cm-lp-wikilink-raw' }).range(from, to))
      continue
    }
    const inner = m[1]
    const pipe = inner.indexOf('|')
    const shownFrom = pipe >= 0 ? from + embed + 2 + pipe + 1 : from + embed + 2
    const shownTo = to - 2
    deco.push(hidden.range(from, shownFrom))
    if (shownTo > shownFrom)
      deco.push(
        Decoration.mark({
          class: 'cm-lp-wikilink' + missing,
          attributes: { 'data-wikilink': target, title: alias ? target : '' }
        }).range(shownFrom, shownTo)
      )
    deco.push(hidden.range(shownTo, to))
  }
  const inWiki = (a: number, b: number) => wikiRanges.some(([x, y]) => a < y && b > x)

  // Etiquetas #tag.
  for (const m of text.matchAll(/(^|\s)(#[\p{L}\p{N}_/-]*\p{L}[\p{L}\p{N}_/-]*)/gu)) {
    const from = m.index! + m[1].length
    if (from < fmEnd || inCode(from) || inWiki(from, from + 1)) continue
    deco.push(Decoration.mark({ class: 'cm-lp-tag' }).range(from, from + m[2].length))
  }

  tree?.iterate({
    enter: (n) => {
      if (n.to <= fmEnd) return false
      if (n.name === 'Link' && inWiki(n.from, n.to)) return false
      const active = isActive(n.from, n.to)
      const name = n.name

      const heading = /^(?:ATXHeading|SetextHeading)(\d)$/.exec(name)
      if (heading) {
        lineDeco(n.from, `cm-lp-h cm-lp-h${heading[1]}`)
        return true
      }

      switch (name) {
        case 'HeaderMark': {
          if (active) return false
          const parent = n.node.parent?.name ?? ''
          if (parent.startsWith('Setext')) deco.push(hidden.range(n.from, n.to))
          else {
            const after = doc.sliceString(n.to, n.to + 1) === ' ' ? 1 : 0
            deco.push(hidden.range(n.from, n.to + after))
          }
          return false
        }
        case 'EmphasisMark':
        case 'StrikethroughMark':
          if (!active) deco.push(hidden.range(n.from, n.to))
          return false
        case 'InlineCode':
          deco.push(Decoration.mark({ class: 'cm-lp-inline-code' }).range(n.from, n.to))
          return true
        case 'CodeMark':
          if (n.node.parent?.name === 'InlineCode' && !active) deco.push(hidden.range(n.from, n.to))
          return false
        case 'FencedCode': {
          const first = doc.lineAt(n.from).number
          const last = doc.lineAt(n.to).number
          for (let l = first; l <= last; l++) {
            const line = doc.line(l)
            const fence = l === first || (l === last && /^\s*(```|~~~)/.test(line.text))
            lineDeco(line.from, fence ? 'cm-lp-code cm-lp-code-fence' : 'cm-lp-code')
          }
          return false
        }
        case 'Link': {
          if (active) return true
          const marks = n.node.getChildren('LinkMark')
          const url = n.node.getChild('URL')
          if (marks.length < 2) return false
          const textFrom = marks[0].to
          const textTo = marks[1].from
          deco.push(hidden.range(n.from, textFrom))
          deco.push(
            Decoration.mark({
              class: 'cm-lp-link',
              attributes: url ? { 'data-href': doc.sliceString(url.from, url.to) } : {}
            }).range(textFrom, textTo)
          )
          deco.push(hidden.range(textTo, n.to))
          return false
        }
        case 'Blockquote': {
          for (let l = doc.lineAt(n.from).number; l <= doc.lineAt(n.to).number; l++)
            lineDeco(doc.line(l).from, 'cm-lp-quote')
          return true
        }
        case 'QuoteMark': {
          if (active) return false
          const after = doc.sliceString(n.to, n.to + 1) === ' ' ? 1 : 0
          deco.push(hidden.range(n.from, n.to + after))
          return false
        }
        case 'ListMark': {
          if (active || n.node.parent?.parent?.name !== 'BulletList') return false
          const isTask = n.node.parent?.getChild('Task')
          if (isTask) deco.push(hidden.range(n.from, n.to + 1))
          else deco.push(Decoration.replace({ widget: new BulletWidget() }).range(n.from, n.to))
          return false
        }
        case 'TaskMarker': {
          if (active) return false
          const checked = /x/i.test(doc.sliceString(n.from, n.to))
          deco.push(Decoration.replace({ widget: new CheckboxWidget(checked) }).range(n.from, n.to))
          if (checked) {
            const task = n.node.parent!
            if (n.to + 1 < task.to)
              deco.push(Decoration.mark({ class: 'cm-lp-task-done' }).range(n.to + 1, task.to))
          }
          return false
        }
        case 'HorizontalRule':
          if (!active) deco.push(Decoration.replace({ widget: new HrWidget() }).range(n.from, n.to))
          return false
        case 'Table': {
          if (active) {
            for (let l = doc.lineAt(n.from).number; l <= doc.lineAt(n.to).number; l++)
              lineDeco(doc.line(l).from, 'cm-lp-table-raw')
            return false
          }
          const rows: string[][] = []
          for (let l = doc.lineAt(n.from).number; l <= doc.lineAt(n.to).number; l++) {
            const t = doc.line(l).text.trim()
            if (/^\|?\s*:?-{2,}/.test(t)) continue
            rows.push(t.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()))
          }
          const from = doc.lineAt(n.from).from
          const to = doc.lineAt(n.to).to
          deco.push(Decoration.replace({ widget: new TableWidget(rows, from), block: true }).range(from, to))
          return false
        }
      }
      return true
    }
  })

  return Decoration.set(deco, true)
}

const highlight = HighlightStyle.define([
  { tag: tags.heading, fontWeight: '700', textDecoration: 'none', color: 'var(--foreground)' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, color: 'var(--link)', textDecoration: 'none' },
  { tag: tags.url, color: 'var(--muted-foreground)' },
  { tag: tags.monospace, fontFamily: 'var(--font-code)' },
  { tag: tags.quote, color: 'var(--muted-foreground)' },
  { tag: [tags.processingInstruction, tags.contentSeparator, tags.meta], color: 'var(--muted-foreground)' }
])

export function livePreview(opts: LivePreviewOptions): Extension {
  const decorations = StateField.define<DecorationSet>({
    create: (state) => buildDecorations(state, opts),
    update: (deco, tr) =>
      tr.docChanged || tr.selection || tr.effects.some((e) => e.is(setFocus))
        ? buildDecorations(tr.state, opts)
        : deco.map(tr.changes),
    provide: (f) => EditorView.decorations.from(f)
  })

  const clicks = EditorView.domEventHandlers({
    mousedown(e) {
      const el = e.target as HTMLElement
      const wiki = el.closest<HTMLElement>('[data-wikilink]')
      if (wiki) {
        e.preventDefault()
        opts.openLink(wiki.dataset.wikilink!)
        return true
      }
      const link = el.closest<HTMLElement>('[data-href]')
      if (link?.dataset.href && /^https?:/.test(link.dataset.href)) {
        e.preventDefault()
        window.open(link.dataset.href, '_blank')
        return true
      }
      return false
    }
  })

  return [
    focusField,
    EditorView.focusChangeEffect.of((_state, focusing) => setFocus.of(focusing)),
    decorations,
    clicks,
    Prec.high(syntaxHighlighting(highlight))
  ]
}
