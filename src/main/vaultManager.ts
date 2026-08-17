import { promises as fs } from 'fs'
import path from 'path'
import chokidar, { FSWatcher } from 'chokidar'
import { BrowserWindow } from 'electron'
import { indexFile, removeFile } from './searchIndex'

export interface FileEntry {
  name: string
  path: string
  mtime: number
}

let vaultPath: string | null = null
let watcher: FSWatcher | null = null

export function setVaultPath(p: string): void {
  vaultPath = p
}

export function getVaultPath(): string | null {
  return vaultPath
}

export async function listFiles(): Promise<FileEntry[]> {
  if (!vaultPath) return []
  const entries = await fs.readdir(vaultPath, { withFileTypes: true })
  const files: FileEntry[] = []
  for (const e of entries) {
    if (e.isFile() && e.name.endsWith('.md')) {
      const filePath = path.join(vaultPath, e.name)
      const stat = await fs.stat(filePath)
      files.push({
        name: e.name.replace(/\.md$/, ''),
        path: filePath,
        mtime: stat.mtimeMs
      })
    }
  }
  return files.sort((a, b) => a.name.localeCompare(b.name))
}

export async function readFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf-8')
}

export async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.writeFile(filePath, content, 'utf-8')
}

export async function createFile(name: string): Promise<string> {
  if (!vaultPath) throw new Error('No vault open')
  const safeName = name.endsWith('.md') ? name : `${name}.md`
  const filePath = path.join(vaultPath, safeName)
  // If the file already exists (including case-insensitive macOS matches), never overwrite it.
  // Use the canonical path from the directory listing so we return the real filename casing.
  const existing = await findExistingFileCaseInsensitive(safeName)
  if (existing) return existing
  await fs.writeFile(filePath, '', { encoding: 'utf-8', flag: 'wx' })
  return filePath
}

export async function renameFile(oldPath: string, newName: string): Promise<string> {
  if (!vaultPath) throw new Error('No vault open')
  const safeName = newName.endsWith('.md') ? newName : `${newName}.md`
  const newPath = path.join(vaultPath, safeName)
  // Prevent silently overwriting a different existing file.
  if (newPath.toLowerCase() !== oldPath.toLowerCase()) {
    const existing = await findExistingFileCaseInsensitive(safeName)
    if (existing) throw new Error(`A note named "${newName}" already exists`)
  }
  await fs.rename(oldPath, newPath)
  return newPath
}

async function findExistingFileCaseInsensitive(filename: string): Promise<string | null> {
  if (!vaultPath) return null
  const lower = filename.toLowerCase()
  try {
    const entries = await fs.readdir(vaultPath)
    const match = entries.find(e => e.toLowerCase() === lower)
    if (match) return path.join(vaultPath, match)
  } catch { /* ignore */ }
  return null
}

async function indexAll(): Promise<void> {
  const files = await listFiles()
  for (const f of files) {
    try {
      const content = await fs.readFile(f.path, 'utf-8')
      indexFile(f.path, f.name, content)
    } catch {
      // skip unreadable files
    }
  }
}

export function startWatcher(win: BrowserWindow): void {
  if (!vaultPath) return
  if (watcher) {
    watcher.close()
    watcher = null
  }

  indexAll()

  watcher = chokidar.watch(path.join(vaultPath, '**/*.md'), {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 300 }
  })

  watcher.on('add', async (filePath: string) => {
    const name = path.basename(filePath, '.md')
    const content = await fs.readFile(filePath, 'utf-8').catch(() => '')
    indexFile(filePath, name, content)
    win.webContents.send('vault:changed', { type: 'add', path: filePath, name })
  })

  watcher.on('change', async (filePath: string) => {
    const name = path.basename(filePath, '.md')
    const content = await fs.readFile(filePath, 'utf-8').catch(() => '')
    indexFile(filePath, name, content)
    win.webContents.send('vault:changed', { type: 'change', path: filePath, name })
  })

  watcher.on('unlink', (filePath: string) => {
    const name = path.basename(filePath, '.md')
    removeFile(filePath)
    win.webContents.send('vault:changed', { type: 'unlink', path: filePath, name })
  })
}

export function stopWatcher(): void {
  watcher?.close()
  watcher = null
}
