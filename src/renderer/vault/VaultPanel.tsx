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
    })
  }, [])

  async function apply() {
    const p = pathInput.trim().replace(/\\(.)/g, '$1')
    if (!p) return
    setError(null)
    const result = await window.api.vault.setPath(p)
    if (result.error) { setError(result.error); return }
    if (result.files) { setCurrentPath(p); setPathInput(''); onVaultSet(result.files) }
  }

  return (
    <div className="vault-panel">
      <div className="vault-panel-inner">
        <div className="vault-panel-section">current vault path</div>

        {currentPath && (
          <div className="vault-panel-path">{currentPath}</div>
        )}

        <input
          ref={inputRef}
          className="vault-path-input"
          value={pathInput}
          onChange={e => { setPathInput(e.target.value); setError(null) }}
          onKeyDown={e => { if (e.key === 'Enter') apply() }}
          placeholder="set vault path"
          spellCheck={false}
        />

        {error && (
          <div className="vault-panel-error">{error}</div>
        )}

        <button className="vault-apply-btn" onClick={apply}>set</button>
      </div>
    </div>
  )
}
