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
let overlayPaths: string[] = []  // active vault dirs in overlay mode
let overlayModeActive = false
let watcher: FSWatcher | null = null

export function setVaultPath(p: string | null): void {
  vaultPath = p
}

export function getVaultPath(): string | null {
  return vaultPath
}

export function setOverlayPaths(paths: string[]): void {
  overlayPaths = paths
}

export function getOverlayPaths(): string[] {
  return overlayPaths
}

export function setOverlayModeActive(enabled: boolean): void {
  overlayModeActive = enabled
}

function activeDirs(): string[] {
  // In overlay mode return the selected set (may be empty — user deselected all)
  if (overlayModeActive) return overlayPaths
  return vaultPath ? [vaultPath] : []
}

export async function listFiles(): Promise<FileEntry[]> {
  const dirs = activeDirs()
  if (!dirs.length) return []

  const seen = new Set<string>()
  const files: FileEntry[] = []

  for (const dir of dirs) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      for (const e of entries) {
        if (!e.isFile() || !e.name.endsWith('.md')) continue
        const filePath = path.join(dir, e.name)
        if (seen.has(filePath)) continue
        seen.add(filePath)
        const stat = await fs.stat(filePath)
        files.push({ name: e.name.replace(/\.md$/, ''), path: filePath, mtime: stat.mtimeMs })
      }
    } catch { /* skip unreadable vault dir */ }
  }

  return files.sort((a, b) => a.name.localeCompare(b.name))
}

// Search all active vault dirs + one level of subdirectories for an asset
export async function findAsset(filename: string): Promise<string | null> {
  for (const dir of activeDirs()) {
    const rootPath = path.join(dir, filename)
    try { await fs.access(rootPath); return rootPath } catch {}
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue
        const subPath = path.join(dir, entry.name, filename)
        try { await fs.access(subPath); return subPath } catch {}
      }
    } catch {}
  }
  return null
}

export async function saveAsset(filename: string, data: Buffer): Promise<string> {
  if (!vaultPath) throw new Error('No vault open')
  const ext = path.extname(filename)
  const base = path.basename(filename, ext)
  let finalName = filename
  let filePath = path.join(vaultPath, finalName)
  let counter = 1
  while (true) {
    try { await fs.access(filePath); finalName = `${base} ${counter++}${ext}`; filePath = path.join(vaultPath, finalName) }
    catch { break }
  }
  await fs.writeFile(filePath, data)
  return finalName
}

export async function readFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf-8')
}

export async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.writeFile(filePath, content, 'utf-8')
}

function activeWriteDir(): string | null {
  // The directory where new files are created — primary vault, or first active overlay
  return vaultPath ?? overlayPaths[0] ?? null
}

export async function createFile(name: string): Promise<string> {
  const dir = activeWriteDir()
  if (!dir) throw new Error('No vault open')
  const safeName = name.endsWith('.md') ? name : `${name}.md`
  const filePath = path.join(dir, safeName)
  const existing = await findExistingFileCaseInsensitive(safeName)
  if (existing) return existing
  await fs.writeFile(filePath, '', { encoding: 'utf-8', flag: 'wx' })
  return filePath
}

export async function renameFile(oldPath: string, newName: string): Promise<string> {
  const dir = activeWriteDir()
  if (!dir) throw new Error('No vault open')
  const safeName = newName.endsWith('.md') ? newName : `${newName}.md`
  // Rename stays in the same directory as the original file
  const fileDir = path.dirname(oldPath)
  const newPath = path.join(fileDir, safeName)
  if (newPath.toLowerCase() !== oldPath.toLowerCase()) {
    const existing = await findExistingFileCaseInsensitive(safeName)
    if (existing) throw new Error(`A note named "${newName}" already exists`)
  }
  await fs.rename(oldPath, newPath)
  return newPath
}

async function findExistingFileCaseInsensitive(filename: string): Promise<string | null> {
  const dirs = activeDirs()
  if (!dirs.length) return null
  const lower = filename.toLowerCase()
  for (const dir of dirs) {
    try {
      const entries = await fs.readdir(dir)
      const match = entries.find(e => e.toLowerCase() === lower)
      if (match) return path.join(dir, match)
    } catch { /* ignore */ }
  }
  return null
}

async function indexAll(): Promise<void> {
  const files = await listFiles()
  for (const f of files) {
    try {
      const content = await fs.readFile(f.path, 'utf-8')
      indexFile(f.path, f.name, content)
    } catch { /* skip */ }
  }
}

export function startWatcher(win: BrowserWindow): void {
  if (watcher) {
    watcher.close()
    watcher = null
  }

  const dirs = activeDirs()
  if (!dirs.length) return

  indexAll()

  const patterns = dirs.map(d => path.join(d, '**/*.md'))
  watcher = chokidar.watch(patterns, {
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
