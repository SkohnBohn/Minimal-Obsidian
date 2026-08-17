import React, { useEffect, useRef } from 'react'
import { EditorView, keymap } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { wikilinkExtension, setNoteNames } from './wikilinkExt'
import { markdownDecorationsPlugin } from './markdownDecorations'
import type { Tab } from '../tabs/useTabs'

interface EditorProps {
  tab: Tab
  noteNames: string[]
  header?: React.ReactNode
  onNavigateNote: (name: string) => void  // left-click: navigate current tab
  onOpenNote: (name: string) => void       // right-click / cmd+click: new tab
  onContentChange: (tabId: string, content: string, state: EditorState, scrollPos: number) => void
  // Separate unmount callback that writes to the path captured at mount time without
  // touching React state — prevents stale cmState from contaminating a navigated tab.
  onEditorUnmount: (tabId: string, capturedPath: string, content: string) => void
}

export default function Editor({ tab, noteNames, header, onNavigateNote, onOpenNote, onContentChange, onEditorUnmount }: EditorProps) {
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

    // Restore scroll after CM has finished measuring content (RAF alone is too early for long docs)
    if (tab.scrollPos) {
      view.requestMeasure({
        read: () => null,
        write: () => { view.scrollDOM.scrollTop = tab.scrollPos }
      })
    }

    return () => {
      if (viewRef.current) {
        // Use the dedicated unmount callback so the captured path (from mount time)
        // is used for the save — never the tab's current path which may have already
        // changed due to goBack / goForward / wikilink navigation.
        onEditorUnmount(tab.id, tab.path, viewRef.current.state.doc.toString())
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
      // Override CM6's base theme which sets .cm-line { padding: 0 2px 0 4px }.
      // EditorView.theme() wins over the base theme via specificity, so this is
      // the correct way — a plain global .cm-line rule loses to CM6's scoped styles.
      EditorView.theme({
        '.cm-content': { padding: '0', caretColor: 'var(--ink)' },
        '.cm-line':    { padding: '0', lineHeight: '1.7' },
      }),
      wikilinkExtension({ noteNames: names, onNavigate: navigate, onOpenNewTab: openNewTab }),
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
