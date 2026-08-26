import React, { useState, useEffect, useRef } from 'react'

const THEMES = ['solace', 'light', 'dark'] as const
type Theme = typeof THEMES[number]

interface FileEntry { name: string; path: string; mtime: number }

interface Props {
  onVaultSet: (files: FileEntry[], newPath: string) => void
  overlayMode: boolean
  overlayPaths: string[]
  onOverlayModeChange: (enabled: boolean, files: FileEntry[]) => void
  onVaultToggle: (vaultPath: string, files: FileEntry[], deactivatedPath?: string) => void
  keyboardOnlyTabs: boolean
  onKeyboardOnlyTabsChange: (v: boolean) => void
  hideRail: boolean
  onHideRailChange: (v: boolean) => void
}

function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t
  window.api.settings.set('theme', t)
}

function basename(p: string) {
  return p.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? p
}

export default function SettingsPanel({ onVaultSet, overlayMode, overlayPaths, onOverlayModeChange, onVaultToggle, keyboardOnlyTabs, onKeyboardOnlyTabsChange, hideRail, onHideRailChange }: Props) {
  const [includeSources, setIncludeSources] = useState(true)
  const [theme, setTheme] = useState<Theme>('solace')
  const [currentPath, setCurrentPath] = useState<string | null>(null)
  const [savedVaults, setSavedVaults] = useState<string[]>([])
  const [pathInput, setPathInput] = useState('')
  const [pathError, setPathError] = useState<string | null>(null)
  const [addingVault, setAddingVault] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    window.api.settings.get('includeSources').then(v => {
      setIncludeSources(v === undefined ? true : v as boolean)
    })
    window.api.settings.get('theme').then(v => {
      setTheme((v as Theme | undefined) ?? 'solace')
    })
    Promise.all([window.api.vault.getPath(), window.api.vault.getSaved()]).then(([cur, saved]) => {
      setCurrentPath(cur)
      // Ensure the active vault is always in the list
      if (cur && !saved.includes(cur)) {
        const next = [cur, ...saved]
        setSavedVaults(next)
        window.api.vault.setSaved(next)
      } else {
        setSavedVaults(saved)
      }
    })
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

  async function switchVault(p: string) {
    const result = await window.api.vault.setPath(p)
    if (result.error) { setPathError(result.error); return }
    if (result.files) {
      setCurrentPath(p)
      window.api.vault.getSaved().then(setSavedVaults)
      onVaultSet(result.files, p)
    }
  }

  async function removeVault(p: string) {
    const next = savedVaults.filter(v => v !== p)
    setSavedVaults(next)
    await window.api.vault.setSaved(next)
  }

  async function applyVault() {
    const p = pathInput.trim().replace(/^['"]|['"]$/g, '').replace(/\\(.)/g, '$1')
    if (!p) return
    setPathError(null)
    const result = await window.api.vault.setPath(p)
    if (result.error) { setPathError(result.error); return }
    if (result.files) {
      setCurrentPath(p)
      setPathInput('')
      setAddingVault(false)
      window.api.vault.getSaved().then(setSavedVaults)
      onVaultSet(result.files, p)
    }
  }

  function openAddVault() {
    setAddingVault(true)
    setPathError(null)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function cancelAddVault() {
    setAddingVault(false)
    setPathInput('')
    setPathError(null)
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

      <div className="settings-section">tabs</div>
      <label className="settings-row">
        <input type="checkbox" checked={keyboardOnlyTabs} onChange={e => onKeyboardOnlyTabsChange(e.target.checked)} />
        keyboard only tab switching
      </label>
      <label className="settings-row">
        <input type="checkbox" checked={hideRail} onChange={e => onHideRailChange(e.target.checked)} />
        hide left bar
      </label>

      <div className="settings-section">vault</div>

      <label className="settings-row">
        <input
          type="checkbox"
          checked={overlayMode}
          onChange={async e => {
            const result = await window.api.vault.setOverlayMode(e.target.checked)
            onOverlayModeChange(e.target.checked, result.files)
          }}
        />
        overlaying vaults
      </label>

      {savedVaults.length > 0 && (
        <div className="settings-vault-list">
          {savedVaults.map(p => {
            const isPrimary = p === currentPath
            const isOverlayActive = overlayPaths.includes(p)
            return (
              <div
                key={p}
                className={`settings-vault-item${(!overlayMode && isPrimary) || (overlayMode && isOverlayActive) ? ' active' : ''}`}
              >
                {overlayMode && (
                  <input
                    type="checkbox"
                    className="settings-vault-item-check"
                    checked={isOverlayActive}
                    disabled={isPrimary}
                    onChange={async () => {
                      const result = await window.api.vault.toggleOverlayPath(p)
                      onVaultToggle(p, result.files, result.deactivatedPath)
                    }}
                  />
                )}
                <button
                  className="settings-vault-item-name"
                  title={p}
                  onClick={() => { if (!overlayMode) switchVault(p) }}
                  style={overlayMode ? { cursor: 'default' } : undefined}
                >
                  {basename(p)}
                </button>
                <button
                  className="settings-vault-item-remove"
                  onClick={() => removeVault(p)}
                  aria-label="remove"
                >
                  ×
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className="settings-vault-add">
        {addingVault ? (
          <div className="settings-vault-add-row">
            <input
              ref={inputRef}
              className="settings-vault-input"
              value={pathInput}
              onChange={e => { setPathInput(e.target.value); setPathError(null) }}
              onKeyDown={e => {
                if (e.key === 'Enter') applyVault()
                if (e.key === 'Escape') cancelAddVault()
              }}
              placeholder="set vault path"
              spellCheck={false}
            />
            <button className="settings-vault-btn" onClick={applyVault}>set</button>
          </div>
        ) : (
          <button className="settings-vault-plus" onClick={openAddVault}>+</button>
        )}
        {pathError && <div className="settings-vault-error">{pathError}</div>}
      </div>
    </div>
  )
}
