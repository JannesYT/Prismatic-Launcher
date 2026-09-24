/** Types shared between the Electron main process and the renderer. */

export type LoaderId = 'vanilla' | 'fabric' | 'quilt' | 'forge' | 'neoforge' | 'liteloader'

export interface InstanceComponent {
  uid: string // e.g. net.minecraft, net.fabricmc.fabric-loader
  version: string
  important?: boolean
}

export interface Instance {
  id: string // folder name, stable
  name: string
  group: string | null
  icon: string // built-in icon key, or "file:<relative path>"
  mcVersion: string
  loader: LoaderId
  loaderVersion: string | null
  components: InstanceComponent[]
  notes: string
  created: number
  lastPlayed: number | null
  totalPlaySeconds: number
  /** null = inherit the global default */
  overrides: InstanceOverrides
  favourite: boolean
  /** Pack provenance, when created from a modpack. */
  pack?: { platform: 'modrinth' | 'curseforge' | 'ftb' | 'technic'; id: string; versionId: string; name: string }
}

export interface InstanceOverrides {
  memory: { min: number; max: number } | null
  javaPath: string | null
  jvmArgs: string | null
  window: { width: number; height: number; maximized: boolean; fullscreen: boolean } | null
  /** Pre-launch, wrapper and post-exit commands. */
  commands: { pre: string; wrapper: string; post: string } | null
  env: Record<string, string> | null
  /** Join a server or world straight after launch (Minecraft 1.20+ quickPlay). */
  quickPlay: { type: 'singleplayer' | 'multiplayer' | 'realms'; target: string } | null
  showLogAfterLaunch: boolean | null
  closeLauncherOnLaunch: boolean | null
}

export type GlassStyle = 'liquid' | 'tinted' | 'solid'

/**
 * Where navigation lives and how dense the interface is.
 *
 * Each preset mimics the shape of a launcher people already know, so the
 * layout can be matched to habit rather than to whatever this app happened to
 * ship with.
 */
export type LayoutMode =
  | 'bottomTabs' // Prismatic's own: floating glass bar, bottom centre
  | 'sidebar' // Minecraft Launcher: fixed left rail, content to the right
  | 'topTabs' // Classic desktop app: tabs under the title bar
  | 'compact' // Icon-only rail, for small windows

export interface ThemeColors {
  /** Base page colour behind everything. */
  bg: string
  /** Three tint fields that give the glass something worth refracting. */
  tintA: string
  tintB: string
  tintC: string
  ink: string
  ink2: string
  ink3: string
  line: string
  accent: string
  /** Forces the light or dark token set; 'auto' follows the OS. */
  scheme: 'auto' | 'light' | 'dark'
}

export interface ThemePreset {
  id: string
  name: string
  description: string
  colors: ThemeColors
  /** Built-in presets cannot be deleted. */
  builtIn: boolean
}

export interface Settings {
  // --- Appearance ---------------------------------------------------------
  appearance: {
    /** 'liquid' = full Liquid Glass. 'tinted' = flat tint, identical animations. 'solid' = opaque. */
    glassStyle: GlassStyle
    /** Regular (more opaque, content-legible) vs Clear (highly transparent). Apple's two variants. */
    glassVariant: 'regular' | 'clear'
    theme: 'system' | 'light' | 'dark'
    accent: string
    /** 0–100, how strongly glass surfaces refract the content behind them. */
    lensing: number
    /** 0–100, blur radius multiplier. */
    blur: number
    /** 0–100, specular highlight intensity on glass edges. */
    specular: number
    /** Global animation speed multiplier, 0.5–2. */
    motionScale: number
    reduceTransparency: boolean
    reduceMotion: boolean
    increaseContrast: boolean
    /** Bottom tab bar shrinks to a pill when scrolling down. */
    tabBarMinimize: 'never' | 'onScrollDown'
    tabBarLabels: 'always' | 'selected' | 'never'
    cornerRadius: number
    fontScale: number
    /** Native window material on Win11 / macOS: makes glass lens the desktop. */
    nativeWindowBlur: boolean

    // --- Layout ------------------------------------------------------------
    layout: LayoutMode
    density: 'comfortable' | 'compact'
    /** How instances are listed. */
    instanceView: 'grid' | 'list'
    /** Grid card width in pixels. */
    cardSize: number
    /** Sidebar/top-rail width when the layout uses one. */
    railWidth: number

    // --- Theme -------------------------------------------------------------
    /** Id of the active preset, or 'custom' when colours are hand-edited. */
    themePreset: string
    /** Populated only while themePreset is 'custom'. */
    customTheme: ThemeColors | null
    /** User-made presets, saved from the current colours. */
    userPresets: ThemePreset[]
    /** Absolute path to a wallpaper drawn behind the glass. */
    backgroundImage: string | null
    backgroundOpacity: number
    backgroundBlur: number
  }
  updates: {
    /** Where to look for a newer version. */
    source: 'github' | 'url' | 'none'
    /** owner/repo, when source is 'github'. */
    githubRepo: string
    /** A JSON file with a "version" field, when source is 'url'. */
    feedUrl: string
    checkOnStartup: boolean
    includePrereleases: boolean
    /** Set after a check so the banner can be dismissed per version. */
    dismissedVersion: string
  }
  news: {
    /** Include Mojang's official Java patch notes. */
    showMojang: boolean
    /** Extra JSON feeds, using the same shape as a local post. */
    feeds: import('./news').NewsFeed[]
    /** Show the composer, for people who publish rather than only read. */
    authorMode: boolean
  }
  /** Minecraft: Bedrock Edition, which the launcher can start but not manage. */
  bedrock: {
    /** Show the Bedrock tile in the instance list. */
    show: boolean
    /** Launch the Preview build rather than the retail one when both exist. */
    preferPreview: boolean
    totalPlaySeconds: number
    lastPlayed: number | null
  }
  // --- Java --------------------------------------------------------------
  java: {
    path: string | null
    memory: { min: number; max: number }
    jvmArgs: string
    autoDetect: boolean
    /** Download a matching JRE per instance from Adoptium when needed. */
    autoDownload: boolean
    skipCompatChecks: boolean
  }
  // --- Minecraft ---------------------------------------------------------
  minecraft: {
    window: { width: number; height: number; maximized: boolean; fullscreen: boolean }
    closeLauncherOnLaunch: boolean
    quitLauncherOnGameExit: boolean
    showLogAfterLaunch: boolean
    useNativeGLFW: boolean
    useNativeOpenAL: boolean
  }
  // --- Downloads ---------------------------------------------------------
  downloads: {
    concurrency: number
    /** BMCLAPI etc. for users behind slow routes to Mojang. */
    mirror: 'official' | 'bmclapi'
    verifyHashes: boolean
  }
  // --- What every new instance starts with -------------------------------
  newInstance: {
    /** Apply the defaults below when creating an instance. */
    installDefaults: boolean
    /** Modrinth project slugs installed into every new modded instance. */
    modrinthSlugs: string[]
    /** Local jars copied into the mods folder, e.g. a mod you build yourself. */
    localJars: string[]
    /**
     * Also add them to imported and downloaded modpacks. Off would mean packs
     * stay exactly as their author shipped them.
     */
    applyToPacks: boolean
    /** Skip a mod rather than failing the whole creation if it has no build. */
    skipIncompatible: boolean
  }
  // --- Custom commands ---------------------------------------------------
  commands: { pre: string; wrapper: string; post: string }
  env: Record<string, string>
  // --- Integrations -------------------------------------------------------
  integrations: {
    curseforgeApiKey: string
    msaClientId: string
    discordRichPresence: boolean
  }
  // --- Misc ---------------------------------------------------------------
  general: {
    instancesDir: string
    sortBy: 'name' | 'lastPlayed' | 'created' | 'playtime'
    groupCollapsed: string[]
    updateChannel: 'stable' | 'beta'
    language: string
    /** Which tabs appear in the bottom bar, in order. */
    tabs: string[]
  }
}

// --- Version / loader metadata ---------------------------------------------

export interface McVersionSummary {
  id: string
  type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha'
  url: string
  releaseTime: string
  sha1: string
}

export interface LoaderVersion {
  version: string
  stable: boolean
  /** Forge/NeoForge only: the MC version this build targets. */
  mcVersion?: string
  recommended?: boolean
}

// --- Accounts ---------------------------------------------------------------

export type AccountType = 'msa' | 'offline'

export interface Account {
  id: string
  type: AccountType
  username: string
  uuid: string
  /** Only for msa accounts; refreshed transparently. */
  expiresAt?: number
  capes?: { id: string; name: string; url: string; active: boolean }[]
  skinUrl?: string
  active: boolean
}

export interface DeviceCodePrompt {
  userCode: string
  verificationUri: string
  expiresIn: number
  message: string
}

// --- Mods / content --------------------------------------------------------

export type ContentKind = 'mod' | 'resourcepack' | 'shader' | 'datapack' | 'modpack'

export interface ProjectHit {
  platform: 'modrinth' | 'curseforge'
  id: string
  slug: string
  title: string
  description: string
  author: string
  downloads: number
  follows: number
  iconUrl: string | null
  categories: string[]
  loaders: string[]
  gameVersions: string[]
  updated: string
  clientSide?: 'required' | 'optional' | 'unsupported'
  serverSide?: 'required' | 'optional' | 'unsupported'
}

export interface ProjectVersion {
  id: string
  name: string
  versionNumber: string
  channel: 'release' | 'beta' | 'alpha'
  gameVersions: string[]
  loaders: string[]
  datePublished: string
  downloads: number
  files: { url: string; filename: string; size: number; sha1?: string; primary: boolean }[]
  dependencies: { projectId: string | null; versionId: string | null; type: string }[]
}

/** A mod jar physically present in an instance's mods/ folder. */
export interface InstalledMod {
  filename: string
  enabled: boolean
  name: string
  version: string
  authors: string[]
  description: string
  loaders: string[]
  size: number
  /** Present when we know where it came from, enabling update checks. */
  provider?: { platform: 'modrinth' | 'curseforge'; projectId: string; versionId: string }
  updateAvailable?: ProjectVersion | null
}

// --- Tasks / progress ------------------------------------------------------

export interface Task {
  id: string
  label: string
  detail: string
  /** 0–1, or null for indeterminate. */
  progress: number | null
  status: 'running' | 'done' | 'failed' | 'cancelled'
  error?: string
  bytesDone?: number
  bytesTotal?: number
  startedAt: number
}

export interface LogLine {
  instanceId: string
  seq: number
  level: 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL' | 'LAUNCHER'
  thread: string
  text: string
  at: number
}

// --- Instance content ------------------------------------------------------

export interface WorldSave {
  folder: string
  name: string
  gameVersion: string
  lastPlayed: number
  sizeBytes: number
  hardcore: boolean
  gameMode: number
}

export interface ScreenshotEntry {
  file: string
  name: string
  takenAt: number
  sizeBytes: number
}

export interface ServerEntry {
  name: string
  ip: string
  icon: string | null
}
