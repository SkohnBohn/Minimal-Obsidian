import {
  EditorView,
  ViewPlugin,
  ViewUpdate,
  Decoration,
  DecorationSet,
  WidgetType
} from '@codemirror/view'
import { EditorState, Range } from '@codemirror/state'

const IMAGE_EXTS = /\.(png|jpe?g|gif|bmp|svg|webp)$/i
const EMBED_RE = /!\[\[([^\]]+)\]\]/g

class ImageWidget extends WidgetType {
  constructor(readonly filename: string) { super() }

  eq(other: ImageWidget) { return other.filename === this.filename }

  toDOM() {
    const wrap = document.createElement('span')
    wrap.className = 'cm-image-wrap'
    const img = document.createElement('img')
    img.src = `vault-asset://img/${encodeURIComponent(this.filename)}`
    img.alt = this.filename
    img.className = 'cm-image-embed'
    wrap.appendChild(img)
    return wrap
  }

  ignoreEvent() { return false }
}

function buildDecorations(state: EditorState): DecorationSet {
  const cursor = state.selection.main.head
  const doc = state.doc.toString()
  const re = new RegExp(EMBED_RE.source, 'g')
  const ranges: Range<Decoration>[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(doc)) !== null) {
    const filename = m[1].trim()
    if (!IMAGE_EXTS.test(filename)) continue
    const from = m.index, to = m.index + m[0].length
    if (cursor >= from && cursor <= to) continue  // show raw markup while editing
    ranges.push(Decoration.replace({ widget: new ImageWidget(filename) }).range(from, to))
  }
  return Decoration.set(ranges, true)
}

export const imageEmbedExt = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) { this.decorations = buildDecorations(view.state) }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.viewportChanged)
        this.decorations = buildDecorations(u.state)
    }
  },
  { decorations: v => v.decorations }
)
