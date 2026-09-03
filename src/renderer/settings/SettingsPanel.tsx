import React, { useState, useEffect, useRef } from 'react'

const THEMES = ['solace', 'light', 'dark'] as const
type Theme = typeof THEMES[number]

interface FileEntry { name: string; path: string; mtime: number }

interface Props {
  onVaultSet: (files: FileEntry[], newPath: string) => void
  onVaultClear: () => void
  overlayMode: boolean
  overlayPaths: string[]
  onOverlayModeChange: (enabled: boolean, files: FileEntry[], newPrimary?: string | null) => void
  onVaultToggle: (vaultPath: string, files: FileEntry[], deactivatedPath?: string, newPrimary?: string | null) => void
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

export default function SettingsPanel({ onVaultSet, onVaultClear, overlayMode, overlayPaths, onOverlayModeChange, onVaultToggle, keyboardOnlyTabs, onKeyboardOnlyTabsChange, hideRail, onHideRailChange }: Props) {
  const [includeSources, setIncludeSources] = useState(true)
  const [theme, setTheme] = useState<Theme>('solace')
  const [currentPath, setCurrentPath] = useState<string | null>(null)
  const [savedVaults, setSavedVaults] = useState<string[]>([])
  const [pathInput, setPathInput] = useState('')
  const [pathError, setPathError] = useState<string | null>(null)
  const [addingVault, setAddingVault] = useState(false)
  // Local shadow state for immediate checkbox feedback while async IPC is in flight
  const [localOverlayMode, setLocalOverlayMode] = useState(overlayMode)
  const [localOverlayPaths, setLocalOverlayPaths] = useState(overlayPaths)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    // Auto-focus first control so arrow keys work immediately
    const first = panel.querySelector<HTMLElement>('button, input[type="checkbox"]')
    first?.focus()
    const handler = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null
      if (active?.tagName === 'INPUT' && (active as HTMLInputElement).type === 'text') return
      const nav = e.key === 'ArrowDown' || e.key === 'ArrowUp' ||
                  e.key === 'ArrowLeft' || e.key === 'ArrowRight'
      const isEnterOnCheckbox = e.key === 'Enter' && active?.tagName === 'INPUT' &&
                                (active as HTMLInputElement).type === 'checkbox'
      if (!nav && !isEnterOnCheckbox) return
      e.preventDefault()
      if (isEnterOnCheckbox) { active!.click(); return }

      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input[type="checkbox"]'
      ))

      // Group into rows by vertical position
      const rows: HTMLElement[][] = []
      const rowTops: number[] = []
      for (const el of focusable) {
        const top = Math.round(el.getBoundingClientRect().top)
        const ri = rowTops.findIndex(t => Math.abs(t - top) < 5)
        if (ri === -1) { rowTops.push(top); rows.push([el]) }
        else rows[ri].push(el)
      }

      let curRow = -1, curCol = -1
      for (let r = 0; r < rows.length; r++) {
        const c = active ? rows[r].indexOf(active) : -1
        if (c !== -1) { curRow = r; curCol = c; break }
      }
      if (curRow === -1) return  // focus is not inside this panel — do nothing

      if (e.key === 'ArrowRight') {
        rows[curRow][curCol + 1]?.focus()
      } else if (e.key === 'ArrowLeft') {
        if (rows[curRow][curCol - 1]) {
          rows[curRow][curCol - 1].focus()
        } else {
          document.querySelector<HTMLElement>('.sidebar-input')?.focus()
        }
      } else if (e.key === 'ArrowDown') {
        const nextRow = rows[curRow + 1]
        if (nextRow) nextRow[Math.min(curCol, nextRow.length - 1)]?.focus()
      } else if (e.key === 'ArrowUp') {
        const prevRow = rows[curRow - 1]
        if (prevRow) prevRow[Math.min(curCol, prevRow.length - 1)]?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => { setLocalOverlayMode(overlayMode) }, [overlayMode])
  useEffect(() => { setLocalOverlayPaths(overlayPaths) }, [overlayPaths])

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
    <div ref={panelRef} className="settings-panel">
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
          checked={localOverlayMode}
          onChange={async e => {
            const checked = e.target.checked
            setLocalOverlayMode(checked)
            const result = await window.api.vault.setOverlayMode(checked)
            if (!checked && 'newPrimary' in result && result.newPrimary !== currentPath) {
              setCurrentPath(result.newPrimary ?? null)
            }
            onOverlayModeChange(checked, result.files, result.newPrimary)
          }}
        />
        overlaying vaults
      </label>

      {savedVaults.length > 0 && (
        <div className="settings-vault-list">
          {savedVaults.map(p => {
            const isPrimary = p === currentPath
            const isOverlayActive = localOverlayPaths.includes(p)
            const isActive = localOverlayMode ? isOverlayActive : isPrimary
            return (
              <div key={p} className={`settings-vault-item${isActive ? ' active' : ''}`}>
                <button
                  className={`settings-vault-item-name${localOverlayMode && isPrimary ? ' primary' : ''}`}
                  title={p}
                  onClick={async () => {
                    if (!localOverlayMode) {
                      if (isPrimary) {
                        // Deselect the active vault
                        setCurrentPath(null)
                        await window.api.vault.clearVault()
                        onVaultClear()
                      } else {
                        switchVault(p)
                      }
                    } else {
                      const nextPaths = isOverlayActive
                        ? localOverlayPaths.filter(x => x !== p)
                        : [...localOverlayPaths, p]
                      setLocalOverlayPaths(nextPaths)
                      const result = await window.api.vault.toggleOverlayPath(p)
                      if ('newPrimary' in result && result.newPrimary !== currentPath) {
                        setCurrentPath(result.newPrimary ?? null)
                      }
                      onVaultToggle(p, result.files, result.deactivatedPath, result.newPrimary)
                    }
                  }}
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
