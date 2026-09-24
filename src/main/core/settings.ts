import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { totalmem } from 'node:os'
import { paths } from './paths'
import type { Settings } from '../../shared/types'

function defaultMaxMemory(): number {
  const gb = totalmem() / 1024 ** 3
  if (gb >= 32) return 8192
  if (gb >= 16) return 6144
  if (gb >= 8) return 4096
  return 2048
}

export const DEFAULT_TABS = ['instances', 'news', 'discover', 'accounts', 'tasks', 'settings']

/**
 * Prismatic's Azure application (client) ID, approved by Mojang for the Java
 * game service API.
 *
 * This is a public identifier, not a secret. The OAuth device code flow is
 * designed for clients that cannot keep one — there is no client secret here,
 * and possession of this ID grants nothing on its own; every sign-in still
 * requires the user to authenticate on Microsoft's own page. Every third-party
 * launcher ships its ID the same way.
 *
 * It stays overridable in Settings so a fork can use its own registration.
 */
export const MSA_CLIENT_ID = '0b773059-9daf-4870-84d0-f6369a942fd8'

export function defaultSettings(): Settings {
  return {
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
      memory: { min: 512, max: defaultMaxMemory() },
      jvmArgs:
        '-XX:+UnlockExperimentalVMOptions -XX:+UseG1GC -XX:G1NewSizePercent=20 ' +
        '-XX:G1ReservePercent=20 -XX:MaxGCPauseMillis=50 -XX:G1HeapRegionSize=32M',
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
      // Fabric API is a dependency of most Fabric mods, including Prismatic
      // HUD, so it is the one sensible default to ship with.
      modrinthSlugs: ['fabric-api'],
      localJars: [],
      applyToPacks: true,
      skipIncompatible: true
    },
    commands: { pre: '', wrapper: '', post: '' },
    env: {},
    integrations: { curseforgeApiKey: '', msaClientId: MSA_CLIENT_ID, discordRichPresence: false },
    general: {
      instancesDir: paths.instances,
      sortBy: 'lastPlayed',
      groupCollapsed: [],
      updateChannel: 'stable',
      language: 'en',
      tabs: DEFAULT_TABS
    }
  }
}

/** Deep merge stored settings over defaults so new keys appear on upgrade. */
function merge<T>(base: T, patch: unknown): T {
  if (patch === null || patch === undefined) return base
  if (Array.isArray(base) || typeof base !== 'object') return patch as T
  if (typeof patch !== 'object') return base
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    out[k] = k in out ? merge((base as Record<string, unknown>)[k], v) : v
  }
  return out as T
}

let cached: Settings | null = null

export function getSettings(): Settings {
  if (cached) return cached
  let stored: unknown = {}
  if (existsSync(paths.settings)) {
    try {
      stored = JSON.parse(readFileSync(paths.settings, 'utf8'))
    } catch {
      // Corrupt config should never block startup — fall back to defaults.
      stored = {}
    }
  }
  cached = merge(defaultSettings(), stored)
  return cached
}

export function saveSettings(patch: unknown): Settings {
  cached = merge(getSettings(), patch)
  writeFileSync(paths.settings, JSON.stringify(cached, null, 2), 'utf8')
  return cached
}

export function resetSettings(): Settings {
  cached = defaultSettings()
  writeFileSync(paths.settings, JSON.stringify(cached, null, 2), 'utf8')
  return cached
}
