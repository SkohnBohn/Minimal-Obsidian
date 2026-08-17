import React, { useEffect, useRef } from 'react'
import { EditorView, keymap, highlightActiveLine } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { wikilinkExtension, setNoteNames } from './wikilinkExt'
import type { Tab } from '../tabs/useTabs'

interface EditorProps {
  tab: Tab
  noteNames: string[]
  onOpenNote: (name: string) => void
  onContentChange: (tabId: string, content: string, state: EditorState, scrollPos: number) => void
}

export default function Editor({ tab, noteNames, onOpenNote, onContentChange }: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const initialState = tab.cmState ?? EditorState.create({
      doc: tab.initialContent ?? '',
      extensions: buildExtensions(tab.id, noteNames, onOpenNote, onContentChange)
    })

    const view = new EditorView({
      state: initialState,
      parent: containerRef.current
    })
    viewRef.current = view

    // Restore scroll
    requestAnimationFrame(() => {
      if (tab.scrollPos) view.scrollDOM.scrollTop = tab.scrollPos
    })

    return () => {
      // Save scroll before destroying
      if (viewRef.current) {
        const scrollPos = viewRef.current.scrollDOM.scrollTop
        onContentChange(
          tab.id,
          viewRef.current.state.doc.toString(),
          viewRef.current.state,
          scrollPos
        )
      }
      view.destroy()
      viewRef.current = null
    }
  // Recreate editor only when tab.id changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.id])

  // Update note names reactively
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({ effects: setNoteNames.of(noteNames) })
  }, [noteNames])

  function buildExtensions(
    tabId: string,
    names: string[],
    openNote: (n: string) => void,
    onChange: EditorProps['onContentChange']
  ) {
    return [
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      markdown(),
      highlightActiveLine(),
      EditorView.lineWrapping,
      wikilinkExtension({ noteNames: names, onOpen: openNote }),
      EditorView.updateListener.of(update => {
        if (update.docChanged) {
          const scrollPos = update.view.scrollDOM.scrollTop
          onChange(tabId, update.state.doc.toString(), update.state, scrollPos)
        }
      })
    ]
  }

  return (
    <div className="editor-wrap">
      <div
        className="editor-inner"
        ref={containerRef}
        style={{ minHeight: '100%' }}
      />
    </div>
  )
}
