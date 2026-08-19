import { app, BrowserWindow, ipcMain, dialog, protocol } from 'electron'
import path from 'path'
import { promises as fsAsync } from 'fs'
import Store from 'electron-store'
import {
  setVaultPath,
  getVaultPath,
  listFiles,
  readFile,
  writeFile,
  createFile,
  renameFile,
  saveAsset,
  startWatcher
} from './vaultManager'
import { search } from './searchIndex'
import { buildLinkGraph } from './linkParser'
import { promises as fs } from 'fs'

const store = new Store()

// Must be called before app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'vault-asset', privileges: { secure: true, standard: true, supportFetchAPI: true } }
])

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    backgroundColor: '#fcf6e3',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 8 }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  return win
}

function registerIPC(win: BrowserWindow): void {
  ipcMain.handle('vault:open', async () => {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return null
    const vaultDir = result.filePaths[0]
    setVaultPath(vaultDir)
    store.set('vaultPath', vaultDir)
    startWatcher(win)
    return listFiles()
  })

  ipcMain.handle('vault:setPath', async (_e, vaultDir: string) => {
    try {
      const stat = await fs.stat(vaultDir)
      if (!stat.isDirectory()) return { error: 'Not a directory' }
      setVaultPath(vaultDir)
      store.set('vaultPath', vaultDir)
      startWatcher(win)
      return { files: await listFiles() }
    } catch {
      return { error: 'Path not found' }
    }
  })

  ipcMain.handle('vault:getPath', () => getVaultPath())

  ipcMain.handle('vault:list', async () => {
    return listFiles()
  })

  ipcMain.handle('vault:read', async (_e, filePath: string) => {
    return readFile(filePath)
  })

  ipcMain.handle('vault:write', async (_e, filePath: string, content: string) => {
    await writeFile(filePath, content)
  })

  ipcMain.handle('vault:create', async (_e, name: string) => {
    return createFile(name)
  })

  ipcMain.handle('vault:rename', async (_e, oldPath: string, newName: string) => {
    return renameFile(oldPath, newName)
  })

  ipcMain.handle('vault:saveAsset', async (_e, filename: string, data: Uint8Array) => {
    return saveAsset(filename, Buffer.from(data))
  })

  ipcMain.handle('vault:links', async () => {
    const files = await listFiles()
    const withContent = await Promise.all(
      files.map(async f => ({
        name: f.name,
        content: await fs.readFile(f.path, 'utf-8').catch(() => '')
      }))
    )
    return buildLinkGraph(withContent)
  })

  ipcMain.handle('search:query', async (_e, query: string) => {
    const includeSources = (store.get('includeSources') ?? true) as boolean
    return search(query, includeSources)
  })

  ipcMain.handle('app:settings:get', (_e, key: string) => {
    return store.get(key)
  })

  ipcMain.handle('app:settings:set', (_e, key: string, value: unknown) => {
    store.set(key, value)
  })
}

app.whenReady().then(() => {
  const ASSET_MIME: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml'
  }

  // Serve vault files as vault-asset://img/<filename>
  protocol.handle('vault-asset', async (request) => {
    try {
      const url = new URL(request.url)
      const filename = decodeURIComponent(url.pathname.slice(1))
      const vaultDir = getVaultPath()
      if (!vaultDir || !filename) return new Response('Not found', { status: 404 })
      const filePath = path.resolve(path.join(vaultDir, filename))
      const vaultResolved = path.resolve(vaultDir)
      if (!filePath.startsWith(vaultResolved + path.sep))
        return new Response('Forbidden', { status: 403 })
      const data = await fsAsync.readFile(filePath)
      const ext = path.extname(filename).slice(1).toLowerCase()
      const mime = ASSET_MIME[ext] ?? 'application/octet-stream'
      return new Response(data, { headers: { 'content-type': mime } })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })

  const win = createWindow()

  const savedVault = store.get('vaultPath') as string | undefined
  if (savedVault) {
    setVaultPath(savedVault)
    startWatcher(win)
  }

  registerIPC(win)

  // Give the renderer a chance to flush unsaved writes before quitting.
  let readyToQuit = false
  app.on('before-quit', (e) => {
    if (!readyToQuit) {
      e.preventDefault()
      if (win.isDestroyed()) {
        readyToQuit = true
        app.quit()
      } else {
        win.webContents.send('app:will-quit')
      }
    }
  })

  ipcMain.handle('app:confirm-quit', () => {
    readyToQuit = true
    app.quit()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
