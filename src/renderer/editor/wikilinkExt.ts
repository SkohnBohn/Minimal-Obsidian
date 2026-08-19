import {
  EditorView,
  ViewPlugin,
  ViewUpdate,
  Decoration,
  DecorationSet
} from '@codemirror/view'
import { StateField, StateEffect, Range, EditorState } from '@codemirror/state'
import { autocompletion, CompletionContext, CompletionResult } from '@codemirror/autocomplete'

export interface WikiLinkExtOptions {
  noteNames: string[]
  onNavigate: (name: string) => void    // left-click: navigate current tab
  onOpenNewTab: (name: string) => void  // right-click: open in new tab
}

// ── Note-names state field ─────────────────────────────────────────────────

export const setNoteNames = StateEffect.define<string[]>()

export const noteNamesField = StateField.define<string[]>({
  create: () => [],
  update(names, tr) {
    for (const e of tr.effects) if (e.is(setNoteNames)) return e.value
    return names
  }
})

// ── Decorations ────────────────────────────────────────────────────────────

const WIKILINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g

function buildDecorations(state: EditorState): DecorationSet {
  const names = new Set(state.field(noteNamesField))
  const cursor = state.selection.main.head
  const ranges: Range<Decoration>[] = []
  const doc = state.doc.toString()
  const re = new RegExp(WIKILINK_RE.source, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(doc)) !== null) {
    const from = m.index, to = m.index + m[0].length
    const target = m[1].trim()
    const cls = names.has(target) ? 'cm-wikilink-existing' : 'cm-wikilink-dead'
    const attrs = { 'data-target': target, style: 'cursor:pointer' }

    if (cursor >= from && cursor <= to) {
      // Cursor inside — show raw markup without data-target so clicks don't navigate
      ranges.push(Decoration.mark({ class: cls }).range(from, to))
      continue
    }

    if (m[2]) {
      // [[target|display]] — hide [[target|, mark the display text, hide ]]
      const displayStart = from + 2 + m[1].length + 1
      ranges.push(Decoration.replace({}).range(from, displayStart))
      ranges.push(Decoration.mark({ class: cls, attributes: attrs }).range(displayStart, to - 2))
      ranges.push(Decoration.replace({}).range(to - 2, to))
    } else {
      // [[target]] — hide [[ and ]], mark the target name
      ranges.push(Decoration.replace({}).range(from, from + 2))
      ranges.push(Decoration.mark({ class: cls, attributes: attrs }).range(from + 2, to - 2))
      ranges.push(Decoration.replace({}).range(to - 2, to))
    }
  }
  return Decoration.set(ranges, true)
}

const wikilinkDecorationPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) { this.decorations = buildDecorations(view.state) }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet ||
          update.transactions.some(tr => tr.effects.some(e => e.is(setNoteNames)))) {
        this.decorations = buildDecorations(update.state)
      }
    }
  },
  { decorations: v => v.decorations }
)

// ── Position-based range index (DOM-independent click detection) ───────────
//
// Instead of relying on closest('[data-target]') — which is fragile if CM
// splits the decorated span into multiple DOM nodes — we maintain a StateField
// that maps document positions to wikilink targets. The click handler asks CM
// for the doc position of the mouse coordinates and does a plain range lookup.

interface WikiRange { from: number; to: number; target: string }

function buildWikiRanges(state: EditorState): WikiRange[] {
  const doc = state.doc.toString()
  const re = new RegExp(WIKILINK_RE.source, 'g')
  const out: WikiRange[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(doc)) !== null)
    out.push({ from: m.index, to: m.index + m[0].length, target: m[1].trim() })
  return out
}

const wikilinkRangesField = StateField.define<WikiRange[]>({
  create: (state) => buildWikiRanges(state),
  update(ranges, tr) {
    return tr.docChanged ? buildWikiRanges(tr.state) : ranges
  }
})

function targetAtEvent(e: MouseEvent): string | null {
  const el = document.elementFromPoint(e.clientX, e.clientY)
  if (!el) return null
  const span = el.closest('[data-target]') as HTMLElement | null
  return span?.dataset.target ?? null
}

// ── Click handlers ─────────────────────────────────────────────────────────

function makeClickHandlers(onNavigate: (n: string) => void, onOpenNewTab: (n: string) => void) {
  return EditorView.domEventHandlers({
    click(e, view) {
      const target = targetAtEvent(e)
      if (!target) {
        // Snap cursor past the hidden ]] if click landed inside it
        const pos = view.posAtCoords({ x: e.clientX, y: e.clientY }, false)
        if (pos !== null) {
          const wranges = view.state.field(wikilinkRangesField)
          const link = wranges.find(r => pos >= r.to - 2 && pos < r.to)
          if (link) {
            view.dispatch({ selection: { anchor: link.to } })
            return true
          }
        }
        return false
      }
      e.preventDefault()
      if (e.metaKey || e.ctrlKey) onOpenNewTab(target)
      else onNavigate(target)
      return true
    },
    contextmenu(e, _view) {
      const target = targetAtEvent(e)
      if (!target) return false
      e.preventDefault()
      onOpenNewTab(target)
      return true
    }
  })
}

// ── Autocompletion ─────────────────────────────────────────────────────────

const wikilinkCompletion = autocompletion({
  override: [
    (ctx: CompletionContext): CompletionResult | null => {
      const before = ctx.state.sliceDoc(0, ctx.pos)
      const open = before.lastIndexOf('[[')
      if (open === -1) return null
      const text = before.slice(open + 2)
      if (text.includes('|') || text.includes(']]') || text.includes('[')) return null
      const names = ctx.state.field(noteNamesField)
      const query = text.toLowerCase()
      const matches = names.filter(n => n.toLowerCase().includes(query)).slice(0, 8)
      if (!matches.length) return null
      return {
        from: open + 2,
        options: matches.map(n => ({
          label: n,
          apply: (view, _c, from, to) => {
            view.dispatch({ changes: { from, to, insert: n } })
          }
        }))
      }
    }
  ]
})

// ── Input rule: second [ closes with ]] ───────────────────────────────────

const doubleBracketRule = EditorView.inputHandler.of((view, from, to, insert) => {
  if (insert !== '[') return false
  const before = view.state.sliceDoc(Math.max(0, from - 1), from)
  if (before !== '[') return false
  view.dispatch({ changes: { from, to, insert: '[]]' }, selection: { anchor: from + 1 } })
  return true
})

// ── Public factory ─────────────────────────────────────────────────────────

export function wikilinkExtension(opts: WikiLinkExtOptions) {
  return [
    noteNamesField.init(() => opts.noteNames),
    wikilinkRangesField,
    doubleBracketRule,
    wikilinkDecorationPlugin,
    makeClickHandlers(opts.onNavigate, opts.onOpenNewTab),
    wikilinkCompletion
  ]
}
