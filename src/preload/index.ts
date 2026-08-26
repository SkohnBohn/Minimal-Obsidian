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
    saveAsset: (filename: string, data: Uint8Array): Promise<string> =>
      ipcRenderer.invoke('vault:saveAsset', filename, data),
    readAsset: (filename: string): Promise<string> =>
      ipcRenderer.invoke('vault:readAsset', filename),
    getSaved: (): Promise<string[]> => ipcRenderer.invoke('vault:getSaved'),
    setSaved: (paths: string[]): Promise<void> => ipcRenderer.invoke('vault:setSaved', paths),
    links: (): Promise<LinkGraph> => ipcRenderer.invoke('vault:links'),
    getOverlayState: (): Promise<{ overlayMode: boolean; overlayPaths: string[] }> =>
      ipcRenderer.invoke('vault:getOverlayState'),
    setOverlayMode: (enabled: boolean): Promise<{ files: FileEntry[] }> =>
      ipcRenderer.invoke('vault:setOverlayMode', enabled),
    toggleOverlayPath: (vaultDir: string): Promise<{ files: FileEntry[]; deactivatedPath?: string }> =>
      ipcRenderer.invoke('vault:toggleOverlayPath', vaultDir),
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
    onSwitchTab: (cb: (dir: 'prev' | 'next') => void): (() => void) => {
      const handler = (_: unknown, dir: 'prev' | 'next') => cb(dir)
      ipcRenderer.on('app:switch-tab', handler)
      return () => ipcRenderer.removeListener('app:switch-tab', handler)
    },
    onFullscreen: (cb: (isFullscreen: boolean) => void): (() => void) => {
      const handler = (_: unknown, v: boolean) => cb(v)
      ipcRenderer.on('app:fullscreen', handler)
      return () => ipcRenderer.removeListener('app:fullscreen', handler)
    },
    confirmQuit: (): Promise<void> => ipcRenderer.invoke('app:confirm-quit')
  }
}

contextBridge.exposeInMainWorld('api', api)
