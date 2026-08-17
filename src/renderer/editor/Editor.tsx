import React, { useEffect, useRef } from 'react'
import { EditorView, keymap } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { wikilinkExtension, setNoteNames } from './wikilinkExt'
import type { Tab } from '../tabs/useTabs'

interface EditorProps {
  tab: Tab
  noteNames: string[]
  header?: React.ReactNode
  onNavigateNote: (name: string) => void  // left-click: navigate current tab
  onOpenNote: (name: string) => void       // right-click / cmd+click: new tab
  onContentChange: (tabId: string, content: string, state: EditorState, scrollPos: number) => void
}

export default function Editor({ tab, noteNames, header, onNavigateNote, onOpenNote, onContentChange }: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const initialState = tab.cmState ?? EditorState.create({
      doc: tab.initialContent ?? '',
      extensions: buildExtensions(tab.id, noteNames, onNavigateNote, onOpenNote, onContentChange)
    })

    const view = new EditorView({ state: initialState, parent: containerRef.current })
    viewRef.current = view

    // Restore scroll after CM has finished measuring content (RAF alone is too early for long docs)
    if (tab.scrollPos) {
      view.requestMeasure({
        read: () => null,
        write: () => { view.scrollDOM.scrollTop = tab.scrollPos }
      })
    }

    return () => {
      if (viewRef.current) {
        const scrollPos = viewRef.current.scrollDOM.scrollTop
        onContentChange(tab.id, viewRef.current.state.doc.toString(), viewRef.current.state, scrollPos)
      }
      view.destroy()
      viewRef.current = null
    }
  // Remount when tab id OR contentVersion changes (in-tab navigation)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.id, tab.contentVersion])

  // Reactively update note names without remounting
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
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      markdown(),
      EditorView.lineWrapping,
      wikilinkExtension({ noteNames: names, onNavigate: navigate, onOpenNewTab: openNewTab }),
      EditorView.updateListener.of(update => {
        if (update.docChanged) {
          onChange(tabId, update.state.doc.toString(), update.state, update.view.scrollDOM.scrollTop)
        }
      })
    ]
  }

  return (
    <div className="editor-wrap">
      {header}
      <div className="editor-inner" ref={containerRef} style={{ minHeight: '100%' }} />
    </div>
  )
}
