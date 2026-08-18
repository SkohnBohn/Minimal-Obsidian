import { EditorView, showTooltip, Tooltip } from '@codemirror/view'
import { StateField, EditorState } from '@codemirror/state'
import type { Command } from '@codemirror/view'

const FOOTNOTE_REF_RE = /\[\^(\d+)\]/g
const FOOTNOTE_DEF_RE = /^\[\^(\d+)\]:\s*(.*)/m

// ── ⌘⇧O — insert [^] at cursor, place cursor inside ─────────────────────────
export const insertFootnoteRef: Command = (view) => {
  const { from } = view.state.selection.main
  view.dispatch({
    changes: { from, insert: '[^]' },
    selection: { anchor: from + 2 }
  })
  return true
}

// ── ⌘⇧P — append next [^N]: definition at the bottom ────────────────────────
export const addFootnoteDef: Command = (view) => {
  const doc = view.state.doc.toString()
  const lines = doc.split('\n')

  // Find last [^N]: definition and highest N
  const defLineRe = /^\[\^(\d+)\]:/
  let lastDefLineIdx = -1
  let maxN = 0
  for (let i = 0; i < lines.length; i++) {
    const m = defLineRe.exec(lines[i])
    if (m) { lastDefLineIdx = i; maxN = Math.max(maxN, parseInt(m[1])) }
  }

  const nextN = maxN + 1
  const newDef = `[^${nextN}]: `

  if (lastDefLineIdx === -1) {
    // No definitions yet — find last non-empty line
    let lastTextIdx = lines.length - 1
    while (lastTextIdx >= 0 && lines[lastTextIdx].trim() === '') lastTextIdx--
    const insertLine = view.state.doc.line(lastTextIdx + 1)
    const insert = '\n'.repeat(10) + '___\n' + newDef
    view.dispatch({
      changes: { from: insertLine.to, insert },
      selection: { anchor: insertLine.to + insert.length }
    })
  } else {
    const defLine = view.state.doc.line(lastDefLineIdx + 1)
    const insert = '\n' + newDef
    view.dispatch({
      changes: { from: defLine.to, insert },
      selection: { anchor: defLine.to + insert.length }
    })
  }

  return true
}

// ── Source preview tooltip when cursor is inside [^N] ────────────────────────
function getTooltips(state: EditorState): readonly Tooltip[] {
  const cursor = state.selection.main.head
  const doc = state.doc.toString()
  const re = new RegExp(FOOTNOTE_REF_RE.source, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(doc)) !== null) {
    const from = m.index, to = m.index + m[0].length
    if (cursor < from || cursor > to) continue
    const n = parseInt(m[1])
    if (!n) continue
    const defMatch = new RegExp(`^\\[\\^${n}\\]:\\s*(.+)`, 'm').exec(doc)
    const source = defMatch?.[1]?.trim()
    if (!source) continue
    return [{
      pos: from,
      above: true,
      strictSide: false,
      arrow: false,
      create() {
        const dom = document.createElement('div')
        dom.className = 'cm-fn-tooltip'
        dom.textContent = source
        return { dom }
      }
    }]
  }
  return []
}

// Enter inside [^N] jumps cursor to end of the matching [^N]: definition line
export const footnoteEnterCommand: Command = (view) => {
  const cursor = view.state.selection.main.head
  const doc = view.state.doc.toString()
  const re = new RegExp(FOOTNOTE_REF_RE.source, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(doc)) !== null) {
    const from = m.index, to = m.index + m[0].length
    if (cursor < from || cursor > to) continue
    const n = parseInt(m[1])
    if (!n) return false
    // Find the definition line
    const defRe = new RegExp(`^\\[\\^${n}\\]:`, 'm')
    const defMatch = defRe.exec(doc)
    if (!defMatch) return false
    // Find end of that line
    const defLineStart = defMatch.index
    const lineEnd = doc.indexOf('\n', defLineStart)
    const pos = lineEnd === -1 ? doc.length : lineEnd
    view.dispatch({ selection: { anchor: pos } })
    view.focus()
    return true
  }
  return false
}

export const footnoteTooltipExt = StateField.define<readonly Tooltip[]>({
  create: getTooltips,
  update(tts, tr) {
    if (!tr.docChanged && !tr.selectionSet) return tts
    return getTooltips(tr.state)
  },
  provide: f => showTooltip.computeN([f], state => state.field(f))
})
