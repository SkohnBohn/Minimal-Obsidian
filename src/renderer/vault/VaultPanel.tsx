import React, { useState, useEffect, useRef } from 'react'

interface FileEntry { name: string; path: string; mtime: number }

interface Props {
  onVaultSet: (files: FileEntry[]) => void
}

export default function VaultPanel({ onVaultSet }: Props) {
  const [pathInput, setPathInput] = useState('')
  const [currentPath, setCurrentPath] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    window.api.vault.getPath().then(p => {
      setCurrentPath(p)
      if (p) setPathInput(p)
    })
    inputRef.current?.focus()
  }, [])

  async function apply() {
    const p = pathInput.trim()
    if (!p) return
    setError(null)
    const result = await window.api.vault.setPath(p)
    if (result.error) { setError(result.error); return }
    if (result.files) { setCurrentPath(p); onVaultSet(result.files) }
  }

  return (
    <div className="settings-panel">
      <div className="settings-section">vault path</div>

      {currentPath && (
        <div style={{ fontSize: 12, color: 'var(--stone)', whiteSpace: 'nowrap' }}>
          {currentPath}
        </div>
      )}

      <input
        ref={inputRef}
        className="vault-path-input"
        value={pathInput}
        onChange={e => { setPathInput(e.target.value); setError(null) }}
        onKeyDown={e => { if (e.key === 'Enter') apply() }}
        placeholder="/Users/you/notes"
        spellCheck={false}
      />

      {error && (
        <div style={{ fontSize: 12, color: '#a03030', width: 220 }}>{error}</div>
      )}

      <button className="vault-apply-btn" onClick={apply}>
        set
      </button>
    </div>
  )
}
