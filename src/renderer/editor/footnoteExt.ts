import { EditorView, showTooltip, Tooltip, ViewPlugin, ViewUpdate } from '@codemirror/view'
import { StateField, EditorState, StateEffect } from '@codemirror/state'
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

// Effect carrying the `pos` (from) of the ref whose tooltip should be suppressed
const suppressTooltip = StateEffect.define<number>()

type TooltipFieldState = { tooltips: readonly Tooltip[]; suppressedPos: number }

const footnoteTooltipField = StateField.define<TooltipFieldState>({
  create: state => ({ tooltips: getTooltips(state), suppressedPos: -1 }),
  update({ tooltips, suppressedPos }, tr) {
    let newSuppressedPos = suppressedPos

    for (const e of tr.effects) {
      if (e.is(suppressTooltip)) newSuppressedPos = e.value
    }

    if (!tr.docChanged && !tr.selectionSet) return { tooltips, suppressedPos: newSuppressedPos }

    const newTooltips = getTooltips(tr.state)
    // If cursor moved to a different [^N], reset suppression
    if (newTooltips.length > 0 && newTooltips[0].pos !== newSuppressedPos) {
      newSuppressedPos = -1
    } else if (newTooltips.length === 0) {
      newSuppressedPos = -1
    }
    return { tooltips: newTooltips, suppressedPos: newSuppressedPos }
  },
  provide: f => showTooltip.computeN([f], state => {
    const { tooltips, suppressedPos } = state.field(f)
    if (suppressedPos >= 0 && tooltips.length > 0 && tooltips[0].pos === suppressedPos) return []
    return tooltips
  })
})

// ViewPlugin: starts a 2s timer when a tooltip appears; fires suppressTooltip after 2s
const footnoteTooltipTimer = ViewPlugin.fromClass(class {
  timer: ReturnType<typeof setTimeout> | null = null
  view: EditorView

  constructor(view: EditorView) { this.view = view }

  update(update: ViewUpdate) {
    const { tooltips, suppressedPos } = update.state.field(footnoteTooltipField)
    const visible = tooltips.length > 0 && (suppressedPos < 0 || tooltips[0].pos !== suppressedPos)

    if (visible && !this.timer) {
      const pos = tooltips[0].pos
      this.timer = setTimeout(() => {
        this.timer = null
        if (this.view.dom.isConnected) {
          this.view.dispatch({ effects: suppressTooltip.of(pos) })
        }
      }, 2000)
    } else if (!visible && this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  destroy() {
    if (this.timer) clearTimeout(this.timer)
  }
})

// Enter inside [^N] jumps cursor to end of the matching [^N]: definition line
export const footnoteEnterCommand: Command = (view) => {
  const { state } = view
  const cursor = state.selection.main.head
  const line = state.doc.lineAt(cursor)
  const col = cursor - line.from

  const refRe = /\[\^(\d+)\]/g
  let m: RegExpExecArray | null
  while ((m = refRe.exec(line.text)) !== null) {
    if (col < m.index || col > m.index + m[0].length) continue
    const n = parseInt(m[1])
    if (!n) continue
    const defMatch = new RegExp(`^\\[\\^${n}\\]:`, 'm').exec(state.doc.toString())
    if (!defMatch) return false
    const defLine = state.doc.lineAt(defMatch.index)
    view.dispatch({ selection: { anchor: defLine.to }, scrollIntoView: true })
    return true
  }
  return false
}

export const footnoteTooltipExt = [footnoteTooltipField, footnoteTooltipTimer]
