import React, { useState, useEffect, useCallback, useRef } from 'react'
import TabBar from './tabs/TabBar'
import { useTabs } from './tabs/useTabs'
import Editor from './editor/Editor'
import FindBar from './editor/FindBar'
import GraphPanel from './graph/GraphPanel'
import HotkeysPanel from './hotkeys/HotkeysPanel'
import SettingsPanel from './settings/SettingsPanel'
import SearchSidebar from './search/SearchSidebar'
import FileSwitcher from './modal/FileSwitcher'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

interface FileEntry { name: string; path: string; mtime: number }

export default function App() {
  const [files, setFiles] = useState<FileEntry[]>([])
  const [showSidebar, setShowSidebar] = useState(false)
  const [showSwitcher, setShowSwitcher] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{path:string;name:string;snippets:string[]}[]>([])
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSearchQuery = useCallback((q: string) => {
    setSearchQuery(q)
    if (searchDebounce.current) clearTimeout(searchDebounce.current)
    searchDebounce.current = setTimeout(async () => {
      if (!q.trim()) { setSearchResults([]); return }
      setSearchResults(await window.api.search.query(q))
    }, 120)
  }, [])
  const [showFind, setShowFind] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const activeEditorView = useRef<EditorView | null>(null)
  const handleViewReady = useCallback((view: EditorView | null) => {
    activeEditorView.current = view
  }, [])
  const titleInputRef = useRef<HTMLInputElement | null>(null)
  const [vaultReady, setVaultReady] = useState(false)
  const [keyboardOnlyTabs, setKeyboardOnlyTabs] = useState(false)
  const [hideRail, setHideRail] = useState(false)
  const [inlineSettings, setInlineSettings] = useState(false)
  const [overlayMode, setOverlayMode] = useState(false)
  const [overlayPaths, setOverlayPaths] = useState<string[]>([])
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleInput, setTitleInput] = useState('')

  const {
    tabs, activeTab, activeTabId, setActiveTabId,
    openTab, openTabForceNew, openTabByName, navigateInTab, goBack, goForward,
    openGraphTab, openHotkeysTab, openSettingsTab, renameTab, clearNaming,
    closeTab, createNewTab, switchTab, reorderTab,
    updateTabState, markTabSaved, resetTabs
  } = useTabs()

  const vaultPathRef = useRef<string>('')

  // ── Persist search state ─────────────────────────────────────────────────
  // Guard: don't save until after the initial load has finished, otherwise the
  // first-render defaults (false / '') would overwrite the persisted values.
  const searchStateLoaded = useRef(false)
  const pendingFindOpen = useRef(false)
  const findOpenRestored = useRef(false)

  useEffect(() => {
    if (searchStateLoaded.current) window.api.settings.set('search.sidebarOpen', showSidebar)
  }, [showSidebar])
  useEffect(() => {
    if (searchStateLoaded.current) window.api.settings.set('search.sidebarQuery', searchQuery)
  }, [searchQuery])
  useEffect(() => {
    if (searchStateLoaded.current) window.api.settings.set('search.findOpen', showFind)
  }, [showFind])
  useEffect(() => {
    if (searchStateLoaded.current) window.api.settings.set('search.findQuery', findQuery)
  }, [findQuery])

  // showFind resets on every activeTabId change; restore it only after first tab load.
  useEffect(() => { setShowFind(false) }, [activeTabId])
  useEffect(() => {
    if (activeTabId && !findOpenRestored.current) {
      findOpenRestored.current = true
      if (pendingFindOpen.current) setShowFind(true)
    }
  }, [activeTabId])

  // Auto-focus title input for brand-new tabs
  useEffect(() => {
    if (activeTab?.isNaming) {
      setTitleInput('')
      setEditingTitle(true)
    } else {
      setEditingTitle(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId])

  const enterTitleEdit = useCallback(() => {
    if (!activeTab) return
    setTitleInput(activeTab.name)
    setEditingTitle(true)
    // focus happens via autoFocus on the input after render
    setTimeout(() => {
      const el = titleInputRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(el.value.length, el.value.length)
    }, 0)
  }, [activeTab])

  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const pendingUnmountWrites = useRef<Promise<void>[]>([])
  const tabsRef = useRef(tabs)
  useEffect(() => { tabsRef.current = tabs }, [tabs])

  // ── Save-error banner ────────────────────────────────────────────────────
  const [saveError, setSaveError] = useState<string | null>(null)
  const errorBannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showSaveError = useCallback((filePath: string, err: unknown) => {
    console.error('Save failed:', filePath, err)
    const name = filePath.split('/').pop() ?? filePath
    setSaveError(`Could not save "${name}" — check disk space or permissions`)
    if (errorBannerTimer.current) clearTimeout(errorBannerTimer.current)
    errorBannerTimer.current = setTimeout(() => setSaveError(null), 6000)
  }, [])

  useEffect(() => {
    window.api.settings.get('theme').then(t => {
      document.documentElement.dataset.theme = (t as string | undefined) ?? 'solace'
    })
    window.api.settings.get('keyboardOnlyTabs').then(v => {
      if (v !== undefined) setKeyboardOnlyTabs(v as boolean)
    })
    window.api.settings.get('hideRail').then(v => {
      if (v !== undefined) setHideRail(v as boolean)
    })
    // Restore search state
    Promise.all([
      window.api.settings.get('search.sidebarOpen'),
      window.api.settings.get('search.sidebarQuery'),
      window.api.settings.get('search.findOpen'),
      window.api.settings.get('search.findQuery'),
    ]).then(([sidebarOpen, sidebarQuery, findOpen, findQuery]) => {
      if (sidebarOpen) setShowSidebar(true)
      if (sidebarQuery) {
        const q = sidebarQuery as string
        setSearchQuery(q)
        window.api.search.query(q).then(setSearchResults)
      }
      pendingFindOpen.current = !!(findOpen)
      if (findQuery) setFindQuery(findQuery as string)
      searchStateLoaded.current = true
    })
  }, [])

  useEffect(() => {
    ;(async () => {
      const savedVault = await window.api.settings.get('vaultPath') as string | undefined
      if (savedVault) {
        vaultPathRef.current = savedVault
        const overlayState = await window.api.vault.getOverlayState()
        setOverlayMode(overlayState.overlayMode)
        setOverlayPaths(overlayState.overlayPaths)
        setFiles(await window.api.vault.list())
        setVaultReady(true)
      } else {
        openSettingsTab()
        setVaultReady(true)
      }
    })()
  }, [])

  useEffect(() => {
    if (!vaultReady) return
    return window.api.vault.onChange(async () => setFiles(await window.api.vault.list()))
  }, [vaultReady])

  const noteNames = files.map(f => f.name)

  const handleContentChange = useCallback(
    (tabId: string, content: string, state: EditorState, scrollPos: number) => {
      updateTabState(tabId, content, state, scrollPos)
      const timer = saveTimers.current.get(tabId)
      if (timer) clearTimeout(timer)
      const tab = tabsRef.current.find(t => t.id === tabId)
      if (!tab) return
      saveTimers.current.set(tabId, setTimeout(async () => {
        saveTimers.current.delete(tabId)
        try {
          await window.api.vault.write(tab.path, content)
          markTabSaved(tabId, content)
        } catch (err) {
          showSaveError(tab.path, err)
        }
      }, 500))
    },
    [updateTabState, markTabSaved, showSaveError]
  )

  const handleEditorUnmount = useCallback(
    (tabId: string, capturedPath: string, content: string) => {
      const timer = saveTimers.current.get(tabId)
      if (timer) { clearTimeout(timer); saveTimers.current.delete(tabId) }
      // Write to the path captured at editor mount time. Do NOT call updateTabState —
      // the tab may have already navigated to a different file.
      const write = window.api.vault.write(capturedPath, content)
        .catch(err => showSaveError(capturedPath, err))
      pendingUnmountWrites.current.push(write)
      write.finally(() => {
        pendingUnmountWrites.current = pendingUnmountWrites.current.filter(p => p !== write)
      })
    },
    [showSaveError]
  )

  function closeTabsFromDir(dir: string) {
    const sep = dir.endsWith('/') || dir.endsWith('\\') ? dir : dir + '/'
    tabsRef.current
      .filter(t => t.path.startsWith(sep))
      .forEach(t => handleCloseTab(t.id))
  }

  const handleOverlayModeChange = useCallback((enabled: boolean, files: FileEntry[], newPrimary?: string | null) => {
    setOverlayMode(enabled)
    if (!enabled) {
      // Update primary if it was promoted from an overlay path
      if (newPrimary !== undefined) vaultPathRef.current = newPrimary ?? ''
      // Close tabs that don't belong to the new primary
      const primary = newPrimary ?? vaultPathRef.current
      tabsRef.current
        .filter(t => t.path && !t.path.startsWith(primary + '/') && !t.path.startsWith(primary + '\\') && t.path !== primary)
        .forEach(t => handleCloseTab(t.id))
      setOverlayPaths([])
    } else {
      setOverlayPaths(vaultPathRef.current ? [vaultPathRef.current] : [])
    }
    setFiles(files)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleVaultToggle = useCallback((vaultPath: string, files: FileEntry[], deactivatedPath?: string, newPrimary?: string | null) => {
    setOverlayPaths(prev =>
      prev.includes(vaultPath) ? prev.filter(p => p !== vaultPath) : [...prev, vaultPath]
    )
    if (deactivatedPath) closeTabsFromDir(deactivatedPath)
    if (newPrimary !== undefined) vaultPathRef.current = newPrimary ?? ''
    setFiles(files)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleVaultClear = useCallback(() => {
    vaultPathRef.current = ''
    setOverlayMode(false)
    setOverlayPaths([])
    // Close all note tabs
    tabsRef.current
      .filter(t => t.type === 'note')
      .forEach(t => handleCloseTab(t.id))
    setFiles([])
    setSearchQuery('')
    setSearchResults([])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleVaultSet = useCallback(async (files: FileEntry[], newPath: string) => {
    const oldPath = vaultPathRef.current
    if (oldPath) {
      const allSessions = ((await window.api.settings.get('vaultSessions')) ?? {}) as
        Record<string, { tabs: Array<{ path: string; name: string; type: string }>; activeTabName: string | null }>
      const activeTabName = tabsRef.current.find(t => t.id === activeTabId)?.name ?? null
      allSessions[oldPath] = {
        tabs: tabsRef.current.map(t => ({ path: t.path, name: t.name, type: t.type })),
        activeTabName,
      }
      await window.api.settings.set('vaultSessions', allSessions)
    }
    const allSessions = ((await window.api.settings.get('vaultSessions')) ?? {}) as
      Record<string, { tabs: Array<{ path: string; name: string; type: string }>; activeTabName: string | null }>
    const saved = allSessions[newPath] ?? null
    vaultPathRef.current = newPath
    setOverlayMode(false)
    setOverlayPaths([])
    await resetTabs(saved?.tabs ?? [], saved?.activeTabName ?? null)
    setSearchQuery('')
    setSearchResults([])
    setFiles(files)
    setVaultReady(true)
  }, [activeTabId, resetTabs])

  const handleCloseTab = useCallback(async (tabId: string) => {
    // If there is a pending debounced write, cancel it and flush now so the content
    // is on disk before the tab (and its cmState) is removed from state.
    const timer = saveTimers.current.get(tabId)
    const tab = tabsRef.current.find(t => t.id === tabId)
    if (timer && tab?.path && tab.cmState) {
      clearTimeout(timer)
      saveTimers.current.delete(tabId)
      try {
        await window.api.vault.write(tab.path, tab.cmState.doc.toString())
      } catch (err) {
        showSaveError(tab.path, err)
      }
    }
    closeTab(tabId)
  }, [closeTab, showSaveError])

  const handleNavigateNote = useCallback((name: string) => {
    if (activeTabId && activeTab?.type === 'note') navigateInTab(activeTabId, name)
    else openTabByName(name)
  }, [activeTab, activeTabId, navigateInTab, openTabByName])

  const handleOpenNote = useCallback((name: string) => openTabByName(name), [openTabByName])
  const handleOpenFile = useCallback((path: string, name: string) => openTab(path, name), [openTab])

  const openNoteNewTab = useCallback(async (name: string) => {
    const files = await window.api.vault.list()
    const nameLower = name.toLowerCase()
    const file = files.find(f => f.name.toLowerCase() === nameLower)
    if (file) {
      openTabForceNew(file.path, file.name)
    } else {
      const path = await window.api.vault.create(name)
      openTabForceNew(path, name)
    }
  }, [openTabForceNew])

  const commitRename = useCallback(async () => {
    if (!activeTab || !editingTitle) return
    const newName = titleInput.trim()
    setEditingTitle(false)
    if (activeTab.isNaming) clearNaming(activeTab.id)
    if (!newName || newName === activeTab.name) return
    try {
      const newPath = await window.api.vault.rename(activeTab.path, newName)
      renameTab(activeTab.id, newName, newPath)
      setFiles(await window.api.vault.list())
    } catch (err) {
      console.error('Rename failed', err)
    }
  }, [activeTab, editingTitle, titleInput, renameTab, clearNaming])

  useEffect(() => {
    return window.api.app.onSwitchTab(dir => switchTab(dir))
  }, [switchTab])

  useEffect(() => {
    return window.api.app.onFullscreen(fs => {
      document.documentElement.dataset.fullscreen = fs ? 'true' : 'false'
    })
  }, [])

  useEffect(() => {
    return window.api.app.onWillQuit(async () => {
      // Cancel pending debounce timers and write dirty open tabs immediately.
      for (const timer of saveTimers.current.values()) clearTimeout(timer)
      saveTimers.current.clear()
      const activeWrites = tabsRef.current
        .filter(t => t.isDirty && t.cmState && t.path)
        .map(t => window.api.vault.write(t.path, t.cmState!.doc.toString()))
      // Also await any in-flight unmount writes (e.g. user navigated then quit).
      await Promise.allSettled([...activeWrites, ...pendingUnmountWrites.current])
      await window.api.app.confirmQuit()
    })
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey
      if (meta && !e.shiftKey && !e.altKey && e.key === 'o') {
        e.preventDefault(); setShowSwitcher(v => !v)
      } else if (meta && !e.shiftKey && !e.altKey && e.key === 'f') {
        e.preventDefault()
        if (activeTab) setShowFind(v => !v)
      } else if (meta && e.shiftKey && !e.altKey && e.key === 'f') {
        e.preventDefault(); setShowSidebar(v => !v)
      } else if (meta && !e.shiftKey && !e.altKey && e.key === 'n') {
        e.preventDefault(); createNewTab()
      } else if (meta && !e.shiftKey && !e.altKey && e.key === 'w') {
        e.preventDefault(); if (activeTabId) handleCloseTab(activeTabId)
      } else if (meta && e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault(); if (activeTabId) goBack(activeTabId)
      } else if (meta && e.altKey && e.key === 'ArrowRight') {
        e.preventDefault(); if (activeTabId) goForward(activeTabId)
      } else if (meta && !e.shiftKey && !e.altKey && e.key === ',') {
        e.preventDefault(); openSettingsTab()
      } else if (meta && e.shiftKey && !e.altKey && e.key === 'G') {
        e.preventDefault(); openGraphTab()
      } else if (e.key === 'Escape') {
        setShowSwitcher(false); setShowSidebar(false); setShowFind(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeTabId, handleCloseTab, createNewTab, switchTab, goBack, goForward, openSettingsTab, openGraphTab])

  return (
    <div className="app">
      {/* Draggable titlebar strip — sits above everything, keeps traffic lights clear */}
      <div className="titlebar" />

      <div className="app-row" data-hide-rail={hideRail ? 'true' : undefined}>
        {/* Left rail */}
        {!hideRail && (
          <div className="rail">
            <button
              className="rail-btn"
              data-tip="settings"
              onClick={() => openSettingsTab(true)}
            >
              ◎
            </button>
            <button
              className="rail-btn"
              data-tip="graph"
              onClick={() => openGraphTab(true)}
            >
              ⬡
            </button>
            <button
              className="rail-btn"
              data-tip="shortcuts"
              onClick={() => openHotkeysTab(true)}
            >
              ⌘
            </button>
          </div>
        )}

        {/* Search sidebar — in flow, pushes main to the right */}
        {showSidebar && (
          <SearchSidebar
            query={searchQuery}
            results={searchResults}
            onQuery={handleSearchQuery}
            onOpen={(path, name) => {
              if (activeTabId && activeTab?.type === 'note') navigateInTab(activeTabId, name, true)
              else openTab(path, name)
              setShowSidebar(false)
            }}
          />
        )}

        {/* Main content */}
        <div className="main">
          <TabBar
            tabs={tabs}
            activeTabId={inlineSettings ? null : activeTabId}
            onActivate={id => { setActiveTabId(id); setInlineSettings(false) }}
            onClose={handleCloseTab}
            onReorder={reorderTab}
            keyboardOnly={keyboardOnlyTabs}
            onSettings={hideRail ? () => setInlineSettings(true) : undefined}
            settingsActive={hideRail && inlineSettings}
          />

          <div className="editor-pane">
            {inlineSettings ? (
              <SettingsPanel
                onVaultSet={handleVaultSet}
                onVaultClear={handleVaultClear}
                overlayMode={overlayMode}
                overlayPaths={overlayPaths}
                onOverlayModeChange={handleOverlayModeChange}
                onVaultToggle={handleVaultToggle}
                keyboardOnlyTabs={keyboardOnlyTabs}
                onKeyboardOnlyTabsChange={v => { setKeyboardOnlyTabs(v); window.api.settings.set('keyboardOnlyTabs', v) }}
                hideRail={hideRail}
                onHideRailChange={v => { setHideRail(v); window.api.settings.set('hideRail', v) }}
              />
            ) : activeTab?.type === 'graph' ? (
              <GraphPanel
                activeNoteName={null}
                onOpenNote={handleOpenNote}
                highlightNames={searchQuery.trim() ? new Set(searchResults.map(r => r.name)) : undefined}
              />
            ) : activeTab?.type === 'hotkeys' ? (
              <HotkeysPanel />
            ) : activeTab?.type === 'settings' ? (
              <SettingsPanel
                onVaultSet={handleVaultSet}
                onVaultClear={handleVaultClear}
                overlayMode={overlayMode}
                overlayPaths={overlayPaths}
                onOverlayModeChange={handleOverlayModeChange}
                onVaultToggle={handleVaultToggle}
                keyboardOnlyTabs={keyboardOnlyTabs}
                onKeyboardOnlyTabsChange={v => { setKeyboardOnlyTabs(v); window.api.settings.set('keyboardOnlyTabs', v) }}
                hideRail={hideRail}
                onHideRailChange={v => { setHideRail(v); window.api.settings.set('hideRail', v) }}
              />
            ) : activeTab ? (
              <>
                <Editor
                  key={`${activeTab.id}-${activeTab.contentVersion}`}
                  tab={activeTab}
                  noteNames={noteNames}
                  header={
                    editingTitle
                      ? <input
                          ref={titleInputRef}
                          className="note-title note-title-input"
                          value={titleInput}
                          placeholder={activeTab.name}
                          onChange={e => setTitleInput(e.target.value)}
                          onBlur={commitRename}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              commitRename()
                              setTimeout(() => activeEditorView.current?.focus(), 0)
                            }
                            if (e.key === 'ArrowDown') {
                              e.preventDefault()
                              commitRename()
                              setTimeout(() => activeEditorView.current?.focus(), 0)
                            }
                            if (e.key === 'Escape') { clearNaming(activeTab.id); setEditingTitle(false) }
                          }}
                          autoFocus
                        />
                      : <div
                          className="note-title"
                          onClick={() => { setTitleInput(activeTab.name); setEditingTitle(true) }}
                        >
                          {activeTab.name}
                        </div>
                  }
                  onNavigateNote={handleNavigateNote}
                  onOpenNote={handleOpenNote}
                  onContentChange={handleContentChange}
                  onEditorUnmount={handleEditorUnmount}
                  onViewReady={handleViewReady}
                  onEscapeToTitle={enterTitleEdit}
                />
              </>
            ) : (
              <div className="editor-empty">CMD + O to open a note</div>
            )}
          </div>
        </div>
      </div>

      {showSwitcher && (
        <FileSwitcher
          tabs={tabs}
          files={files}
          panels={[
            { name: 'Graph', type: 'graph', open: () => { openGraphTab(); setShowSwitcher(false) } },
            { name: 'Settings', type: 'settings', open: () => { openSettingsTab(); setShowSwitcher(false) } },
            { name: 'Shortcuts', type: 'hotkeys', open: () => { openHotkeysTab(); setShowSwitcher(false) } },
          ]}
          onOpen={name => { openNoteNewTab(name); setShowSwitcher(false) }}
          onClose={() => setShowSwitcher(false)}
        />
      )}

      {showFind && (
        <FindBar
          view={activeEditorView.current}
          query={findQuery}
          onQuery={setFindQuery}
          onClose={() => setShowFind(false)}
        />
      )}

      {saveError && (
        <div className="save-error" onClick={() => setSaveError(null)} title="Click to dismiss">
          ⚠ {saveError}
        </div>
      )}
    </div>
  )
}
