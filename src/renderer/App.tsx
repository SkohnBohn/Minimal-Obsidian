import React, { useState, useEffect, useCallback, useRef } from 'react'
import TabBar from './tabs/TabBar'
import { useTabs } from './tabs/useTabs'
import Editor from './editor/Editor'
import GraphPanel from './graph/GraphPanel'
import SearchSidebar from './search/SearchSidebar'
import FileSwitcher from './modal/FileSwitcher'
import { EditorState } from '@codemirror/state'

interface FileEntry { name: string; path: string; mtime: number }

export default function App() {
  const [files, setFiles] = useState<FileEntry[]>([])
  const [showSidebar, setShowSidebar] = useState(false)
  const [showGraph, setShowGraph] = useState(false)
  const [showSwitcher, setShowSwitcher] = useState(false)
  const [vaultReady, setVaultReady] = useState(false)

  const {
    tabs, activeTab, activeTabId, setActiveTabId,
    openTab, openTabByName, closeTab, createNewTab, switchTab,
    updateTabState, markTabSaved
  } = useTabs()

  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const tabsRef = useRef(tabs)
  useEffect(() => { tabsRef.current = tabs }, [tabs])

  useEffect(() => {
    ;(async () => {
      const savedVault = await window.api.settings.get('vaultPath') as string | undefined
      if (savedVault) {
        setFiles(await window.api.vault.list())
        setVaultReady(true)
      } else {
        const fileList = await window.api.vault.open()
        if (fileList) { setFiles(fileList); setVaultReady(true) }
      }
    })()
  }, [])

  useEffect(() => {
    if (!vaultReady) return
    return window.api.vault.onChange(async () => {
      setFiles(await window.api.vault.list())
    })
  }, [vaultReady])

  const noteNames = files.map(f => f.name)

  const handleContentChange = useCallback(
    (tabId: string, content: string, state: EditorState, scrollPos: number) => {
      updateTabState(tabId, content, state, scrollPos)
      const timer = saveTimers.current.get(tabId)
      if (timer) clearTimeout(timer)
      const tab = tabsRef.current.find(t => t.id === tabId)
      if (!tab) return
      saveTimers.current.set(
        tabId,
        setTimeout(async () => {
          await window.api.vault.write(tab.path, content)
          markTabSaved(tabId, content)
          saveTimers.current.delete(tabId)
        }, 500)
      )
    },
    [updateTabState, markTabSaved]
  )

  const handleOpenNote = useCallback((name: string) => openTabByName(name), [openTabByName])
  const handleOpenFile = useCallback((path: string, name: string) => openTab(path, name), [openTab])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey
      if (meta && !e.shiftKey && e.key === 'o') {
        e.preventDefault(); setShowSwitcher(v => !v)
      } else if (meta && e.key === 'n') {
        e.preventDefault(); createNewTab()
      } else if (meta && e.key === 'w') {
        e.preventDefault(); if (activeTabId) closeTab(activeTabId)
      } else if (meta && e.shiftKey && e.key === '[') {
        e.preventDefault(); switchTab('prev')
      } else if (meta && e.shiftKey && e.key === ']') {
        e.preventDefault(); switchTab('next')
      } else if (e.key === 'Escape') {
        setShowSwitcher(false); setShowSidebar(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeTabId, closeTab, createNewTab, switchTab])

  if (!vaultReady) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--stone)' }}>
        Opening vault…
      </div>
    )
  }

  return (
    <div className="app">
      <div className="rail">
        <button
          className={`rail-btn${showSidebar ? ' active' : ''}`}
          title="Search (O button)"
          onClick={() => { setShowSidebar(v => !v); setShowGraph(false) }}
        >
          O
        </button>
        <button
          className={`rail-btn${showGraph ? ' active' : ''}`}
          title="Graph view"
          onClick={() => { setShowGraph(v => !v); setShowSidebar(false) }}
        >
          ⬡
        </button>
        <button
          className="rail-btn"
          title="Open vault folder"
          style={{ marginTop: 'auto', fontSize: '10px' }}
          onClick={async () => {
            const fl = await window.api.vault.open()
            if (fl) { setFiles(fl); setVaultReady(true) }
          }}
        >
          ⬙
        </button>
      </div>

      <div className="main">
        {showSidebar && (
          <SearchSidebar
            onOpen={(path, name) => { handleOpenFile(path, name); setShowSidebar(false) }}
          />
        )}

        <TabBar
          tabs={tabs}
          activeTabId={activeTabId}
          onActivate={setActiveTabId}
          onClose={closeTab}
        />

        <div className="editor-pane">
          {showGraph ? (
            <GraphPanel
              activeNoteName={activeTab?.name ?? null}
              onOpenNote={name => { handleOpenNote(name); setShowGraph(false) }}
            />
          ) : activeTab ? (
            <Editor
              key={activeTab.id}
              tab={activeTab}
              noteNames={noteNames}
              onOpenNote={handleOpenNote}
              onContentChange={handleContentChange}
            />
          ) : (
            <div className="editor-empty">⌘O to open a note</div>
          )}
        </div>
      </div>

      {showSwitcher && (
        <FileSwitcher
          files={files}
          onOpen={name => handleOpenNote(name)}
          onClose={() => setShowSwitcher(false)}
        />
      )}
    </div>
  )
}
