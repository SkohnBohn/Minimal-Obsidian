import React, { useState, useEffect } from 'react'

export default function SettingsPanel() {
  const [includeSources, setIncludeSources] = useState(true)

  useEffect(() => {
    window.api.settings.get('includeSources').then(v => {
      setIncludeSources(v === undefined ? true : v as boolean)
    })
  }, [])

  function toggle() {
    const next = !includeSources
    setIncludeSources(next)
    window.api.settings.set('includeSources', next)
  }

  return (
    <div className="settings-panel">
      <div className="settings-section">search</div>
      <label className="settings-row">
        <input type="checkbox" checked={includeSources} onChange={toggle} />
        include sources in search
      </label>
    </div>
  )
}
