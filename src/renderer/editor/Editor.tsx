import React, { useEffect, useRef } from 'react'
import { EditorView, keymap } from '@codemirror/view'
import { EditorState, Prec } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { search } from '@codemirror/search'
import { markdown } from '@codemirror/lang-markdown'
import { wikilinkExtension, setNoteNames } from './wikilinkExt'
import { markdownDecorationsPlugin } from './markdownDecorations'
import { imageEmbedExt } from './imageEmbedExt'
import { imagePasteExt } from './imagePasteExt'
import { insertFootnoteRef, addFootnoteDef, footnoteEnterCommand, footnoteTooltipExt } from './footnoteExt'
import type { Tab } from '../tabs/useTabs'

interface EditorProps {
  tab: Tab
  noteNames: string[]
  header?: React.ReactNode
  onNavigateNote: (name: string) => void
  onOpenNote: (name: string) => void
  onContentChange: (tabId: string, content: string, state: EditorState, scrollPos: number) => void
  onEditorUnmount: (tabId: string, capturedPath: string, content: string) => void
  onViewReady: (view: EditorView | null) => void
}

export default function Editor({ tab, noteNames, header, onNavigateNote, onOpenNote, onContentChange, onEditorUnmount, onViewReady }: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const initialState = tab.cmState ?? EditorState.create({
      doc: tab.initialContent ?? '',
      extensions: buildExtensions(tab.id, noteNames, onNavigateNote, onOpenNote, onContentChange)
    })

    let view: EditorView
    try {
      view = new EditorView({ state: initialState, parent: containerRef.current })
    } catch (err) {
      console.error('[Editor] CM6 init failed:', err)
      return
    }
    viewRef.current = view
    onViewReady(view)

    if (tab.scrollPos) {
      view.requestMeasure({
        read: () => null,
        write: () => { view.scrollDOM.scrollTop = tab.scrollPos }
      })
    }

    return () => {
      onViewReady(null)
      if (viewRef.current) {
        onEditorUnmount(tab.id, tab.path, viewRef.current.state.doc.toString())
      }
      view.destroy()
      viewRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.id, tab.contentVersion])

  useEffect(() => {
    viewRef.current?.dispatch({ effects: setNoteNames.of(noteNames) })
  }, [noteNames])

  function buildExtensions(
    tabId: string,
    names: string[],
    navigate: (n: string) => void,
    openNewTab: (n: string) => void,
    onChange: EditorProps['onContentChange']
  ) {
    return [
      history(),
      search({ top: false }),
      Prec.highest(keymap.of([{ key: 'Enter', run: footnoteEnterCommand }])),
      keymap.of([
        { key: 'Mod-Shift-o', run: insertFootnoteRef },
        { key: 'Mod-Shift-p', run: addFootnoteDef },
        ...defaultKeymap, ...historyKeymap, indentWithTab
      ]),
      footnoteTooltipExt,
      markdown(),
      EditorView.lineWrapping,
      EditorView.theme({
        '.cm-content': { padding: '0', caretColor: 'var(--ink)' },
        '.cm-line':    { padding: '0', lineHeight: '1.7' },
        '.cm-tooltip': { background: 'var(--bg-inset) !important', border: '1px solid var(--ash) !important', borderRadius: '0 !important', boxShadow: 'none !important' },
      }),
      wikilinkExtension({ noteNames: names, onNavigate: navigate, onOpenNewTab: openNewTab }),
      imageEmbedExt,
      imagePasteExt,
      markdownDecorationsPlugin,
      EditorView.updateListener.of(update => {
        if (update.docChanged) {
          onChange(tabId, update.state.doc.toString(), update.state, update.view.scrollDOM.scrollTop)
        }
      })
    ]
  }

  return (
    <div className="editor-wrap">
      <div className="editor-content">
        {header}
        <div ref={containerRef} style={{ minHeight: '100%' }} />
      </div>
    </div>
  )
}
