import {
  EditorView,
  ViewPlugin,
  ViewUpdate,
  Decoration,
  DecorationSet,
  WidgetType
} from '@codemirror/view'
import { EditorState, Range } from '@codemirror/state'

class FootnoteWidget extends WidgetType {
  constructor(readonly label: string) { super() }
  toDOM(): HTMLElement {
    const el = document.createElement('sup')
    el.className = 'cm-footnote-ref'
    el.textContent = this.label
    return el
  }
  eq(other: FootnoteWidget): boolean { return this.label === other.label }
  ignoreEvent(): boolean { return false }
}

class HRWidget extends WidgetType {
  toDOM(): HTMLElement {
    const el = document.createElement('hr')
    el.className = 'cm-hr'
    return el
  }
  eq(): boolean { return true }
  ignoreEvent(): boolean { return false }
}

// Matches [^1], [^note], [^multi-word] but not footnote definitions [^1]:
const FOOTNOTE_RE = /\[\^([^\]]+)\](?!:)/g
// Matches ---, ___, *** on a line by themselves
const HR_RE = /^(---|___|[*]{3,})\s*$/

function buildDecorations(state: EditorState): DecorationSet {
  const cursor = state.selection.main.head
  const ranges: Range<Decoration>[] = []
  const doc = state.doc.toString()

  // Footnote references: [^N] → <sup>N</sup>
  const fnRe = new RegExp(FOOTNOTE_RE.source, 'g')
  let m: RegExpExecArray | null
  while ((m = fnRe.exec(doc)) !== null) {
    const from = m.index, to = m.index + m[0].length
    if (cursor >= from && cursor <= to) continue   // show raw when editing
    ranges.push(Decoration.replace({ widget: new FootnoteWidget(m[1]) }).range(from, to))
  }

  // Horizontal rules: ___ / --- / *** on their own line → <hr>
  for (let i = 1; i <= state.doc.lines; i++) {
    const line = state.doc.line(i)
    if (!HR_RE.test(line.text)) continue
    if (cursor >= line.from && cursor <= line.to) continue  // show raw on cursor line
    ranges.push(
      Decoration.replace({ widget: new HRWidget(), block: true }).range(line.from, line.to)
    )
  }

  return Decoration.set(ranges, true)
}

export const markdownDecorationsPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) { this.decorations = buildDecorations(view.state) }
    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildDecorations(update.state)
      }
    }
  },
  { decorations: v => v.decorations }
)
