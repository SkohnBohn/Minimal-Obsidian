import React, { useEffect, useRef, useState } from 'react'
import { EditorView } from '@codemirror/view'
import { setSearchQuery, findNext, SearchQuery } from '@codemirror/search'

interface Props {
  view: EditorView | null
  onClose: () => void
}

export default function FindBar({ view, onClose }: Props) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

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
    } else if (e.key === 'Escape' || ((e.metaKey || e.ctrlKey) && e.key === 'f')) {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <div className="find-bar">
      <input
        ref={inputRef}
        className="find-bar-input"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="find"
        spellCheck={false}
      />
    </div>
  )
}
