import React, { useState, useEffect, useRef } from 'react'

const THEMES = ['solace', 'light', 'dark'] as const
type Theme = typeof THEMES[number]

interface FileEntry { name: string; path: string; mtime: number }

interface Props {
  onVaultSet: (files: FileEntry[]) => void
}

function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t
  window.api.settings.set('theme', t)
}

export default function SettingsPanel({ onVaultSet }: Props) {
  const [includeSources, setIncludeSources] = useState(true)
  const [theme, setTheme] = useState<Theme>('solace')
  const [currentPath, setCurrentPath] = useState<string | null>(null)
  const [pathInput, setPathInput] = useState('')
  const [pathError, setPathError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    window.api.settings.get('includeSources').then(v => {
      setIncludeSources(v === undefined ? true : v as boolean)
    })
    window.api.settings.get('theme').then(v => {
      setTheme((v as Theme | undefined) ?? 'solace')
    })
    window.api.vault.getPath().then(p => setCurrentPath(p))
  }, [])

  function toggle() {
    const next = !includeSources
    setIncludeSources(next)
    window.api.settings.set('includeSources', next)
  }

  function pickTheme(t: Theme) {
    setTheme(t)
    applyTheme(t)
  }

  async function applyVault() {
    const p = pathInput.trim().replace(/\\(.)/g, '$1')
    if (!p) return
    setPathError(null)
    const result = await window.api.vault.setPath(p)
    if (result.error) { setPathError(result.error); return }
    if (result.files) { setCurrentPath(p); setPathInput(''); onVaultSet(result.files) }
  }

  return (
    <div className="settings-panel">
      <div className="settings-section">theme</div>
      <div className="settings-theme-row">
        {THEMES.map(t => (
          <button
            key={t}
            className={`settings-theme-btn${theme === t ? ' active' : ''}`}
            onClick={() => pickTheme(t)}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="settings-section">search</div>
      <label className="settings-row">
        <input type="checkbox" checked={includeSources} onChange={toggle} />
        include sources in search
      </label>

      <div className="settings-section">vault</div>
      {currentPath && (
        <div className="settings-vault-path">{currentPath}</div>
      )}
      <input
        ref={inputRef}
        className="settings-vault-input"
        value={pathInput}
        onChange={e => { setPathInput(e.target.value); setPathError(null) }}
        onKeyDown={e => { if (e.key === 'Enter') applyVault() }}
        placeholder="set vault path"
        spellCheck={false}
      />
      {pathError && (
        <div className="settings-vault-error">{pathError}</div>
      )}
      <button className="settings-vault-btn" onClick={applyVault}>set</button>
    </div>
  )
}
