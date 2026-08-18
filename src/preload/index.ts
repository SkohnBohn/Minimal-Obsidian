import { contextBridge, ipcRenderer } from 'electron'

export interface FileEntry {
  name: string
  path: string
  mtime: number
}

export interface SearchResult {
  path: string
  name: string
  snippet: string
}

export interface LinkGraph {
  nodes: string[]
  edges: Array<{ source: string; target: string }>
}

export interface VaultChangeEvent {
  type: 'add' | 'change' | 'unlink'
  path: string
  name: string
}

const api = {
  vault: {
    open: (): Promise<FileEntry[] | null> => ipcRenderer.invoke('vault:open'),
    setPath: (p: string): Promise<{ files?: FileEntry[]; error?: string }> =>
      ipcRenderer.invoke('vault:setPath', p),
    getPath: (): Promise<string | null> => ipcRenderer.invoke('vault:getPath'),
    list: (): Promise<FileEntry[]> => ipcRenderer.invoke('vault:list'),
    read: (filePath: string): Promise<string> => ipcRenderer.invoke('vault:read', filePath),
    write: (filePath: string, content: string): Promise<void> =>
      ipcRenderer.invoke('vault:write', filePath, content),
    create: (name: string): Promise<string> => ipcRenderer.invoke('vault:create', name),
    rename: (oldPath: string, newName: string): Promise<string> =>
      ipcRenderer.invoke('vault:rename', oldPath, newName),
    links: (): Promise<LinkGraph> => ipcRenderer.invoke('vault:links'),
    onChange: (cb: (event: VaultChangeEvent) => void) => {
      const handler = (_: unknown, event: VaultChangeEvent) => cb(event)
      ipcRenderer.on('vault:changed', handler)
      return () => ipcRenderer.removeListener('vault:changed', handler)
    }
  },
  search: {
    query: (q: string): Promise<SearchResult[]> => ipcRenderer.invoke('search:query', q)
  },
  settings: {
    get: (key: string): Promise<unknown> => ipcRenderer.invoke('app:settings:get', key),
    set: (key: string, value: unknown): Promise<void> =>
      ipcRenderer.invoke('app:settings:set', key, value)
  },
  app: {
    onWillQuit: (cb: () => void): (() => void) => {
      const handler = () => cb()
      ipcRenderer.on('app:will-quit', handler)
      return () => ipcRenderer.removeListener('app:will-quit', handler)
    },
    confirmQuit: (): Promise<void> => ipcRenderer.invoke('app:confirm-quit')
  }
}

contextBridge.exposeInMainWorld('api', api)
