import { app, BrowserWindow, shell, nativeImage, protocol } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { registerIpcHandlers, registerImageProtocol } from './ipc/handlers'
import { registerReminderHandlers, startReminderService } from './ipc/reminders'
import { buildMenu } from './menu'

protocol.registerSchemesAsPrivileged([{ scheme: 'asterisk-file', privileges: { standard: true } }])

const isDev = !app.isPackaged

function getIconPath(): string | undefined {
  // Platform-specific icon names
  const platformIcons = process.platform === 'darwin' 
    ? ['macos_icon.icns', 'linux_icon.png'] // .icns for mac, fallback to png
    : process.platform === 'win32' 
      ? ['windows_icon.ico', 'linux_icon.png']
      : ['linux_icon.png']
  
  const basePaths = [
    process.cwd(),  // Dev: project root
    join(app.getAppPath(), '..'),  // Production: resources next to app
    app.getAppPath(),
    join(__dirname, '..', '..'),
    join(__dirname, '..', '..', '..')
  ]
  
  for (const iconName of platformIcons) {
    for (const basePath of basePaths) {
      const fullPath = join(basePath, 'resources', iconName)
      if (existsSync(fullPath)) {
        if (isDev) console.log('Icon found:', fullPath)
        return fullPath
      }
    }
  }
  
  if (isDev) console.log('No icon found in:', basePaths.map(b => join(b, 'resources')))
  return undefined
}

function createWindow(): BrowserWindow {
  const iconPath = getIconPath()
  const iconImage = iconPath ? nativeImage.createFromPath(iconPath) : null
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 720,
    minHeight: 500,
    backgroundColor: '#111111',
    title: 'Asterisk',
    ...(iconImage && !iconImage.isEmpty() ? { icon: iconImage } : {}),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 14, y: 14 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false, // must be false when using contextBridge with node integration off
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (isDev) {
    const rendererUrl = process.env['ELECTRON_RENDERER_URL']
    if (rendererUrl) {
      win.loadURL(rendererUrl)
    } else {
      win.loadFile(join(__dirname, '../renderer/index.html'))
    }
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Open external links in OS browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  return win
}

app.whenReady().then(() => {
  const iconPath = getIconPath()
  if (iconPath) {
    const iconImage = nativeImage.createFromPath(iconPath)
    if (isDev) {
      console.log('Icon path:', iconPath)
      console.log('Icon isEmpty:', iconImage.isEmpty())
      console.log('Icon size:', iconImage.getSize())
    }
    if (process.platform === 'darwin' && !iconImage.isEmpty()) {
      app.dock.setIcon(iconImage)
    }
  }

  registerIpcHandlers()
  registerReminderHandlers()
  registerImageProtocol()
  buildMenu()
  startReminderService()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
