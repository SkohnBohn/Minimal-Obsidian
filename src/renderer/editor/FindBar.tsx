import React, { useEffect, useRef } from 'react'
import { EditorView } from '@codemirror/view'
import { setSearchQuery, findNext, SearchQuery } from '@codemirror/search'

interface Props {
  view: EditorView | null
  query: string
  onQuery: (q: string) => void
  onClose: () => void
}

export default function FindBar({ view, query, onQuery, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    if (!view) return
    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: query })) })
  }, [query, view])

  // Clear highlights when bar closes
  useEffect(() => {
    return () => {
      view?.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: '' })) })
    }
  }, [view])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (view && query) findNext(view)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
      e.preventDefault()
      e.stopPropagation()  // prevent App.tsx window handler from re-opening
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
