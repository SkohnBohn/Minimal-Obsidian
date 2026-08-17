import { useState, useCallback, useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { v4 as uuidv4 } from 'uuid'

export interface NavEntry {
  path: string
  name: string
}

export interface Tab {
  id: string
  type: 'note' | 'graph'
  path: string
  name: string
  isDirty: boolean
  scrollPos: number
  cmState: EditorState | null
  initialContent: string
  contentVersion: number   // incremented on in-tab navigation to force editor remount
  navHistory: NavEntry[]   // visited notes in this tab
  navIndex: number         // current position in navHistory
}

const SESSION_TABS_KEY = 'session.tabs'
const SESSION_ACTIVE_KEY = 'session.activeTabId'

function makeTab(path: string, name: string, content: string): Tab {
  return {
    id: uuidv4(), type: 'note', path, name,
    isDirty: false, scrollPos: 0, cmState: null,
    initialContent: content, contentVersion: 0,
    navHistory: [{ path, name }], navIndex: 0
  }
}

function makeGraphTab(): Tab {
  return {
    id: uuidv4(), type: 'graph', path: '', name: 'Graph',
    isDirty: false, scrollPos: 0, cmState: null,
    initialContent: '', contentVersion: 0,
    navHistory: [], navIndex: 0
  }
}

export function useTabs() {
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const restored = useRef(false)
  const tabsRef = useRef<Tab[]>([])
  useEffect(() => { tabsRef.current = tabs }, [tabs])

  // Restore session
  useEffect(() => {
    if (restored.current) return
    restored.current = true
    ;(async () => {
      const saved = (await window.api.settings.get(SESSION_TABS_KEY)) as
        | Array<{ path: string; name: string }> | undefined
      const savedActive = (await window.api.settings.get(SESSION_ACTIVE_KEY)) as string | undefined
      if (!saved?.length) return
      const restoredTabs: Tab[] = []
      for (const { path, name } of saved) {
        let content = ''
        try { content = await window.api.vault.read(path) } catch { continue }
        restoredTabs.push(makeTab(path, name, content))
      }
      if (!restoredTabs.length) return
      setTabs(restoredTabs)
      const active = savedActive ? restoredTabs.find(t => t.name === savedActive) : restoredTabs[0]
      setActiveTabId((active ?? restoredTabs[0]).id)
    })()
  }, [])

  useEffect(() => {
    window.api.settings.set(SESSION_TABS_KEY, tabs.map(t => ({ path: t.path, name: t.name })))
  }, [tabs])

  useEffect(() => {
    const active = tabs.find(t => t.id === activeTabId)
    if (active) window.api.settings.set(SESSION_ACTIVE_KEY, active.name)
  }, [activeTabId, tabs])

  const openTab = useCallback(async (path: string, name: string) => {
    const existing = tabsRef.current.find(t => t.path === path)
    if (existing) { setActiveTabId(existing.id); return }
    const content = await window.api.vault.read(path)
    setTabs(prev => {
      const found = prev.find(t => t.path === path)
      if (found) { setActiveTabId(found.id); return prev }
      const newTab = makeTab(path, name, content)
      setActiveTabId(newTab.id)
      return [...prev, newTab]
    })
  }, [])

  const openTabByName = useCallback(async (name: string) => {
    const nameLower = name.toLowerCase()
    const existing = tabsRef.current.find(t => t.name.toLowerCase() === nameLower)
    if (existing) { setActiveTabId(existing.id); return }
    const files = await window.api.vault.list()
    // Case-insensitive match so [[Max Ernst]] and [[max ernst]] resolve to the same file.
    const file = files.find(f => f.name.toLowerCase() === nameLower)
    if (file) {
      await openTab(file.path, file.name)
    } else {
      const path = await window.api.vault.create(name)
      await openTab(path, name)
    }
  }, [openTab])

  // Navigate within the current tab (pushes history)
  const navigateInTab = useCallback(async (tabId: string, name: string) => {
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
    // If another tab already shows this file, just switch to it — don't duplicate.
    // Two tabs pointing at the same path would race on auto-saves.
    const otherTab = tabsRef.current.find(t => t.id !== tabId && t.path === targetPath)
    if (otherTab) { setActiveTabId(otherTab.id); return }

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
        cmState: null, scrollPos: 0,
        contentVersion: t.contentVersion + 1,
        navHistory: newHistory, navIndex: newHistory.length - 1
      }
    }))
  }, [])

  const goBack = useCallback(async (tabId: string) => {
    const tab = tabsRef.current.find(t => t.id === tabId)
    if (!tab || tab.navIndex <= 0) return
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
      const idx = prev.findIndex(t => t.id === tabId)
      if (idx === -1) return prev
      const next = prev.filter(t => t.id !== tabId)
      setActiveTabId(act => act !== tabId ? act : (next[idx] ?? next[idx - 1] ?? null)?.id ?? null)
      return next
    })
  }, [])

  const createNewTab = useCallback(async () => {
    const files = await window.api.vault.list()
    let n = 1, name = 'Untitled'
    while (files.some(f => f.name === name)) name = `Untitled ${n++}`
    const path = await window.api.vault.create(name)
    await openTab(path, name)
  }, [openTab])

  const switchTab = useCallback((dir: 'prev' | 'next') => {
    setTabs(prev => {
      if (!prev.length) return prev
      setActiveTabId(act => {
        const idx = prev.findIndex(t => t.id === act)
        if (idx === -1) return act
        const next = dir === 'next' ? (idx + 1) % prev.length : (idx - 1 + prev.length) % prev.length
        return prev[next].id
      })
      return prev
    })
  }, [])

  const updateTabState = useCallback((tabId: string, content: string, cmState: EditorState, scrollPos: number) => {
    setTabs(prev => prev.map(t =>
      t.id === tabId ? { ...t, isDirty: content !== t.initialContent, cmState, scrollPos } : t
    ))
  }, [])

  const markTabSaved = useCallback((tabId: string, content: string) => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, isDirty: false, initialContent: content } : t))
  }, [])

  const openGraphTab = useCallback(() => {
    const existing = tabsRef.current.find(t => t.type === 'graph')
    if (existing) { setActiveTabId(existing.id); return }
    const gt = makeGraphTab()
    setTabs(prev => [...prev, gt])
    setActiveTabId(gt.id)
  }, [])

  const renameTab = useCallback((tabId: string, newName: string, newPath: string) => {
    setTabs(prev => prev.map(t => {
      if (t.id !== tabId) return t
      const navHistory = t.navHistory.map(e =>
        e.path === t.path ? { path: newPath, name: newName } : e
      )
      return { ...t, path: newPath, name: newName, navHistory }
    }))
  }, [])

  const activeTab = tabs.find(t => t.id === activeTabId) ?? null

  return {
    tabs, activeTab, activeTabId,
    setActiveTabId, openTab, openTabByName,
    navigateInTab, goBack, goForward,
    openGraphTab, renameTab,
    closeTab, createNewTab, switchTab,
    updateTabState, markTabSaved
  }
}
