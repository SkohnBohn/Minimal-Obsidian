/// <reference types="vite/client" />

import type { FileEntry, SearchResult, LinkGraph, VaultChangeEvent } from '../preload/index'

declare global {
  interface Window {
    api: {
      vault: {
        open(): Promise<FileEntry[] | null>
        setPath(p: string): Promise<{ files?: FileEntry[]; error?: string }>
        getPath(): Promise<string | null>
        list(): Promise<FileEntry[]>
        read(filePath: string): Promise<string>
        write(filePath: string, content: string): Promise<void>
        create(name: string): Promise<string>
        rename(oldPath: string, newName: string): Promise<string>
        saveAsset(filename: string, data: Uint8Array): Promise<string>
        readAsset(filename: string): Promise<string>
        getSaved(): Promise<string[]>
        setSaved(paths: string[]): Promise<void>
        links(): Promise<LinkGraph>
        onChange(cb: (event: VaultChangeEvent) => void): () => void
      }
      search: {
        query(q: string): Promise<SearchResult[]>
      }
      settings: {
        get(key: string): Promise<unknown>
        set(key: string, value: unknown): Promise<void>
      }
      app: {
        onWillQuit(cb: () => void): () => void
        confirmQuit(): Promise<void>
      }
    }
  }
}
