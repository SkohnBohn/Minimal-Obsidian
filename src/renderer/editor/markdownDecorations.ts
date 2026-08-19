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

// Inline widget that draws a horizontal line inside the .cm-line container.
// We avoid block:true because ViewPlugin block decorations require precise line-boundary
// alignment enforced only at DOM render time, causing subtle crashes in some CM6 builds.
class FootnoteDefWidget extends WidgetType {
  constructor(readonly label: string) { super() }
  toDOM(): HTMLElement {
    const el = document.createElement('sup')
    el.className = 'cm-footnote-def-label'
    el.textContent = this.label
    return el
  }
  eq(other: FootnoteDefWidget): boolean { return this.label === other.label }
  ignoreEvent(): boolean { return false }
}

class HRWidget extends WidgetType {
  toDOM(): HTMLElement {
    const el = document.createElement('span')
    el.className = 'cm-hr'
    el.setAttribute('contenteditable', 'false')
    return el
  }
  eq(): boolean { return true }
  ignoreEvent(): boolean { return true }
}

// Matches [^1], [^note], [^multi-word] but not footnote definitions [^1]:
const FOOTNOTE_RE = /\[\^([^\]]+)\](?!:)/g
// Matches footnote definitions at line start: [^1]: content
const FOOTNOTE_DEF_RE = /^\[\^([^\]]+)\]:(.*)/
// Matches 3+ chars from [-_] in any combination on a line by themselves
const HR_RE = /^[-_]{3,}\s*$/

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

  // Horizontal rules and footnote definitions — iterate lines once
  for (let i = 1; i <= state.doc.lines; i++) {
    const line = state.doc.line(i)
    const onCursorLine = cursor >= line.from && cursor <= line.to

    if (HR_RE.test(line.text)) {
      if (!onCursorLine && line.from < line.to)
        ranges.push(Decoration.replace({ widget: new HRWidget() }).range(line.from, line.to))
      continue
    }

    const fd = FOOTNOTE_DEF_RE.exec(line.text)
    if (fd) {
      if (onCursorLine) continue
      // mark the whole line for hanging indent + spacing
      ranges.push(Decoration.line({ class: 'cm-footnote-def-line' }).range(line.from))
      // replace [^n]: with a superscript label widget
      const labelEnd = line.from + fd[0].length - fd[2].length
      ranges.push(Decoration.replace({ widget: new FootnoteDefWidget(fd[1]) }).range(line.from, labelEnd))
      // mute the content that follows
      if (labelEnd < line.to)
        ranges.push(Decoration.mark({ class: 'cm-footnote-def-content' }).range(labelEnd, line.to))
    }
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
