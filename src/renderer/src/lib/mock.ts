/**
 * A tiny in-memory backend used only when the UI runs in a plain browser
 * (`npm run dev:ui`). It keeps the design loop fast: no Electron, no Java, no
 * network. Everything here is throwaway; the real implementations live in
 * src/main/core.
 */
import type { Account, Instance, InstanceOverrides, Settings, Task, ProjectHit, InstalledMod } from '../../../shared/types'
import type { NewsPost } from '../../../shared/news'

const emptyOverrides = (): InstanceOverrides => ({
  memory: null,
  javaPath: null,
  jvmArgs: null,
  window: null,
  commands: null,
  env: null,
  quickPlay: null,
  showLogAfterLaunch: null,
  closeLauncherOnLaunch: null
})

const settings: Settings = {
  appearance: {
    glassStyle: 'liquid',
    glassVariant: 'regular',
    theme: 'system',
    accent: '#5B8CFF',
    lensing: 62,
    blur: 70,
    specular: 55,
    motionScale: 1,
    reduceTransparency: false,
    reduceMotion: false,
    increaseContrast: false,
    tabBarMinimize: 'onScrollDown',
    tabBarLabels: 'always',
    cornerRadius: 26,
    fontScale: 1,
    nativeWindowBlur: true,
    layout: 'bottomTabs',
    density: 'comfortable',
    instanceView: 'grid',
    cardSize: 168,
    railWidth: 210,
    themePreset: 'prismatic',
    customTheme: null,
    userPresets: [],
    backgroundImage: null,
    backgroundOpacity: 40,
    backgroundBlur: 20
  },
  updates: {
    source: 'github',
    githubRepo: '',
    feedUrl: '',
    checkOnStartup: true,
    includePrereleases: false,
    dismissedVersion: ''
  },
  news: { showMojang: true, feeds: [], authorMode: true },
  bedrock: { show: true, preferPreview: false, totalPlaySeconds: 0, lastPlayed: null },
  java: {
    path: null,
    memory: { min: 512, max: 6144 },
    jvmArgs: '-XX:+UseG1GC -XX:MaxGCPauseMillis=50',
    autoDetect: true,
    autoDownload: true,
    skipCompatChecks: false
  },
  minecraft: {
    window: { width: 1280, height: 720, maximized: false, fullscreen: false },
    closeLauncherOnLaunch: false,
    quitLauncherOnGameExit: false,
    showLogAfterLaunch: true,
    useNativeGLFW: false,
    useNativeOpenAL: false
  },
  downloads: { concurrency: 8, mirror: 'official', verifyHashes: true },
  newInstance: {
    installDefaults: true,
    modrinthSlugs: ['fabric-api'],
    localJars: [],
    applyToPacks: true,
    skipIncompatible: true
  },
  commands: { pre: '', wrapper: '', post: '' },
  env: {},
  integrations: { curseforgeApiKey: '', msaClientId: '', discordRichPresence: false },
  general: {
    instancesDir: 'C:\\Users\\you\\AppData\\Roaming\\Prismatic\\instances',
    sortBy: 'lastPlayed',
    groupCollapsed: [],
    updateChannel: 'stable',
    language: 'en',
    tabs: ['instances', 'discover', 'accounts', 'tasks', 'settings']
  }
}

const day = 86_400_000
const instances: Instance[] = [
  mk('all-the-mods-10', 'All the Mods 10', 'Modded', '1.21.1', 'neoforge', '21.1.72', 4, 41_400, 'package'),
  mk('create-above-beyond', 'Create: Above and Beyond', 'Modded', '1.18.2', 'forge', '40.2.21', 1, 128_800, 'gear'),
  mk('fabulously-optimized', 'Fabulously Optimized', 'Performance', '1.21.4', 'fabric', '0.16.9', 0, 9_300, 'zap'),
  mk('vanilla-1-21-4', 'Vanilla 1.21.4', null, '1.21.4', 'vanilla', null, 12, 2_100, 'grass'),
  mk('skyblock', 'Hypixel SkyBlock', 'Servers', '1.8.9', 'forge', '11.15.1.2318', 2, 305_000, 'sword'),
  mk('cobblemon', 'Cobblemon Adventure', 'Modded', '1.20.1', 'fabric', '0.16.5', 8, 18_600, 'sparkles'),
  mk('snapshot', 'Latest Snapshot', null, '25w37a', 'vanilla', null, 30, 400, 'flask'),
  mk('rlcraft', 'RLCraft', 'Modded', '1.12.2', 'forge', '14.23.5.2860', 60, 88_000, 'skull')
]

function mk(
  id: string,
  name: string,
  group: string | null,
  mcVersion: string,
  loader: Instance['loader'],
  loaderVersion: string | null,
  daysAgo: number,
  playSeconds: number,
  icon: string
): Instance {
  return {
    id,
    name,
    group,
    icon,
    mcVersion,
    loader,
    loaderVersion,
    components: [{ uid: 'net.minecraft', version: mcVersion, important: true }],
    notes: '',
    created: Date.now() - daysAgo * day - 30 * day,
    lastPlayed: Date.now() - daysAgo * day,
    totalPlaySeconds: playSeconds,
    overrides: emptyOverrides(),
    favourite: id === 'all-the-mods-10' || id === 'fabulously-optimized'
  }
}

const accounts: Account[] = [
  { id: 'a1', type: 'msa', username: 'Jannes', uuid: '8f3a2b10-4c5d-4e6f-8a9b-0c1d2e3f4a5b', active: true, expiresAt: Date.now() + 3_600_000 },
  { id: 'a2', type: 'offline', username: 'DevTester', uuid: '1c2d3e4f-5a6b-3c7d-8e9f-0a1b2c3d4e5f', active: false }
]

let tasks: Task[] = [
  { id: 't1', label: 'Downloading assets', detail: '1 842 / 2 310 objects', progress: 0.8, status: 'running', startedAt: Date.now() - 22_000 },
  { id: 't2', label: 'Installing Sodium 0.6.0', detail: '', progress: 1, status: 'done', startedAt: Date.now() - 300_000 },
  { id: 't3', label: 'Installing Forge 47.2.0', detail: '', progress: null, status: 'failed', error: 'Processor net.minecraftforge:installertools failed: exit code 1', startedAt: Date.now() - 900_000 }
]

const hits: ProjectHit[] = [
  h('sodium', 'Sodium', 'A modern rendering engine that greatly improves frame rates and reduces micro-stutter.', 'jellysquid3', 58_400_000, ['optimization'], ['fabric', 'neoforge']),
  h('iris', 'Iris Shaders', 'A shaders mod compatible with OptiFine shaderpacks, built for performance.', 'coderbot', 41_200_000, ['optimization'], ['fabric', 'neoforge']),
  h('create', 'Create', 'Building tools and aesthetic technology with rotational force and contraptions.', 'simibubi', 33_700_000, ['technology'], ['forge', 'fabric', 'neoforge']),
  h('jei', 'Just Enough Items', 'Item and recipe viewing mod: search, bookmarks and mod integration.', 'mezz', 402_000_000, ['utility'], ['forge', 'neoforge']),
  h('lithium', 'Lithium', 'A general-purpose optimization mod that improves server tick performance.', 'jellysquid3', 39_100_000, ['optimization'], ['fabric', 'neoforge']),
  h('modmenu', 'Mod Menu', 'Adds a mod list screen to Fabric, with config access and update indicators.', 'Prospector', 44_000_000, ['utility'], ['fabric', 'quilt'])
]

function h(slug: string, title: string, description: string, author: string, downloads: number, categories: string[], loaders: string[]): ProjectHit {
  return {
    platform: 'modrinth',
    id: slug,
    slug,
    title,
    description,
    author,
    downloads,
    follows: Math.round(downloads / 900),
    iconUrl: null,
    categories,
    loaders,
    gameVersions: ['1.21.4', '1.21.1', '1.20.1'],
    updated: new Date(Date.now() - 4 * day).toISOString(),
    clientSide: 'required',
    serverSide: 'optional'
  }
}

const mods: InstalledMod[] = [
  { filename: 'sodium-fabric-0.6.0.jar', enabled: true, name: 'Sodium', version: '0.6.0', authors: ['JellySquid'], description: 'Rendering engine replacement.', loaders: ['fabric'], size: 1_204_000, provider: { platform: 'modrinth', projectId: 'sodium', versionId: 'v1' } },
  { filename: 'iris-1.8.1.jar', enabled: true, name: 'Iris Shaders', version: '1.8.1', authors: ['coderbot'], description: 'Shader support.', loaders: ['fabric'], size: 3_900_000, provider: { platform: 'modrinth', projectId: 'iris', versionId: 'v1' } },
  { filename: 'lithium-0.13.1.jar', enabled: true, name: 'Lithium', version: '0.13.1', authors: ['JellySquid'], description: 'Tick optimizations.', loaders: ['fabric'], size: 480_000 },
  { filename: 'oldmod-1.2.jar.disabled', enabled: false, name: 'Legacy Helper', version: '1.2', authors: [], description: 'Disabled while debugging a crash.', loaders: ['fabric'], size: 96_000 }
]

const versions = [
  ...['25w37a', '25w36b'].map((id) => ({ id, type: 'snapshot' as const, url: '', releaseTime: '2026-09-10', sha1: '' })),
  ...['1.21.4', '1.21.1', '1.20.6', '1.20.1', '1.19.2', '1.18.2', '1.16.5', '1.12.2', '1.8.9'].map((id) => ({
    id,
    type: 'release' as const,
    url: '',
    releaseTime: '2026-01-01',
    sha1: ''
  }))
]

const newsPosts: NewsPost[] = [
  {
    id: 'local:welcome',
    title: 'Prismatic 0.2 is out',
    summary: 'Custom themes, four layouts and this news tab.',
    body:
      'The **big one**: custom themes, four layouts and a news tab.\n\n' +
      '## What changed\n\n' +
      '- Pick a theme in Settings, or build your own\n' +
      '- Four layouts, including a `Sidebar` mode\n' +
      '- Drop your own instance icons in\n' +
      '- Write posts like this one\n\n' +
      '> Everything is a Markdown file in the news folder.\n\n' +
      '[Read the changelog](https://example.com/changelog)',
    date: new Date().toISOString().slice(0, 10),
    tag: 'Release',
    image: null,
    link: null,
    pinned: true,
    source: 'local',
    sourceName: 'You',
    file: 'welcome.md'
  },
  {
    id: 'mojang:snap',
    title: 'Minecraft 26.4 Snapshot 1',
    summary: 'A new snapshot is out, with changes to world generation and mob behaviour.',
    body: '',
    date: '2026-09-22',
    tag: 'Snapshot',
    image: null,
    link: 'https://www.minecraft.net/article/minecraft-snapshot-26-4-snapshot-1',
    pinned: false,
    source: 'mojang',
    sourceName: 'Minecraft'
  }
]

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export async function mockCall<T>(channel: string, args: unknown[]): Promise<T> {
  await sleep(90)
  /**
   * Always hand back a fresh array, the way the real handlers do — they build
   * one per call (`listInstances()` maps over the folder, `listAccounts()` maps
   * through `publicView`). Returning the same reference would make zustand's
   * identity check see no change and skip the re-render, so the preview would
   * silently disagree with the real app about when the UI updates.
   */
  const out = (value: unknown): T => (Array.isArray(value) ? ([...value] as T) : (value as T))

  switch (channel) {
    case 'settings:get':
      return out(settings)
    case 'settings:save':
      Object.assign(settings, deepMerge(settings, args[0]))
      return out(settings)
    case 'theme:get':
      return out({ dark: window.matchMedia('(prefers-color-scheme: dark)').matches })

    case 'instances:list':
      return out(instances)
    case 'instances:get':
      return out(instances.find((i) => i.id === args[0]) ?? null)
    case 'instances:groups':
      return out([...new Set(instances.map((i) => i.group).filter(Boolean))])
    case 'instances:size':
      return out(1_400_000_000)
    case 'instances:update': {
      const inst = instances.find((i) => i.id === args[0])
      if (inst) Object.assign(inst, args[1])
      return out(inst)
    }
    case 'instances:create': {
      const opts = args[0] as { name: string; mcVersion: string; loader: Instance['loader']; loaderVersion: string | null }
      const created = mk(
        opts.name.toLowerCase().replace(/\s+/g, '-'),
        opts.name,
        null,
        opts.mcVersion,
        opts.loader,
        opts.loaderVersion,
        0,
        0,
        'grass'
      )
      instances.unshift(created)
      // Mirror the real handler's shape, including the skipped list, so the
      // preview exercises the same code path the app takes.
      const wantsDefaults = (args[1] as boolean | undefined) ?? settings.newInstance.installDefaults
      const seeding = wantsDefaults && opts.loader !== 'vanilla'
      return out({
        instance: created,
        installed: seeding ? settings.newInstance.modrinthSlugs : [],
        skipped: []
      })
    }
    case 'instances:delete':
      return out(instances.filter((i) => i.id !== args[0]))

    case 'versions:list':
      return out(versions)
    case 'versions:latest':
      return out({ release: '1.21.4', snapshot: '25w37a' })
    case 'loaders:versions':
      return out(
        ['0.16.9', '0.16.8', '0.16.7', '0.15.11'].map((v, i) => ({ version: v, stable: true, recommended: i === 0 }))
      )
    case 'loaders:gameVersions':
      return out(versions.map((v) => v.id))

    case 'accounts:list':
      return out(accounts)
    case 'accounts:setActive':
      for (const a of accounts) a.active = a.id === args[0]
      return out(accounts)
    case 'accounts:remove': {
      // Mutate in place, the way the real backend rewrites accounts.json —
      // otherwise removals look like no-ops in the browser preview.
      const idx = accounts.findIndex((a) => a.id === args[0])
      if (idx >= 0) accounts.splice(idx, 1)
      if (accounts.length && !accounts.some((a) => a.active)) accounts[0].active = true
      return out(accounts)
    }
    case 'accounts:addOffline': {
      const created: Account = {
        id: crypto.randomUUID(),
        type: 'offline',
        username: String(args[0]),
        uuid: crypto.randomUUID(),
        active: accounts.length === 0
      }
      accounts.push(created)
      return out(created)
    }
    case 'accounts:msaStart':
      return out({
        userCode: 'KJQP-7T2X',
        verificationUri: 'https://microsoft.com/link',
        expiresIn: 900,
        message: 'Sign in at microsoft.com/link and enter the code.'
      })

    case 'java:detect':
      return out([
        { path: 'C:\\Program Files\\Eclipse Adoptium\\jdk-21\\bin\\java.exe', version: '21.0.5', major: 21, vendor: 'Eclipse Adoptium', arch: 'x86_64', managed: false },
        { path: 'C:\\Program Files\\Java\\jre1.8.0_421\\bin\\java.exe', version: '1.8.0_421', major: 8, vendor: 'Oracle', arch: 'x86_64', managed: false }
      ])

    case 'content:search':
      return out({ hits, total: hits.length })
    case 'content:versions':
      return out([
        { id: 'v1', name: 'Sodium 0.6.0', versionNumber: '0.6.0', channel: 'release', gameVersions: ['1.21.4'], loaders: ['fabric'], datePublished: new Date().toISOString(), downloads: 900_000, files: [{ url: '', filename: 'sodium-0.6.0.jar', size: 1_204_000, primary: true }], dependencies: [] }
      ])
    case 'mods:list':
      return out(mods)
    case 'mods:toggle': {
      const mod = mods.find((m) => m.filename === args[1])
      if (mod) mod.enabled = !mod.enabled
      return out(mods)
    }
    case 'mods:delete':
      return out(mods.filter((m) => m.filename !== args[1]))
    case 'mods:checkUpdates':
      return out({})

    case 'tasks:list':
      return out(tasks)
    case 'tasks:clear':
      tasks = tasks.filter((t) => t.status === 'running')
      return out(tasks)
    case 'tasks:cancel':
      tasks = tasks.map((t) => (t.id === args[0] ? { ...t, status: 'cancelled' as const } : t))
      return out(true)

    case 'game:running':
      return out([{ instanceId: 'fabulously-optimized', pid: 12345, startedAt: Date.now() - 600_000, exitCode: null }])
    case 'game:launch':
      return out({ instanceId: String(args[0]), pid: 999, startedAt: Date.now(), exitCode: null })

    case 'worlds:list':
      return out([
        { folder: 'New World', name: 'New World', gameVersion: '1.21.4', lastPlayed: Date.now() - day, sizeBytes: 240_000_000, hardcore: false, gameMode: 0 },
        { folder: 'Hardcore Run', name: 'Hardcore Run', gameVersion: '1.21.4', lastPlayed: Date.now() - 9 * day, sizeBytes: 84_000_000, hardcore: true, gameMode: 0 }
      ])
    case 'screenshots:list':
      return out([])
    case 'servers:list':
      return out([{ name: 'Hypixel', ip: 'mc.hypixel.net', icon: null }])
    case 'packfiles:list':
      return out([{ name: 'Faithful 32x.zip', sizeBytes: 12_000_000, enabled: true }])
    case 'logs:read':
      return out(
        [
          '[12:04:01] [main/INFO]: Loading Minecraft 1.21.4 with Fabric Loader 0.16.9',
          '[12:04:02] [main/INFO]: Loading 48 mods',
          '[12:04:05] [Render thread/INFO]: Setting user: Jannes',
          '[12:04:07] [Render thread/WARN]: Missing sound for event: minecraft:entity.villager.ambient',
          '[12:04:12] [Render thread/INFO]: OpenAL initialized on default',
          '[12:04:13] [Render thread/INFO]: Sound engine started',
          '[12:04:18] [Render thread/INFO]: Created: 1024x512x4 minecraft:textures/atlas/blocks.png'
        ].join('\n')
      )
    case 'logs:list':
      return out(['latest.log', '2026-09-21-1.log.gz'])
    case 'logs:crashReports':
      return out([])

    case 'updates:check':
      // Reports up to date, so the preview does not show a banner for a
      // release that does not exist.
      return out({
        currentVersion: '0.2.0',
        latestVersion: '0.2.0',
        updateAvailable: false,
        notes: '',
        url: 'https://github.com/',
        downloadUrl: null,
        publishedAt: null,
        checkedAt: Date.now()
      })
    case 'updates:download':
      return out(true)

    case 'news:list':
      return out({ posts: newsPosts, errors: [] })
    case 'news:save': {
      const draft = args[0] as { title: string; body: string; date?: string; tag?: string; pinned?: boolean; file?: string }
      const existing = draft.file ? newsPosts.find((p) => p.file === draft.file) : null
      if (existing) {
        Object.assign(existing, { title: draft.title, body: draft.body, tag: draft.tag ?? '', pinned: !!draft.pinned })
      } else {
        newsPosts.unshift({
          id: `local:${Date.now()}`,
          title: draft.title,
          summary: draft.body.split('\n')[0].slice(0, 160),
          body: draft.body,
          date: draft.date ?? new Date().toISOString().slice(0, 10),
          tag: draft.tag ?? '',
          image: null,
          link: null,
          pinned: !!draft.pinned,
          source: 'local',
          sourceName: 'You',
          file: `${Date.now()}.md`
        })
      }
      return out({ posts: newsPosts, errors: [] })
    }
    case 'news:delete': {
      const idx = newsPosts.findIndex((p) => p.file === args[0])
      if (idx >= 0) newsPosts.splice(idx, 1)
      return out({ posts: newsPosts, errors: [] })
    }
    case 'news:reveal':
    case 'news:dir':
      return out('C:\\Users\\you\\AppData\\Roaming\\Prismatic\\news')

    // Icons and Bedrock have no browser equivalent, but they must still answer
    // in the right shape — a bare null here white-screened the app once.
    case 'icons:list':
      return out([])
    case 'icons:resolve':
      return out(null)
    case 'icons:import':
    case 'icons:importPath':
      return out(null)
    case 'icons:delete':
      return out([])

    case 'bedrock:supported':
      return out(false)
    case 'bedrock:detect':
      return out([])
    case 'bedrock:launch':
      throw new Error('Bedrock can only be launched from the desktop app on Windows.')
    case 'bedrock:store':
      return out(true)

    case 'mods:addFiles':
      return out(mods)

    case 'app:info':
      return out({
        version: '0.1.0',
        electron: 'browser preview',
        node: '—',
        chrome: navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1] ?? '—',
        platform: 'browser',
        dataDir: settings.general.instancesDir
      })

    case 'window:setMaterial':
    case 'window:minimize':
    case 'window:maximize':
    case 'window:close':
    case 'shell:openExternal':
    case 'clipboard:write':
      return out(true)
    case 'window:isMaximized':
      return out(false)
    case 'dialog:confirm':
      return out(window.confirm(String(args[1])))

    default:
      return out(null)
  }
}

function deepMerge(base: unknown, patch: unknown): unknown {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return patch
  if (base === null || typeof base !== 'object') return patch
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    out[k] = k in out ? deepMerge(out[k], v) : v
  }
  return out
}
