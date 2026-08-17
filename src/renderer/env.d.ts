/// <reference types="vite/client" />

import type { FileEntry, SearchResult, LinkGraph, VaultChangeEvent } from '../preload/index'

declare global {
  interface Window {
    api: {
      vault: {
        open(): Promise<FileEntry[] | null>
        list(): Promise<FileEntry[]>
        read(filePath: string): Promise<string>
        write(filePath: string, content: string): Promise<void>
        create(name: string): Promise<string>
        rename(oldPath: string, newName: string): Promise<string>
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
    }
  }
}
