import { EditorView } from '@codemirror/view'

const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
}

function pastedFilename(mime: string): string {
  const ext = MIME_TO_EXT[mime] ?? 'png'
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `Pasted image ${date} ${time}.${ext}`
}

export const imagePasteExt = EditorView.domEventHandlers({
  paste(e, view) {
    const items = e.clipboardData?.items
    if (!items) return false

    for (const item of Array.from(items)) {
      if (!item.type.startsWith('image/')) continue
      e.preventDefault()
      const file = item.getAsFile()
      if (!file) return true

      file.arrayBuffer().then(async buf => {
        const filename = pastedFilename(item.type)
        try {
          const savedName = await window.api.vault.saveAsset(filename, new Uint8Array(buf))
          const cursor = view.state.selection.main.from
          view.dispatch({
            changes: { from: cursor, to: cursor, insert: `![[${savedName}]]` },
            selection: { anchor: cursor + savedName.length + 5 }
          })
        } catch (err) {
          console.error('Failed to save pasted image:', err)
        }
      })
      return true
    }
    return false
  }
})
