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
  const [showSwitcher, setShowSwitcher] = useState(false)
  const [vaultReady, setVaultReady] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleInput, setTitleInput] = useState('')

  const {
    tabs, activeTab, activeTabId, setActiveTabId,
    openTab, openTabByName, navigateInTab, goBack, goForward,
    openGraphTab, renameTab,
    closeTab, createNewTab, switchTab,
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
        await window.api.vault.write(tab.path, content)
        markTabSaved(tabId, content)
        saveTimers.current.delete(tabId)
      }, 500))
    },
    [updateTabState, markTabSaved]
  )

  const handleNavigateNote = useCallback((name: string) => {
    if (activeTabId) navigateInTab(activeTabId, name)
    else openTabByName(name)
  }, [activeTabId, navigateInTab, openTabByName])

  const handleOpenNote = useCallback((name: string) => openTabByName(name), [openTabByName])
  const handleOpenFile = useCallback((path: string, name: string) => openTab(path, name), [openTab])

  const commitRename = useCallback(async () => {
    if (!activeTab || !editingTitle) return
    const newName = titleInput.trim()
    setEditingTitle(false)
    if (!newName || newName === activeTab.name) return
    try {
      const newPath = await window.api.vault.rename(activeTab.path, newName)
      renameTab(activeTab.id, newName, newPath)
      setFiles(await window.api.vault.list())
    } catch (err) {
      console.error('Rename failed', err)
    }
  }, [activeTab, editingTitle, titleInput, renameTab])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey
      if (meta && !e.shiftKey && !e.altKey && e.key === 'o') {
        e.preventDefault(); setShowSwitcher(v => !v)
      } else if (meta && !e.shiftKey && !e.altKey && e.key === 'n') {
        e.preventDefault(); createNewTab()
      } else if (meta && !e.shiftKey && !e.altKey && e.key === 'w') {
        e.preventDefault(); if (activeTabId) closeTab(activeTabId)
      } else if (meta && e.shiftKey && e.key === '[') {
        e.preventDefault(); switchTab('prev')
      } else if (meta && e.shiftKey && e.key === ']') {
        e.preventDefault(); switchTab('next')
      } else if (meta && e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault(); if (activeTabId) goBack(activeTabId)
      } else if (meta && e.altKey && e.key === 'ArrowRight') {
        e.preventDefault(); if (activeTabId) goForward(activeTabId)
      } else if (e.key === 'Escape') {
        setShowSwitcher(false); setShowSidebar(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeTabId, closeTab, createNewTab, switchTab, goBack, goForward])

  if (!vaultReady) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--stone)' }}>
        Opening vault…
      </div>
    )
  }

  return (
    <div className="app">
      {/* Draggable titlebar strip — sits above everything, keeps traffic lights clear */}
      <div className="titlebar" />

      <div className="app-row">
        {/* Left rail */}
        <div className="rail">
          <button
            className={`rail-btn${showSidebar ? ' active' : ''}`}
            title="Search"
            onClick={() => setShowSidebar(v => !v)}
          >
            O
          </button>
          <button
            className="rail-btn"
            title="Graph view"
            onClick={openGraphTab}
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

        {/* Search sidebar — in flow, pushes main to the right */}
        {showSidebar && (
          <SearchSidebar
            onOpen={(path, name) => { handleOpenFile(path, name); setShowSidebar(false) }}
          />
        )}

        {/* Main content */}
        <div className="main">
          <TabBar
            tabs={tabs}
            activeTabId={activeTabId}
            onActivate={setActiveTabId}
            onClose={closeTab}
          />

          <div className="editor-pane">
            {activeTab?.type === 'graph' ? (
              <GraphPanel
                activeNoteName={null}
                onOpenNote={handleOpenNote}
              />
            ) : activeTab ? (
              <>
                {editingTitle ? (
                  <input
                    className="note-title note-title-input"
                    value={titleInput}
                    onChange={e => setTitleInput(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitRename()
                      if (e.key === 'Escape') setEditingTitle(false)
                    }}
                    autoFocus
                  />
                ) : (
                  <div
                    className="note-title"
                    title="Click to rename"
                    onClick={() => { setTitleInput(activeTab.name); setEditingTitle(true) }}
                  >
                    {activeTab.name}
                  </div>
                )}
                <Editor
                  key={`${activeTab.id}-${activeTab.contentVersion}`}
                  tab={activeTab}
                  noteNames={noteNames}
                  onNavigateNote={handleNavigateNote}
                  onOpenNote={handleOpenNote}
                  onContentChange={handleContentChange}
                />
              </>
            ) : (
              <div className="editor-empty">⌘O to open a note</div>
            )}
          </div>
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
