import { ipcMain, shell, dialog, BrowserWindow, app, clipboard, nativeTheme } from 'electron'
import { existsSync, readFileSync, writeFileSync, readdirSync, copyFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { paths, instanceDir, gameDir } from './core/paths'
import { getSettings, saveSettings, resetSettings } from './core/settings'
import * as instances from './core/instances'
import * as content from './core/content'
import * as packs from './core/packs'
import * as tasks from './core/tasks'
import { applyDefaultMods, shouldSeed } from './core/defaults'
import * as icons from './core/icons'
import * as bedrock from './core/bedrock'
import * as news from './core/news'
import * as updater from './core/updater'
import * as auth from './core/auth'
import { detectJava, probeJava, provisionJava } from './core/java'
import { listVersions, latestVersions } from './core/mojang'
import { listLoaderVersions, loaderGameVersions } from './core/loaders'
import { launch, killGame, launcher, runningGames } from './core/launch'
import type { ContentKind, LoaderId, ProjectVersion } from '../shared/types'

/** Wire an EventEmitter to every renderer window. */
function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

/**
 * Add the configured default mods to a freshly installed pack.
 *
 * Runs after the pack's own files are in place, so the duplicate check in
 * applyDefaultMods can see what the author already shipped — a second copy of
 * Fabric API would crash the game on launch.
 */
async function withDefaults(
  inst: import('../shared/types').Instance,
  t: tasks.TaskHandle
): Promise<{ instance: import('../shared/types').Instance; installed: string[]; skipped: { name: string; reason: string }[] }> {
  if (!shouldSeed('pack')) return { instance: inst, installed: [], skipped: [] }
  t.update({ label: `Adding your default mods to ${inst.name}`, progress: null })
  const seed = await applyDefaultMods(inst.id, (label) => t.update({ detail: label }))
  return { instance: instances.readInstance(inst.id) ?? inst, ...seed }
}

export function registerIpc(): void {
  // --- Events pushed to the renderer ------------------------------------
  tasks.taskBus.on('update', (list) => broadcast('tasks:update', list))
  launcher.on('log', (line) => broadcast('log:line', line))
  launcher.on('state', (state) => broadcast('game:state', state))
  launcher.on('exit', (payload) => broadcast('game:exit', payload))
  launcher.on('progress', (payload) => broadcast('launch:progress', payload))
  nativeTheme.on('updated', () =>
    broadcast('theme:update', { dark: nativeTheme.shouldUseDarkColors })
  )

  const handle = <A extends unknown[], R>(channel: string, fn: (...args: A) => R | Promise<R>): void => {
    ipcMain.handle(channel, async (_event, ...args) => {
      try {
        return { ok: true, value: await fn(...(args as A)) }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    })
  }

  // --- Settings ----------------------------------------------------------
  handle('settings:get', () => getSettings())
  handle('settings:save', (patch: unknown) => saveSettings(patch))
  handle('settings:reset', () => resetSettings())
  handle('theme:get', () => ({ dark: nativeTheme.shouldUseDarkColors }))

  // --- Versions and loaders ---------------------------------------------
  handle('versions:list', () => listVersions())
  handle('versions:latest', () => latestVersions())
  handle('loaders:versions', (loader: LoaderId, mcVersion: string) => listLoaderVersions(loader, mcVersion))
  handle('loaders:gameVersions', (loader: LoaderId) => loaderGameVersions(loader))

  // --- Instances ---------------------------------------------------------
  handle('instances:list', () => instances.listInstances())
  handle('instances:get', (id: string) => instances.readInstance(id))
  handle('instances:groups', () => instances.listGroups())
  /**
   * Create an instance, then seed it with the configured default mods.
   *
   * Seeding is best-effort: a mod with no build for the chosen version is
   * reported and skipped rather than failing the creation, because losing a
   * correctly-created instance over one unavailable mod would be the worse
   * outcome. The instance is returned either way.
   */
  handle('instances:create', async (opts: instances.CreateOptions, installDefaults?: boolean) => {
    const inst = instances.createInstance(opts)
    if (!shouldSeed('instance', installDefaults)) {
      return { instance: inst, installed: [], skipped: [] }
    }
    const seed = await tasks.track(`Setting up ${inst.name}`, (t) =>
      applyDefaultMods(inst.id, (label) => t.update({ detail: label }))
    )
    return { instance: instances.readInstance(inst.id) ?? inst, ...seed }
  })
  handle('instances:update', (id: string, patch: unknown) =>
    instances.updateInstance(id, patch as Parameters<typeof instances.updateInstance>[1])
  )
  handle('instances:delete', (id: string) => {
    instances.deleteInstance(id)
    return instances.listInstances()
  })
  handle('instances:duplicate', (id: string, name: string) => instances.duplicateInstance(id, name))
  handle('instances:size', (id: string) => instances.instanceSize(id))
  handle('instances:reveal', (id: string, sub?: string) => {
    const target = sub ? join(gameDir(id), sub) : instanceDir(id)
    shell.openPath(existsSync(target) ? target : instanceDir(id))
    return true
  })

  // --- Launching ---------------------------------------------------------
  handle('game:launch', (id: string, accountId?: string, server?: string) =>
    tasks.track(`Launching ${instances.readInstance(id)?.name ?? id}`, async (t) => {
      const onProgress = (p: { label: string; detail: string; fraction: number | null }): void =>
        t.update({ label: p.label, detail: p.detail, progress: p.fraction })
      launcher.on('progress', onProgress)
      try {
        return await launch({ instanceId: id, accountId, server })
      } finally {
        launcher.off('progress', onProgress)
      }
    })
  )
  handle('game:kill', (id: string) => killGame(id))
  handle('game:running', () => runningGames())

  // --- Accounts ----------------------------------------------------------
  handle('accounts:list', () => auth.listAccounts())
  handle('accounts:setActive', (id: string) => auth.setActiveAccount(id))
  handle('accounts:remove', (id: string) => auth.removeAccount(id))
  handle('accounts:addOffline', (username: string) => auth.addOfflineAccount(username))
  handle('accounts:refresh', (id: string) => auth.ensureToken(id).then(() => auth.listAccounts()))

  // Microsoft sign-in is two steps so the UI can show the code while we poll.
  handle('accounts:msaStart', async () => {
    const prompt = await auth.startDeviceCode()
    // Poll in the background; the renderer listens for the result.
    void tasks
      .track('Microsoft sign-in', async (t) => {
        t.update({ detail: `Enter ${prompt.userCode}` })
        const tokens = await auth.pollDeviceCode(prompt.deviceCode, prompt.interval, t.signal)
        const account = await auth.finishMicrosoftLogin(tokens)
        broadcast('accounts:msaDone', { ok: true, account, accounts: auth.listAccounts() })
        return account
      })
      .catch((err: unknown) => {
        broadcast('accounts:msaDone', {
          ok: false,
          error: err instanceof Error ? err.message : String(err)
        })
      })
    return {
      userCode: prompt.userCode,
      verificationUri: prompt.verificationUri,
      expiresIn: prompt.expiresIn,
      message: prompt.message
    }
  })

  // --- Java --------------------------------------------------------------
  handle('java:detect', () => detectJava())
  handle('java:probe', (path: string) => probeJava(path))
  handle('java:provision', (major: number) =>
    tasks.track(`Downloading Java ${major}`, (t) =>
      provisionJava(major, (msg, frac) => t.update({ detail: msg, progress: frac }))
    )
  )

  // --- Content (mods, packs, shaders) ------------------------------------
  handle('content:search', (q: content.SearchQuery) => content.search(q))
  handle('content:versions', (platform: 'modrinth' | 'curseforge', projectId: string, gameVersion?: string, loader?: string) =>
    content.projectVersions(platform, projectId, gameVersion, loader)
  )
  handle(
    'content:install',
    (
      instanceId: string,
      kind: ContentKind,
      platform: 'modrinth' | 'curseforge',
      projectId: string,
      version: ProjectVersion,
      gameVersion: string,
      loader: string
    ) =>
      tasks.track(`Installing ${version.name}`, (t) =>
        content.installWithDependencies(
          instanceId,
          kind,
          platform,
          projectId,
          version,
          gameVersion,
          loader,
          (label, frac) => t.update({ detail: label, progress: frac })
        )
      )
  )
  handle('mods:list', (instanceId: string) => content.listInstalledMods(instanceId))
  handle('mods:toggle', (instanceId: string, filename: string) => {
    content.toggleMod(instanceId, filename)
    return content.listInstalledMods(instanceId)
  })
  handle('mods:delete', (instanceId: string, filename: string) => {
    content.deleteMod(instanceId, filename)
    return content.listInstalledMods(instanceId)
  })
  handle('mods:checkUpdates', (instanceId: string, gameVersion: string, loader: string) =>
    tasks.track('Checking for mod updates', () => content.checkModUpdates(instanceId, gameVersion, loader))
  )
  handle('mods:update', (instanceId: string, filename: string, version: ProjectVersion) =>
    tasks.track(`Updating ${filename}`, () => content.updateMod(instanceId, filename, version))
  )

  // --- Instance content browsing -----------------------------------------
  handle('worlds:list', (id: string) => instances.listWorlds(id))
  handle('worlds:delete', (id: string, folder: string) => {
    instances.deleteWorld(id, folder)
    return instances.listWorlds(id)
  })
  handle('screenshots:list', (id: string) => instances.listScreenshots(id))
  handle('servers:list', (id: string) => instances.listServers(id))
  handle('packfiles:list', (id: string, kind: 'resourcepacks' | 'shaderpacks') => instances.listPackFiles(id, kind))
  handle('packfiles:toggle', (id: string, kind: 'resourcepacks' | 'shaderpacks', name: string) => {
    instances.togglePackFile(id, kind, name)
    return instances.listPackFiles(id, kind)
  })
  handle('packfiles:delete', (id: string, kind: 'resourcepacks' | 'shaderpacks', name: string) => {
    instances.deletePackFile(id, kind, name)
    return instances.listPackFiles(id, kind)
  })

  // --- Import / export ---------------------------------------------------
  handle('packs:inspect', (file: string) => packs.inspectPack(file))
  handle('packs:importFile', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Import a modpack or instance',
      filters: [{ name: 'Packs and instances', extensions: ['mrpack', 'zip'] }],
      properties: ['openFile']
    })
    if (result.canceled || !result.filePaths[0]) return null
    const file = result.filePaths[0]
    return tasks.track(`Importing ${file.split(/[\\/]/).pop()}`, async (t) => {
      const inst = await packs.importAnyPack(file, (label, frac) =>
        t.update({ detail: label, progress: frac })
      )
      return withDefaults(inst, t)
    })
  })
  handle('packs:installModrinth', (projectId: string, versionId: string | null, name?: string) =>
    tasks.track(`Installing ${name ?? 'modpack'}`, async (t) => {
      const inst = await packs.installModrinthPack(
        projectId,
        versionId,
        (label, frac) => t.update({ detail: label, progress: frac }),
        name
      )
      return withDefaults(inst, t)
    })
  )
  handle('packs:export', async (id: string, format: 'multimc' | 'mrpack', includeSaves: boolean) => {
    const inst = instances.readInstance(id)
    const ext = format === 'mrpack' ? 'mrpack' : 'zip'
    const result = await dialog.showSaveDialog({
      title: 'Export instance',
      defaultPath: `${inst?.name ?? id}.${ext}`,
      filters: [{ name: format === 'mrpack' ? 'Modrinth pack' : 'Instance zip', extensions: [ext] }]
    })
    if (result.canceled || !result.filePath) return null
    return tasks.track(`Exporting ${inst?.name ?? id}`, async () =>
      format === 'mrpack'
        ? packs.exportMrpack(id, result.filePath!)
        : packs.exportInstance(id, result.filePath!, includeSaves)
    )
  })

  // --- Tasks -------------------------------------------------------------
  handle('tasks:list', () => tasks.list())
  handle('tasks:cancel', (id: string) => tasks.cancel(id))
  handle('tasks:clear', () => tasks.clearFinished())

  // --- Logs --------------------------------------------------------------
  // Defaults go in the body, not the signature: a default parameter makes the
  // rest-tuple inference in `handle` fall back to unknown[].
  handle('logs:read', (id: string, file?: string) => {
    const target = join(gameDir(id), 'logs', file ?? 'latest.log')
    if (!existsSync(target)) return ''
    return readFileSync(target, 'utf8').slice(-2_000_000)
  })
  handle('logs:list', (id: string) => {
    const dir = join(gameDir(id), 'logs')
    if (!existsSync(dir)) return []
    return readdirSync(dir).filter((f) => /\.(log|log\.gz|txt)$/.test(f))
  })
  handle('logs:crashReports', (id: string) => {
    const dir = join(gameDir(id), 'crash-reports')
    if (!existsSync(dir)) return []
    return readdirSync(dir)
      .filter((f) => f.endsWith('.txt'))
      .sort()
      .reverse()
      .slice(0, 20)
  })

  // --- Instance icons ----------------------------------------------------
  handle('icons:list', () => icons.listIcons())
  handle('icons:resolve', (key: string) => icons.resolveIcon(key))
  handle('icons:delete', (key: string) => {
    icons.deleteIcon(key)
    return icons.listIcons()
  })
  handle('icons:import', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choose an icon',
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico'] }],
      properties: ['openFile']
    })
    if (result.canceled || !result.filePaths[0]) return null
    return icons.importIcon(result.filePaths[0])
  })
  /** Import without a dialog, for drag-and-drop onto an instance. */
  handle('icons:importPath', (path: string) => icons.importIcon(path))

  // --- Updates -----------------------------------------------------------
  handle('updates:check', () => updater.check())
  handle('updates:download', (info: updater.UpdateInfo) => updater.openDownload(info))

  // --- News --------------------------------------------------------------
  handle('news:list', () => news.loadAll())
  handle('news:save', (draft: news.DraftPost) => {
    news.savePost(draft)
    return news.loadAll()
  })
  handle('news:delete', (file: string) => {
    news.deletePost(file)
    return news.loadAll()
  })
  handle('news:reveal', () => {
    shell.openPath(news.newsDir())
    return news.newsDir()
  })
  handle('news:dir', () => news.newsDir())

  // --- Bedrock -----------------------------------------------------------
  handle('bedrock:supported', () => bedrock.isSupported())
  handle('bedrock:detect', () => bedrock.detect())
  handle('bedrock:launch', (preferPreview?: boolean) => bedrock.launch(preferPreview))
  handle('bedrock:store', () => bedrock.openStorePage())

  // --- Mods added straight from an instance -------------------------------
  /** Copy jar files the user picked or dropped into an instance's mods folder. */
  handle('mods:addFiles', async (instanceId: string, paths?: string[]) => {
    let files = paths
    if (!files || files.length === 0) {
      const result = await dialog.showOpenDialog({
        title: 'Add mods',
        filters: [{ name: 'Mod jars', extensions: ['jar'] }],
        properties: ['openFile', 'multiSelections']
      })
      if (result.canceled) return content.listInstalledMods(instanceId)
      files = result.filePaths
    }

    const dir = join(gameDir(instanceId), 'mods')
    mkdirSync(dir, { recursive: true })
    for (const file of files) {
      if (!file.toLowerCase().endsWith('.jar')) continue
      const name = file.split(/[\\/]/).pop()
      if (name) copyFileSync(file, join(dir, name))
    }
    return content.listInstalledMods(instanceId)
  })

  // --- Shell helpers -----------------------------------------------------
  handle('shell:openExternal', (url: string) => {
    // Only ever hand http(s) to the OS browser.
    if (!/^https?:\/\//i.test(url)) throw new Error('Refusing to open a non-http URL')
    return shell.openExternal(url)
  })
  handle('shell:openPath', (path: string) => shell.openPath(path))
  handle('shell:showItem', (path: string) => {
    shell.showItemInFolder(path)
    return true
  })
  handle('clipboard:write', (text: string) => {
    clipboard.writeText(text)
    return true
  })
  handle('dialog:pickFile', async (filters?: { name: string; extensions: string[] }[]) => {
    const result = await dialog.showOpenDialog({ properties: ['openFile'], filters })
    return result.canceled ? null : result.filePaths[0]
  })
  handle('dialog:pickFolder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })
  handle('dialog:confirm', async (title: string, message: string, confirmLabel?: string) => {
    const result = await dialog.showMessageBox({
      type: 'warning',
      title,
      message,
      buttons: [confirmLabel ?? 'Delete', 'Cancel'],
      defaultId: 1,
      cancelId: 1
    })
    return result.response === 0
  })

  // --- App / window ------------------------------------------------------
  handle('app:info', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
    platform: process.platform,
    dataDir: paths.root
  }))
  handle('window:minimize', () => BrowserWindow.getFocusedWindow()?.minimize())
  handle('window:maximize', () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return false
    win.isMaximized() ? win.unmaximize() : win.maximize()
    return win.isMaximized()
  })
  handle('window:close', () => BrowserWindow.getFocusedWindow()?.close())
  handle('window:isMaximized', () => BrowserWindow.getFocusedWindow()?.isMaximized() ?? false)

  /** Toggling glass off should also drop the native window material. */
  handle('window:setMaterial', (enabled: boolean) => {
    for (const win of BrowserWindow.getAllWindows()) {
      try {
        if (process.platform === 'win32') {
          win.setBackgroundMaterial(enabled ? 'acrylic' : 'none')
        } else if (process.platform === 'darwin') {
          win.setVibrancy(enabled ? 'under-window' : null)
        }
      } catch {
        // Unsupported OS build — the CSS fallback still looks right.
      }
    }
    return true
  })

  // Persist a note file per instance without a round trip through settings.
  handle('instances:writeNotes', (id: string, notes: string) => {
    writeFileSync(join(instanceDir(id), 'notes.md'), notes, 'utf8')
    return instances.updateInstance(id, { notes })
  })
}
