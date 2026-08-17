import { useState, useCallback, useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { v4 as uuidv4 } from 'uuid'

export interface Tab {
  id: string
  path: string
  name: string
  isDirty: boolean
  scrollPos: number
  cmState: EditorState | null
  initialContent: string
}

const SESSION_TABS_KEY = 'session.tabs'
const SESSION_ACTIVE_KEY = 'session.activeTabId'

export function useTabs() {
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const restored = useRef(false)

  // Restore session
  useEffect(() => {
    if (restored.current) return
    restored.current = true
    ;(async () => {
      const saved = (await window.api.settings.get(SESSION_TABS_KEY)) as
        | Array<{ path: string; name: string }>
        | undefined
      const savedActiveId = (await window.api.settings.get(SESSION_ACTIVE_KEY)) as
        | string | undefined

      if (!saved?.length) return
      const restoredTabs: Tab[] = []
      for (const { path, name } of saved) {
        let content = ''
        try { content = await window.api.vault.read(path) } catch { continue }
        restoredTabs.push({ id: uuidv4(), path, name, isDirty: false, scrollPos: 0, cmState: null, initialContent: content })
      }
      if (!restoredTabs.length) return
      setTabs(restoredTabs)
      const active = savedActiveId
        ? restoredTabs.find(t => t.name === savedActiveId)
        : restoredTabs[0]
      setActiveTabId((active ?? restoredTabs[0]).id)
    })()
  }, [])

  // Persist tabs list
  useEffect(() => {
    window.api.settings.set(SESSION_TABS_KEY, tabs.map(t => ({ path: t.path, name: t.name })))
  }, [tabs])

  useEffect(() => {
    const active = tabs.find(t => t.id === activeTabId)
    if (active) window.api.settings.set(SESSION_ACTIVE_KEY, active.name)
  }, [activeTabId, tabs])

  const openTab = useCallback(async (path: string, name: string) => {
    let existing: Tab | undefined
    setTabs(prev => {
      existing = prev.find(t => t.path === path)
      return prev
    })
    // Need to read existing after state is settled; use a ref trick
    // Simpler: just check with a ref
    return new Promise<void>(resolve => {
      setTabs(prev => {
        const found = prev.find(t => t.path === path)
        if (found) {
          setActiveTabId(found.id)
          resolve()
          return prev
        }
        // Will be added after async read — we do it outside setState
        resolve()
        return prev
      })
    }).then(async () => {
      // Re-check in case it was there
      let found = false
      setTabs(prev => {
        if (prev.find(t => t.path === path)) found = true
        return prev
      })
      if (found) return
      const content = await window.api.vault.read(path)
      const newTab: Tab = { id: uuidv4(), path, name, isDirty: false, scrollPos: 0, cmState: null, initialContent: content }
      setTabs(prev => {
        if (prev.find(t => t.path === path)) {
          setActiveTabId(prev.find(t => t.path === path)!.id)
          return prev
        }
        setActiveTabId(newTab.id)
        return [...prev, newTab]
      })
    })
  }, [])

  const openTabByName = useCallback(async (name: string) => {
    let found = false
    setTabs(prev => {
      const t = prev.find(t => t.name === name)
      if (t) { found = true; setActiveTabId(t.id) }
      return prev
    })
    // Give setState a tick to settle
    await new Promise(r => setTimeout(r, 0))
    if (found) return
    const files = await window.api.vault.list()
    const file = files.find(f => f.name === name)
    if (file) {
      await openTab(file.path, file.name)
    } else {
      const path = await window.api.vault.create(name)
      await openTab(path, name)
    }
  }, [openTab])

  const closeTab = useCallback((tabId: string) => {
    setTabs(prev => {
      const idx = prev.findIndex(t => t.id === tabId)
      if (idx === -1) return prev
      const next = prev.filter(t => t.id !== tabId)
      setActiveTabId(act => {
        if (act !== tabId) return act
        return (next[idx] ?? next[idx - 1] ?? null)?.id ?? null
      })
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
        const next = dir === 'next'
          ? (idx + 1) % prev.length
          : (idx - 1 + prev.length) % prev.length
        return prev[next].id
      })
      return prev
    })
  }, [])

  const updateTabState = useCallback(
    (tabId: string, content: string, cmState: EditorState, scrollPos: number) => {
      setTabs(prev =>
        prev.map(t =>
          t.id === tabId
            ? { ...t, isDirty: content !== t.initialContent, cmState, scrollPos }
            : t
        )
      )
    },
    []
  )

  const markTabSaved = useCallback((tabId: string, content: string) => {
    setTabs(prev =>
      prev.map(t => t.id === tabId ? { ...t, isDirty: false, initialContent: content } : t)
    )
  }, [])

  const activeTab = tabs.find(t => t.id === activeTabId) ?? null

  return {
    tabs, activeTab, activeTabId,
    setActiveTabId, openTab, openTabByName,
    closeTab, createNewTab, switchTab,
    updateTabState, markTabSaved
  }
}
