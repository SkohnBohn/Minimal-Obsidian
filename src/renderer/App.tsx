import React, { useState, useEffect, useCallback, useRef } from 'react'
import TabBar from './tabs/TabBar'
import { useTabs } from './tabs/useTabs'
import type { Tab, PaneId } from './tabs/useTabs'
import EdgeDropZones from './tabs/EdgeDropZones'
import SplitDivider from './tabs/SplitDivider'
import Editor from './editor/Editor'
import FindBar from './editor/FindBar'
import GraphPanel from './graph/GraphPanel'
import HotkeysPanel from './hotkeys/HotkeysPanel'
import SettingsPanel from './settings/SettingsPanel'
import SearchSidebar from './search/SearchSidebar'
import BacklinksPanel from './backlinks/BacklinksPanel'
import FileSwitcher from './modal/FileSwitcher'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

interface FileEntry { name: string; path: string; mtime: number }
interface SnippetSpan { html: string; from: number; to: number }
interface BacklinkGroup { name: string; path: string; snippets: SnippetSpan[] }
interface SearchResultEntry { path: string; name: string; snippets: SnippetSpan[] }

export default function App() {
  const [files, setFiles] = useState<FileEntry[]>([])
  const [showSidebar, setShowSidebar] = useState(false)
  const [showSwitcher, setShowSwitcher] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResultEntry[]>([])
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [backlinks, setBacklinks] = useState<{ linked: BacklinkGroup[]; unlinked: BacklinkGroup[] }>({ linked: [], unlinked: [] })
  const [backlinksOpen, setBacklinksOpen] = useState(true)
  const backlinksDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

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
  // One live CodeMirror view per pane — split view means up to two editors
  // can be mounted at once. "The" active view, for Find/rename-focus/etc.,
  // is always whichever pane currently has focus.
  const editorViewRefs = useRef<Record<PaneId, EditorView | null>>({ left: null, right: null })
  const makeViewReadyHandler = useCallback((pane: PaneId) => (view: EditorView | null) => {
    editorViewRefs.current[pane] = view
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
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null)
  const splitRowRef = useRef<HTMLDivElement>(null)

  const {
    tabs, leftTabs, rightTabs, isSplit,
    activeTab, activeTabId, leftActiveTab, rightActiveTab,
    focusedPane, setFocusedPane,
    splitRatio, setSplitRatio,
    setActiveTabId, openTab, openTabForceNew, openTabByName, navigateInTab, jumpInTab, goBack, goForward,
    openGraphTab, openHotkeysTab, openSettingsTab, renameTab, clearNaming,
    closeTab, createNewTab, switchTab, reorderTab, moveTabToPane, splitFromTab,
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
  useEffect(() => {
    if (searchStateLoaded.current) window.api.settings.set('backlinks.open', backlinksOpen)
  }, [backlinksOpen])

  // showFind resets on every activeTabId change; restore it only after first tab load.
  useEffect(() => { setShowFind(false) }, [activeTabId])
  useEffect(() => {
    if (activeTabId && !findOpenRestored.current) {
      findOpenRestored.current = true
      if (pendingFindOpen.current) setShowFind(true)
    }
  }, [activeTabId])

  // Auto-focus title input for brand-new tabs (always the focused pane's active tab)
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
      window.api.settings.get('backlinks.open'),
    ]).then(([sidebarOpen, sidebarQuery, findOpen, findQuery, backlinksOpenSaved]) => {
      if (sidebarOpen) setShowSidebar(true)
      if (sidebarQuery) {
        const q = sidebarQuery as string
        setSearchQuery(q)
        window.api.search.query(q).then(setSearchResults)
      }
      pendingFindOpen.current = !!(findOpen)
      if (findQuery) setFindQuery(findQuery as string)
      if (backlinksOpenSaved !== undefined) setBacklinksOpen(backlinksOpenSaved as boolean)
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

  // Backlinks follow whichever pane has a note open: the focused pane's own
  // note if it has one, otherwise the other pane's — so opening a special
  // page (graph/settings/shortcuts) in the focused pane doesn't make the
  // backlinks panel vanish (and the whole split-row reflow with it) when the
  // other pane is still showing a note.
  const otherActiveTab = focusedPane === 'left' ? rightActiveTab : leftActiveTab
  const backlinksTab = activeTab?.type === 'note' ? activeTab : (otherActiveTab?.type === 'note' ? otherActiveTab : null)
  const activeNoteName = backlinksTab?.name ?? null

  // Debounced — the query itself is a cheap in-memory scan (reuses the search
  // index's already-maintained content cache, no disk reads), but this still
  // avoids re-running it on every rapid-fire vault:changed burst.
  const refreshBacklinks = useCallback((name: string) => {
    if (backlinksDebounce.current) clearTimeout(backlinksDebounce.current)
    backlinksDebounce.current = setTimeout(async () => {
      setBacklinks(await window.api.vault.backlinks(name))
    }, 150)
  }, [])

  useEffect(() => {
    if (activeNoteName) refreshBacklinks(activeNoteName)
    else setBacklinks({ linked: [], unlinked: [] })
  }, [activeNoteName, refreshBacklinks])

  useEffect(() => {
    if (!vaultReady) return
    return window.api.vault.onChange(async () => {
      setFiles(await window.api.vault.list())
      if (activeNoteName) refreshBacklinks(activeNoteName)
    })
  }, [vaultReady, activeNoteName, refreshBacklinks])

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

  // Opens a note (from a search/backlink click) and moves the cursor to the
  // exact matched position. Four cases, since "where the content actually
  // lives" differs for each — split view means a note could already be
  // showing in EITHER pane, not just the focused one:
  //  - already showing (active) in either pane: jump directly on that pane's
  //    live view — React state (cmState) isn't what's rendered — and focus
  //    that pane, since we're taking the user there.
  //  - focused pane is some other note: reuse it (existing click behavior) —
  //    the editor remounts fresh, so its own cursorPos-on-mount logic applies.
  //  - not currently viewing a note in the focused pane: open/activate the
  //    right tab (in its own pane if already open elsewhere); if it was
  //    already open elsewhere, jump its stored selection first (a safe
  //    transaction that can't discard unsaved content) before switching to it.
  const openAtPosition = useCallback((path: string, name: string, pos: number | undefined, forceNewTab: boolean) => {
    if (forceNewTab) { openTabForceNew(path, name, pos); return }

    const paneShowingIt: PaneId | null =
      leftActiveTab?.path === path ? 'left' :
      rightActiveTab?.path === path ? 'right' : null
    if (paneShowingIt) {
      const view = editorViewRefs.current[paneShowingIt]
      if (pos !== undefined && view) {
        const clamped = Math.min(pos, view.state.doc.length)
        view.dispatch({
          selection: { anchor: clamped },
          effects: EditorView.scrollIntoView(clamped, { y: 'center' })
        })
        view.focus()
      }
      setFocusedPane(paneShowingIt)
      return
    }

    if (activeTabId && activeTab?.type === 'note') {
      navigateInTab(activeTabId, name, true, pos)
      return
    }

    const other = tabs.find(t => t.path === path)
    if (other) {
      if (pos !== undefined) jumpInTab(other.id, pos)
      setActiveTabId(other.id)
      return
    }
    openTab(path, name, pos)
  }, [activeTab, activeTabId, leftActiveTab, rightActiveTab, tabs, jumpInTab, navigateInTab, openTab, openTabForceNew, setActiveTabId, setFocusedPane])

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

  // Search/backlinks toggles are driven by native menu accelerators (main process),
  // not a renderer keydown listener — see src/main/index.ts for why: an OS-level
  // key-combo remap can silently claim Cmd/Ctrl+Shift+<letter> before a plain
  // `window.addEventListener('keydown', ...)` ever sees it, but a real Electron
  // menu accelerator is resolved first and wins.
  useEffect(() => {
    return window.api.app.onToggleSearch(() => setShowSidebar(v => !v))
  }, [])

  useEffect(() => {
    return window.api.app.onToggleBacklinks(() => setBacklinksOpen(v => !v))
  }, [])

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
  }, [activeTab, activeTabId, handleCloseTab, createNewTab, switchTab, goBack, goForward, openSettingsTab, openGraphTab])

  // Renders the tab-content area (graph/hotkeys/settings/note editor/empty
  // state) for one pane. Pulled out since split view mounts this twice.
  function renderPaneBody(tab: Tab | null, pane: PaneId) {
    if (tab?.type === 'graph') {
      return (
        <GraphPanel
          activeNoteName={null}
          onOpenNote={handleOpenNote}
          highlightNames={searchQuery.trim() ? new Set(searchResults.map(r => r.name)) : undefined}
        />
      )
    }
    if (tab?.type === 'hotkeys') return <HotkeysPanel />
    if (tab?.type === 'settings') {
      return (
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
      )
    }
    if (tab) {
      // Title editing is scoped to the focused pane's tab — only one title
      // can realistically be edited at a time anyway.
      const isEditingThisTab = editingTitle && pane === focusedPane
      return (
        <Editor
          key={`${tab.id}-${tab.contentVersion}`}
          tab={tab}
          noteNames={noteNames}
          header={
            isEditingThisTab
              ? <input
                  ref={titleInputRef}
                  className="note-title note-title-input"
                  value={titleInput}
                  placeholder={tab.name}
                  onChange={e => setTitleInput(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      commitRename()
                      setTimeout(() => editorViewRefs.current[pane]?.focus(), 0)
                    }
                    if (e.key === 'ArrowDown') {
                      e.preventDefault()
                      commitRename()
                      setTimeout(() => editorViewRefs.current[pane]?.focus(), 0)
                    }
                    if (e.key === 'Escape') { clearNaming(tab.id); setEditingTitle(false) }
                  }}
                  autoFocus
                />
              : <div
                  className="note-title"
                  onClick={() => { setFocusedPane(pane); setTitleInput(tab.name); setEditingTitle(true) }}
                >
                  {tab.name}
                </div>
          }
          onNavigateNote={handleNavigateNote}
          onOpenNote={handleOpenNote}
          onContentChange={handleContentChange}
          onEditorUnmount={handleEditorUnmount}
          onViewReady={makeViewReadyHandler(pane)}
          onEscapeToTitle={enterTitleEdit}
        />
      )
    }
    return <div className="editor-empty">CMD + O to open a note</div>
  }

  function renderPane(pane: PaneId, paneTabs: Tab[], paneActiveTab: Tab | null) {
    return (
      <div
        className="main"
        style={isSplit ? { flex: `0 1 ${(pane === 'left' ? splitRatio : 1 - splitRatio) * 100}%` } : undefined}
        onMouseDownCapture={() => setFocusedPane(pane)}
      >
        <TabBar
          paneId={pane}
          tabs={paneTabs}
          activeTabId={pane === 'left' && inlineSettings ? null : paneActiveTab?.id ?? null}
          onActivate={id => { setActiveTabId(id, pane); setInlineSettings(false) }}
          onClose={handleCloseTab}
          onReorder={(from, to) => reorderTab(pane, from, to)}
          onMoveFromOtherPane={tabId => moveTabToPane(tabId, pane)}
          onTabDragStart={id => setDraggingTabId(id)}
          onTabDragEnd={() => setDraggingTabId(null)}
          keyboardOnly={keyboardOnlyTabs}
          onSettings={hideRail && pane === 'left' ? () => setInlineSettings(true) : undefined}
          settingsActive={hideRail && pane === 'left' && inlineSettings}
        />
        <div className="editor-pane">
          {pane === 'left' && inlineSettings ? (
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
          ) : renderPaneBody(paneActiveTab, pane)}
        </div>
      </div>
    )
  }

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
            onOpen={(path, name, pos) => {
              openAtPosition(path, name, pos, false)
              setShowSidebar(false)
            }}
          />
        )}

        {/* Main content — one pane, or two side by side with a resizable divider */}
        <div className="split-row" ref={splitRowRef}>
          {renderPane('left', leftTabs, leftActiveTab)}
          {isSplit && (
            <>
              <SplitDivider containerRef={splitRowRef} ratio={splitRatio} onChange={setSplitRatio} />
              {renderPane('right', rightTabs, rightActiveTab)}
            </>
          )}
          <EdgeDropZones
            active={draggingTabId !== null && !isSplit}
            onDropSide={(tabId, side) => { splitFromTab(tabId, side); setDraggingTabId(null) }}
          />
        </div>

        {backlinksTab && (
          <BacklinksPanel
            linked={backlinks.linked}
            unlinked={backlinks.unlinked}
            open={backlinksOpen}
            onToggleOpen={() => setBacklinksOpen(v => !v)}
            onOpen={(path, name, newTab, pos) => openAtPosition(path, name, pos, newTab)}
          />
        )}
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
          onActivateTab={id => { setActiveTabId(id); setShowSwitcher(false) }}
          onClose={() => setShowSwitcher(false)}
        />
      )}

      {showFind && (
        <FindBar
          view={editorViewRefs.current[focusedPane]}
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
