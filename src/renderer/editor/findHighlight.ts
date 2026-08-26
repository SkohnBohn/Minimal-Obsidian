import { StateEffect, StateField, RangeSetBuilder } from '@codemirror/state'
import { ViewPlugin, Decoration, DecorationSet, EditorView, ViewUpdate } from '@codemirror/view'

export const setFindQuery = StateEffect.define<string>()

const findQueryField = StateField.define<string>({
  create: () => '',
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setFindQuery)) return e.value
    return value
  }
})

const matchMark = Decoration.mark({ class: 'cm-searchMatch' })
const selectedMark = Decoration.mark({ class: 'cm-searchMatch cm-searchMatch-selected' })

function buildDecorations(view: EditorView): DecorationSet {
  const q = view.state.field(findQueryField).toLowerCase()
  if (!q) return Decoration.none
  const builder = new RangeSetBuilder<Decoration>()
  const sel = view.state.selection.main
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.sliceDoc(from, to).toLowerCase()
    let idx = 0
    while ((idx = text.indexOf(q, idx)) !== -1) {
      const start = from + idx
      const end = start + q.length
      const isCurrent = sel.from === start && sel.to === end
      builder.add(start, end, isCurrent ? selectedMark : matchMark)
      idx += q.length
    }
  }
  return builder.finish()
}

const findHighlightPlugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet
  constructor(view: EditorView) { this.decorations = buildDecorations(view) }
  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged || update.selectionSet ||
        update.state.field(findQueryField) !== update.startState.field(findQueryField)) {
      this.decorations = buildDecorations(update.view)
    }
  }
}, { decorations: v => v.decorations })

export const findHighlightExt = [findQueryField, findHighlightPlugin]
