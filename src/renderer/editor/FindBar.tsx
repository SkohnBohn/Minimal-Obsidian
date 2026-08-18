import React, { useEffect, useRef } from 'react'
import { EditorView } from '@codemirror/view'
import { setSearchQuery, findNext, SearchQuery } from '@codemirror/search'

interface Props {
  view: EditorView | null
  query: string
  onQuery: (q: string) => void
  onClose: () => void
}

function clearPageHighlight() {
  if (typeof CSS !== 'undefined' && CSS.highlights) CSS.highlights.delete('find-highlight')
}

function highlightInPage(query: string, skipEl: HTMLElement | null) {
  clearPageHighlight()
  if (!query || typeof CSS === 'undefined' || !CSS.highlights) return

  const ranges: Range[] = []
  const q = query.toLowerCase()

  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (skipEl && skipEl.contains(node)) return
      const text = node.textContent ?? ''
      const lower = text.toLowerCase()
      let idx = 0
      while ((idx = lower.indexOf(q, idx)) !== -1) {
        const range = new Range()
        range.setStart(node, idx)
        range.setEnd(node, idx + query.length)
        ranges.push(range)
        idx += query.length
      }
    } else {
      for (const child of node.childNodes) walk(child)
    }
  }

  walk(document.body)
  if (ranges.length) CSS.highlights.set('find-highlight', new Highlight(...ranges))
}

export default function FindBar({ view, query, onQuery, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  // CodeMirror highlight for note tabs
  useEffect(() => {
    if (!view) return
    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: query })) })
  }, [query, view])

  // CSS Custom Highlight API for non-editor tabs — no focus theft
  useEffect(() => {
    if (view) return
    highlightInPage(query, inputRef.current)
  }, [query, view])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      view?.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: '' })) })
      clearPageHighlight()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (view) {
        if (query) findNext(view)
      } else if (query) {
        // Navigate to next match then immediately re-focus input
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(window as any).find(query, false, false, true)
        setTimeout(() => inputRef.current?.focus(), 0)
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'f') {
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
  }

  return (
    <div className="find-bar">
      <input
        ref={inputRef}
        className="find-bar-input"
        value={query}
        onChange={e => onQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="find"
        spellCheck={false}
      />
    </div>
  )
}
