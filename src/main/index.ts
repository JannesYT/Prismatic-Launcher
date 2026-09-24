import { app, BrowserWindow, shell, nativeTheme, protocol, net } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ensureDirs, paths } from './core/paths'
import { getSettings } from './core/settings'
import { registerIpc } from './ipc'

// A second instance should focus the first, not open another launcher.
if (!app.requestSingleInstanceLock()) {
  app.quit()
}

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const settings = getSettings()
  const wantsGlass = settings.appearance.glassStyle === 'liquid' && settings.appearance.nativeWindowBlur

  mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 900,
    minHeight: 620,
    show: false,
    // A frameless window is what lets the glass layer run edge to edge.
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    trafficLightPosition: { x: 16, y: 18 },
    // Transparent-ish background so the native material shows through.
    backgroundColor: wantsGlass ? '#00000000' : nativeTheme.shouldUseDarkColors ? '#0b0d12' : '#f2f4f8',
    ...(process.platform === 'win32' && wantsGlass ? { backgroundMaterial: 'acrylic' as const } : {}),
    ...(process.platform === 'darwin' && wantsGlass
      ? { vibrancy: 'under-window' as const, visualEffectState: 'active' as const }
      : {}),
    webPreferences: {
      // ESM build output, so the preload is .mjs and __dirname doesn't exist.
      preload: join(import.meta.dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  // Never let the game or a mod page navigate the launcher itself.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devServer = process.env.ELECTRON_RENDERER_URL
    if (devServer && url.startsWith(devServer)) return
    if (url.startsWith('file://')) return
    event.preventDefault()
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
  })

  const forward = (): void => {
    mainWindow?.webContents.send('window:state', {
      maximized: mainWindow?.isMaximized() ?? false,
      fullscreen: mainWindow?.isFullScreen() ?? false
    })
  }
  mainWindow.on('maximize', forward)
  mainWindow.on('unmaximize', forward)
  mainWindow.on('enter-full-screen', forward)
  mainWindow.on('leave-full-screen', forward)

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }
}

/**
 * Screenshots and instance icons live outside the app bundle, so the renderer
 * needs a safe way to display them. `prismatic-file://` only resolves paths
 * inside our own data directory.
 */
function registerFileProtocol(): void {
  protocol.handle('prismatic-file', async (request) => {
    const url = new URL(request.url)
    const decoded = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
    const resolved = join(decoded)
    if (!resolved.startsWith(paths.root)) {
      return new Response('Forbidden', { status: 403 })
    }
    return net.fetch(pathToFileURL(resolved).toString())
  })
}

app.whenReady().then(() => {
  ensureDirs()
  // Leaves one example post the first time, so the file format explains itself
  // without anyone having to read documentation.
  void import('./core/news').then((news) => news.seedExample())
  registerFileProtocol()
  registerIpc()
  createWindow()

  const settings = getSettings()
  if (settings.appearance.theme !== 'system') {
    nativeTheme.themeSource = settings.appearance.theme
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
