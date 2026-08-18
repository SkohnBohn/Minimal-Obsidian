import React, { useState, useEffect } from 'react'

const THEMES = ['solace', 'light', 'dark'] as const
type Theme = typeof THEMES[number]

function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t
  window.api.settings.set('theme', t)
}

export default function SettingsPanel() {
  const [includeSources, setIncludeSources] = useState(true)
  const [theme, setTheme] = useState<Theme>('solace')

  useEffect(() => {
    window.api.settings.get('includeSources').then(v => {
      setIncludeSources(v === undefined ? true : v as boolean)
    })
    window.api.settings.get('theme').then(v => {
      setTheme((v as Theme | undefined) ?? 'solace')
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
    </div>
  )
}
