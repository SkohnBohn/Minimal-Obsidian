import { useState, useCallback, useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { v4 as uuidv4 } from 'uuid'

export type PaneId = 'left' | 'right'

export interface NavEntry {
  path: string
  name: string
}

export interface Tab {
  id: string
  paneId: PaneId
  type: 'note' | 'graph' | 'hotkeys' | 'settings'
  path: string
  name: string
  isDirty: boolean
  scrollPos: number
  cursorPos: number        // persisted caret offset for cross-session restore
  cmState: EditorState | null
  initialContent: string
  contentVersion: number   // incremented on in-tab navigation to force editor remount
  navHistory: NavEntry[]   // visited notes in this tab
  navIndex: number         // current position in navHistory
  cameFrom?: string        // tab id to return to when goBack is called at navIndex 0
  isNaming?: boolean       // true for brand-new tabs until title is committed
  lastUsed: number         // timestamp of last activation, for recency sorting
  scrollToSelection?: boolean  // one-shot: next mount should scroll to cmState's current selection
}

const SESSION_TABS_KEY = 'session.tabs'
const SESSION_ACTIVE_KEY = 'session.activeTabId'
const SESSION_SPLIT_KEY = 'session.splitRatio'
const SESSION_FOCUSED_PANE_KEY = 'session.focusedPane'

function makeTab(path: string, name: string, content: string, cursorPos = 0, paneId: PaneId = 'left'): Tab {
  return {
    id: uuidv4(), paneId, type: 'note', path, name,
    isDirty: false, scrollPos: 0, cursorPos, cmState: null,
    initialContent: content, contentVersion: 0,
    navHistory: [{ path, name }], navIndex: 0,
    lastUsed: Date.now()
  }
}

function makeGraphTab(paneId: PaneId = 'left'): Tab {
  return {
    id: uuidv4(), paneId, type: 'graph', path: '', name: 'Graph',
    isDirty: false, scrollPos: 0, cursorPos: 0, cmState: null,
    initialContent: '', contentVersion: 0,
    navHistory: [], navIndex: 0, lastUsed: Date.now()
  }
}

function makeSettingsTab(paneId: PaneId = 'left'): Tab {
  return {
    id: uuidv4(), paneId, type: 'settings', path: '', name: 'Settings',
    isDirty: false, scrollPos: 0, cursorPos: 0, cmState: null,
    initialContent: '', contentVersion: 0,
    navHistory: [], navIndex: 0, lastUsed: Date.now()
  }
}

function makeHotkeysTab(paneId: PaneId = 'left'): Tab {
  return {
    id: uuidv4(), paneId, type: 'hotkeys', path: '', name: 'Shortcuts',
    isDirty: false, scrollPos: 0, cursorPos: 0, cmState: null,
    initialContent: '', contentVersion: 0,
    navHistory: [], navIndex: 0, lastUsed: Date.now()
  }
}

export function useTabs() {
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTabIdByPane, setActiveTabIdByPane] = useState<Record<PaneId, string | null>>({ left: null, right: null })
  const [focusedPane, setFocusedPaneState] = useState<PaneId>('left')
  const [splitRatio, setSplitRatio] = useState(0.5)
  const restored = useRef(false)
  const sessionLoaded = useRef(false)
  const tabsRef = useRef<Tab[]>([])
  const activeTabIdByPaneRef = useRef(activeTabIdByPane)
  const focusedPaneRef = useRef(focusedPane)
  useEffect(() => { tabsRef.current = tabs }, [tabs])
  useEffect(() => { activeTabIdByPaneRef.current = activeTabIdByPane }, [activeTabIdByPane])
  useEffect(() => { focusedPaneRef.current = focusedPane }, [focusedPane])

  const setFocusedPane = useCallback((pane: PaneId) => setFocusedPaneState(pane), [])

  // A tab's own pane decides where activating it lands, unless a pane is given
  // explicitly (e.g. a tab bar always activates within its own pane). Activating
  // also focuses that pane, since clicking a tab is a clear statement of intent.
  const activateTab = useCallback((id: string | null, pane?: PaneId) => {
    if (!id) return
    const tab = tabsRef.current.find(t => t.id === id)
    const targetPane = pane ?? tab?.paneId ?? 'left'
    setActiveTabIdByPane(prev => ({ ...prev, [targetPane]: id }))
    setFocusedPaneState(targetPane)
    setTabs(prev => prev.map(t => t.id === id ? { ...t, lastUsed: Date.now() } : t))
  }, [])

  // Invariant: when not split, every tab lives in 'left'. If 'left' ever empties
  // out while 'right' still has tabs (e.g. closing left's last tab, or a
  // cross-pane move draining it), fold 'right' back into 'left' so the
  // single-pane view always reads from the same place and the split cleanly
  // auto-collapses regardless of which side emptied.
  useEffect(() => {
    const hasLeft = tabs.some(t => t.paneId === 'left')
    const hasRight = tabs.some(t => t.paneId === 'right')
    if (hasRight && !hasLeft) {
      setTabs(prev => prev.map(t => t.paneId === 'right' ? { ...t, paneId: 'left' } : t))
      setActiveTabIdByPane(prev => ({ left: prev.right, right: null }))
      setFocusedPaneState('left')
    }
  }, [tabs])

  // Restore session
  useEffect(() => {
    if (restored.current) return
    restored.current = true
    ;(async () => {
      const saved = (await window.api.settings.get(SESSION_TABS_KEY)) as
        | Array<{ path: string; name: string; type?: string; cursorPos?: number; paneId?: PaneId }> | undefined
      const savedActive = (await window.api.settings.get(SESSION_ACTIVE_KEY)) as
        | { left?: string | null; right?: string | null } | string | undefined
      const savedRatio = (await window.api.settings.get(SESSION_SPLIT_KEY)) as number | undefined
      const savedFocused = (await window.api.settings.get(SESSION_FOCUSED_PANE_KEY)) as PaneId | undefined
      // All reads are in; only now is it safe for the persist effects below to
      // start writing, so a later default-value write can't race ahead of a
      // not-yet-issued read and clobber the saved value before it's seen.
      sessionLoaded.current = true
      if (!saved?.length) return
      const restoredTabs: Tab[] = []
      for (const { path, name, type, cursorPos, paneId } of saved) {
        const pane: PaneId = paneId === 'right' ? 'right' : 'left'
        if (type === 'graph') { restoredTabs.push(makeGraphTab(pane)); continue }
        if (type === 'hotkeys') { restoredTabs.push(makeHotkeysTab(pane)); continue }
        if (type === 'settings') { restoredTabs.push(makeSettingsTab(pane)); continue }
        let content = ''
        try { content = await window.api.vault.read(path) } catch { continue }
        restoredTabs.push(makeTab(path, name, content, cursorPos ?? 0, pane))
      }
      if (!restoredTabs.length) return
      setTabs(restoredTabs)
      if (typeof savedRatio === 'number') setSplitRatio(savedRatio)
      // Older sessions saved a single active-tab name (string); newer ones save
      // {left, right} names per pane. Handle both for a smooth upgrade.
      const byName = (n: string | null | undefined) => n ? restoredTabs.find(t => t.name === n) : undefined
      if (typeof savedActive === 'string') {
        setActiveTabIdByPane({ left: (byName(savedActive) ?? restoredTabs[0])?.id ?? null, right: null })
      } else {
        const leftTabs = restoredTabs.filter(t => t.paneId === 'left')
        const rightTabs = restoredTabs.filter(t => t.paneId === 'right')
        setActiveTabIdByPane({
          left: (byName(savedActive?.left) ?? leftTabs[0])?.id ?? null,
          right: (byName(savedActive?.right) ?? rightTabs[0])?.id ?? null
        })
      }
      if (savedFocused === 'left' || savedFocused === 'right') setFocusedPaneState(savedFocused)
    })()
  }, [])

  useEffect(() => {
    if (!sessionLoaded.current) return
    window.api.settings.set(SESSION_TABS_KEY, tabs.map(t => ({
      path: t.path, name: t.name, type: t.type, paneId: t.paneId,
      cursorPos: t.cmState?.selection.main.head ?? t.cursorPos
    })))
  }, [tabs])

  useEffect(() => {
    if (!sessionLoaded.current) return
    const leftActive = tabs.find(t => t.id === activeTabIdByPane.left)
    const rightActive = tabs.find(t => t.id === activeTabIdByPane.right)
    window.api.settings.set(SESSION_ACTIVE_KEY, { left: leftActive?.name ?? null, right: rightActive?.name ?? null })
  }, [activeTabIdByPane, tabs])

  useEffect(() => {
    if (!sessionLoaded.current) return
    window.api.settings.set(SESSION_SPLIT_KEY, splitRatio)
  }, [splitRatio])
  useEffect(() => {
    if (!sessionLoaded.current) return
    window.api.settings.set(SESSION_FOCUSED_PANE_KEY, focusedPane)
  }, [focusedPane])

  const openTab = useCallback(async (path: string, name: string, jumpPos?: number) => {
    const existing = tabsRef.current.find(t => t.path === path)
    if (existing) { activateTab(existing.id); return }
    const pane = focusedPaneRef.current
    const content = await window.api.vault.read(path)
    setTabs(prev => {
      const found = prev.find(t => t.path === path)
      if (found) { activateTab(found.id); return prev }
      const newTab = makeTab(path, name, content, jumpPos ?? 0, pane)
      activateTab(newTab.id, pane)
      return [...prev, newTab]
    })
  }, [activateTab])

  const openTabForceNew = useCallback(async (path: string, name: string, jumpPos?: number) => {
    const pane = focusedPaneRef.current
    const content = await window.api.vault.read(path)
    const newTab = makeTab(path, name, content, jumpPos ?? 0, pane)
    setTabs(prev => [...prev, newTab])
    activateTab(newTab.id, pane)
  }, [activateTab])

  const openTabByName = useCallback(async (name: string) => {
    const nameLower = name.toLowerCase()
    const existing = tabsRef.current.find(t => t.name.toLowerCase() === nameLower)
    if (existing) { activateTab(existing.id); return }
    const files = await window.api.vault.list()
    // Case-insensitive match so [[Max Ernst]] and [[max ernst]] resolve to the same file.
    const file = files.find(f => f.name.toLowerCase() === nameLower)
    if (file) {
      // Secondary guard by path: catches stale tab state after external rename events,
      // where a tab still carries the old name but the disk file has the new path.
      const existingByPath = tabsRef.current.find(t => t.path === file.path)
      if (existingByPath) { activateTab(existingByPath.id); return }
      await openTab(file.path, file.name)
    } else {
      const path = await window.api.vault.create(name)
      await openTab(path, name)
    }
  }, [activateTab, openTab])

  // Navigate within the current tab (pushes history)
  const navigateInTab = useCallback(async (tabId: string, name: string, forceInPlace = false, jumpPos?: number) => {
    const files = await window.api.vault.list()
    // Case-insensitive match to avoid creating duplicate files on macOS (HFS+/APFS).
    const nameLower = name.toLowerCase()
    const file = files.find(f => f.name.toLowerCase() === nameLower)
    let targetPath: string
    let targetName: string
    if (file) {
      targetPath = file.path; targetName = file.name
    } else {
      targetPath = await window.api.vault.create(name); targetName = name
    }
    // If another tab already shows this file, switch to it and record where we came from
    // so goBack can return to this tab.
    const otherTab = tabsRef.current.find(t => t.id !== tabId && t.path === targetPath)
    if (otherTab && !forceInPlace) {
      setTabs(prev => prev.map(t => t.id === otherTab.id ? { ...t, cameFrom: tabId } : t))
      activateTab(otherTab.id)
      return
    }

    const content = await window.api.vault.read(targetPath)
    setTabs(prev => prev.map(t => {
      if (t.id !== tabId) return t
      const newHistory = t.navHistory.slice(0, t.navIndex + 1)
      // Don't duplicate if clicking a link to the current note
      if (newHistory[newHistory.length - 1]?.path === targetPath) return t
      newHistory.push({ path: targetPath, name: targetName })
      return {
        ...t, path: targetPath, name: targetName,
        initialContent: content, isDirty: false,
        cmState: null, scrollPos: 0, cursorPos: jumpPos ?? 0,
        contentVersion: t.contentVersion + 1,
        navHistory: newHistory, navIndex: newHistory.length - 1,
        cameFrom: undefined
      }
    }))
  }, [])

  // Moves the cursor in a tab that's already open but not necessarily active —
  // e.g. clicking a search/backlink result for a note open in another tab.
  // If the tab has already been rendered (cmState set), updates the selection
  // via a transaction on that state rather than discarding it, so any unsaved
  // edits sitting only in cmState are never lost. If it hasn't rendered yet,
  // just sets cursorPos — the editor's own mount logic applies it on first render.
  const jumpInTab = useCallback((tabId: string, pos: number) => {
    setTabs(prev => prev.map(t => {
      if (t.id !== tabId) return t
      if (t.cmState) {
        const clamped = Math.min(pos, t.cmState.doc.length)
        // scrollIntoView here is a no-op — this state isn't attached to a live
        // view yet, so there's nothing to scroll. The editor applies the
        // actual scroll itself once it mounts with this state (scrollToSelection).
        const newState = t.cmState.update({ selection: { anchor: clamped } }).state
        return { ...t, cmState: newState, cursorPos: clamped, scrollToSelection: true }
      }
      return { ...t, cursorPos: pos }
    }))
  }, [])

  const goBack = useCallback(async (tabId: string) => {
    const tab = tabsRef.current.find(t => t.id === tabId)
    if (!tab) return
    if (tab.navIndex <= 0) {
      if (tab.cameFrom) {
        const fromId = tab.cameFrom
        setTabs(prev => prev.map(t => t.id === tabId ? { ...t, cameFrom: undefined } : t))
        activateTab(fromId)
      }
      return
    }
    const newIndex = tab.navIndex - 1
    const entry = tab.navHistory[newIndex]
    const content = await window.api.vault.read(entry.path)
    setTabs(prev => prev.map(t => {
      if (t.id !== tabId || t.navIndex <= 0) return t
      return {
        ...t, path: entry.path, name: entry.name,
        initialContent: content, isDirty: false,
        cmState: null, scrollPos: 0,
        contentVersion: t.contentVersion + 1,
        navIndex: newIndex
      }
    }))
  }, [])

  const goForward = useCallback(async (tabId: string) => {
    const tab = tabsRef.current.find(t => t.id === tabId)
    if (!tab || tab.navIndex >= tab.navHistory.length - 1) return
    const newIndex = tab.navIndex + 1
    const entry = tab.navHistory[newIndex]
    const content = await window.api.vault.read(entry.path)
    setTabs(prev => prev.map(t => {
      if (t.id !== tabId || t.navIndex >= t.navHistory.length - 1) return t
      return {
        ...t, path: entry.path, name: entry.name,
        initialContent: content, isDirty: false,
        cmState: null, scrollPos: 0,
        contentVersion: t.contentVersion + 1,
        navIndex: newIndex
      }
    }))
  }, [])

  const closeTab = useCallback((tabId: string) => {
    setTabs(prev => {
      const tab = prev.find(t => t.id === tabId)
      if (!tab) return prev
      const pane = tab.paneId
      const paneTabs = prev.filter(t => t.paneId === pane)
      const idx = paneTabs.findIndex(t => t.id === tabId)
      const next = prev.filter(t => t.id !== tabId)
      setActiveTabIdByPane(prevActive => {
        if (prevActive[pane] !== tabId) return prevActive
        const remainingPaneTabs = next.filter(t => t.paneId === pane)
        const fallback = remainingPaneTabs[idx] ?? remainingPaneTabs[idx - 1] ?? null
        return { ...prevActive, [pane]: fallback?.id ?? null }
      })
      return next
    })
  }, [])

  const createNewTab = useCallback(async () => {
    const pane = focusedPaneRef.current
    const files = await window.api.vault.list()
    let n = 1, name = 'Untitled'
    while (files.some(f => f.name === name)) name = `Untitled ${n++}`
    const path = await window.api.vault.create(name)
    const content = await window.api.vault.read(path)
    const newTab: Tab = { ...makeTab(path, name, content, 0, pane), isNaming: true }
    setTabs(prev => {
      if (prev.find(t => t.path === path)) return prev
      activateTab(newTab.id, pane)
      return [...prev, newTab]
    })
  }, [activateTab])

  const clearNaming = useCallback((tabId: string) => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, isNaming: false } : t))
  }, [])

  // Cycles within the focused pane's own tabs only — cycling across both
  // panes' tabs combined would be unpredictable once split.
  const switchTab = useCallback((dir: 'prev' | 'next') => {
    const pane = focusedPaneRef.current
    const paneTabs = tabsRef.current.filter(t => t.paneId === pane)
    if (!paneTabs.length) return
    const act = activeTabIdByPaneRef.current[pane]
    const idx = paneTabs.findIndex(t => t.id === act)
    if (idx === -1) return
    const next = dir === 'next' ? (idx + 1) % paneTabs.length : (idx - 1 + paneTabs.length) % paneTabs.length
    activateTab(paneTabs[next].id, pane)
  }, [activateTab])

  const updateTabState = useCallback((tabId: string, content: string, cmState: EditorState, scrollPos: number) => {
    setTabs(prev => prev.map(t =>
      t.id === tabId ? { ...t, isDirty: content !== t.initialContent, cmState, scrollPos } : t
    ))
  }, [])

  const markTabSaved = useCallback((tabId: string, content: string) => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, isDirty: false, initialContent: content } : t))
  }, [])

  const openGraphTab = useCallback((forceNew?: boolean) => {
    const pane = focusedPaneRef.current
    const existing = !forceNew && tabsRef.current.find(t => t.type === 'graph' && t.paneId === pane)
    if (existing) { activateTab(existing.id, pane); return }
    const gt = makeGraphTab(pane)
    setTabs(prev => [...prev, gt])
    activateTab(gt.id, pane)
  }, [activateTab])

  const openSettingsTab = useCallback((forceNew?: boolean) => {
    const pane = focusedPaneRef.current
    const existing = !forceNew && tabsRef.current.find(t => t.type === 'settings' && t.paneId === pane)
    if (existing) { activateTab(existing.id, pane); return }
    const st = makeSettingsTab(pane)
    setTabs(prev => [...prev, st])
    activateTab(st.id, pane)
  }, [activateTab])

  const openHotkeysTab = useCallback((forceNew?: boolean) => {
    const pane = focusedPaneRef.current
    const existing = !forceNew && tabsRef.current.find(t => t.type === 'hotkeys' && t.paneId === pane)
    if (existing) { activateTab(existing.id, pane); return }
    const ht = makeHotkeysTab(pane)
    setTabs(prev => [...prev, ht])
    activateTab(ht.id, pane)
  }, [activateTab])

  const resetTabs = useCallback(async (
    specs: Array<{ path: string; name: string; type: string; cursorPos?: number }>,
    activeTabName?: string | null
  ) => {
    setTabs([])
    setActiveTabIdByPane({ left: null, right: null })
    setFocusedPaneState('left')
    if (!specs.length) return
    const restored: Tab[] = []
    for (const s of specs) {
      if (s.type === 'graph') { restored.push(makeGraphTab()); continue }
      if (s.type === 'hotkeys') { restored.push(makeHotkeysTab()); continue }
      if (s.type === 'settings') { restored.push(makeSettingsTab()); continue }
      let content = ''
      try { content = await window.api.vault.read(s.path) } catch { continue }
      restored.push(makeTab(s.path, s.name, content, s.cursorPos ?? 0))
    }
    if (!restored.length) return
    setTabs(restored)
    const active = activeTabName
      ? (restored.find(t => t.name === activeTabName) ?? restored[0])
      : restored[0]
    setActiveTabIdByPane({ left: active.id, right: null })
  }, [])

  // Reorders within a single pane's tab bar (drag within the same bar).
  const reorderTab = useCallback((pane: PaneId, fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return
    setTabs(prev => {
      const paneTabs = prev.filter(t => t.paneId === pane)
      const others = prev.filter(t => t.paneId !== pane)
      const next = [...paneTabs]
      const [tab] = next.splice(fromIdx, 1)
      next.splice(fromIdx < toIdx ? toIdx - 1 : toIdx, 0, tab)
      // Re-merge preserving overall relative order isn't important — each
      // pane only ever renders its own filtered slice, so a stable order
      // per-pane is all that matters.
      return [...others, ...next]
    })
  }, [])

  // Moves a tab to the other pane (drag from one pane's bar onto the other,
  // once already split), making it active there and focusing that pane. If it
  // was the active tab in its old pane, that pane falls back to another of
  // its own tabs, same as closing would.
  const moveTabToPane = useCallback((tabId: string, pane: PaneId) => {
    const tab = tabsRef.current.find(t => t.id === tabId)
    if (!tab || tab.paneId === pane) return
    const oldPane = tab.paneId
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, paneId: pane } : t))
    setActiveTabIdByPane(prev => {
      const next = { ...prev, [pane]: tabId }
      if (prev[oldPane] === tabId) {
        const remaining = tabsRef.current.filter(t => t.paneId === oldPane && t.id !== tabId)
        next[oldPane] = remaining[0]?.id ?? null
      }
      return next
    })
    setFocusedPaneState(pane)
  }, [])

  // Creates the split from an unsplit state: the dragged tab becomes the sole
  // content of `side`'s pane; every other tab moves to the opposite pane,
  // keeping whichever of them was active before (unless that was the dragged
  // tab itself, in which case the first remaining tab takes over).
  const splitFromTab = useCallback((tabId: string, side: PaneId) => {
    const current = tabsRef.current
    if (current.some(t => t.paneId === 'right')) return  // already split — not this function's job
    const dragged = current.find(t => t.id === tabId)
    if (!dragged || current.filter(t => t.paneId === 'left').length < 2) return  // need something left to split off
    const otherSide: PaneId = side === 'left' ? 'right' : 'left'

    const newTabs = current.map(t => t.id === tabId ? { ...t, paneId: side } : { ...t, paneId: otherSide })
    setTabs(newTabs)

    const otherSideTabs = newTabs.filter(t => t.paneId === otherSide)
    const prevLeftActive = activeTabIdByPaneRef.current.left
    const otherActive = (prevLeftActive && prevLeftActive !== tabId && otherSideTabs.some(t => t.id === prevLeftActive))
      ? prevLeftActive
      : (otherSideTabs[0]?.id ?? null)

    setActiveTabIdByPane({ [side]: tabId, [otherSide]: otherActive } as Record<PaneId, string | null>)
    setFocusedPaneState(side)
    setSplitRatio(0.5)
  }, [])

  const renameTab = useCallback((tabId: string, newName: string, newPath: string) => {
    setTabs(prev => prev.map(t => {
      if (t.id !== tabId) return t
      const navHistory = t.navHistory.map(e =>
        e.path === t.path ? { path: newPath, name: newName } : e
      )
      return { ...t, path: newPath, name: newName, navHistory, isNaming: false }
    }))
  }, [])

  const isSplit = tabs.some(t => t.paneId === 'right')
  const leftTabs = tabs.filter(t => t.paneId === 'left')
  const rightTabs = tabs.filter(t => t.paneId === 'right')
  const leftActiveTab = tabs.find(t => t.id === activeTabIdByPane.left) ?? null
  const rightActiveTab = tabs.find(t => t.id === activeTabIdByPane.right) ?? null
  const activeTab = (focusedPane === 'left' ? leftActiveTab : rightActiveTab)
  const activeTabId = activeTab?.id ?? null

  return {
    tabs, leftTabs, rightTabs, isSplit,
    activeTab, activeTabId, leftActiveTab, rightActiveTab,
    activeTabIdByPane, focusedPane, setFocusedPane,
    splitRatio, setSplitRatio,
    setActiveTabId: activateTab, openTab, openTabForceNew, openTabByName,
    navigateInTab, jumpInTab, goBack, goForward,
    openGraphTab, openHotkeysTab, openSettingsTab, renameTab, clearNaming,
    closeTab, createNewTab, switchTab, reorderTab,
    moveTabToPane, splitFromTab,
    updateTabState, markTabSaved, resetTabs
  }
}
