import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { promisify } from 'node:util'
import AdmZip from 'adm-zip'
import { paths, libraryPath, mavenPath, safeJoin } from './paths'
import { downloadOne, fetchJsonCached, fetchText } from './net'
import { writeLocalVersion, readLocalVersion, type VersionJson, type Library } from './mojang'
import type { LoaderId, LoaderVersion } from '../../shared/types'

const run = promisify(execFile)

const FABRIC_META = 'https://meta.fabricmc.net/v2'
const QUILT_META = 'https://meta.quiltmc.org/v3'
const FORGE_MAVEN = 'https://maven.minecraftforge.net'
const NEOFORGE_MAVEN = 'https://maven.neoforged.net/releases'

// --- Version listings -------------------------------------------------------

export async function listLoaderVersions(loader: LoaderId, mcVersion: string): Promise<LoaderVersion[]> {
  switch (loader) {
    case 'vanilla':
      return []

    case 'fabric': {
      const list = await fetchJsonCached<{ loader: { version: string; stable: boolean } }[]>(
        `${FABRIC_META}/versions/loader/${encodeURIComponent(mcVersion)}`
      )
      return list.map((e, i) => ({ version: e.loader.version, stable: e.loader.stable, recommended: i === 0 }))
    }

    case 'quilt': {
      const list = await fetchJsonCached<{ loader: { version: string } }[]>(
        `${QUILT_META}/versions/loader/${encodeURIComponent(mcVersion)}`
      )
      return list.map((e, i) => ({
        version: e.loader.version,
        stable: !e.loader.version.includes('beta'),
        recommended: i === 0
      }))
    }

    case 'forge': {
      const xml = await fetchText(`${FORGE_MAVEN}/net/minecraftforge/forge/maven-metadata.xml`)
      const all = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1])
      // Forge versions look like "1.20.1-47.2.0" or "1.12.2-14.23.5.2859-1.12.2".
      const mine = all.filter((v) => v.startsWith(`${mcVersion}-`)).reverse()
      return mine.map((v, i) => ({
        version: v.slice(mcVersion.length + 1),
        stable: true,
        mcVersion,
        recommended: i === 0
      }))
    }

    case 'neoforge': {
      const xml = await fetchText(`${NEOFORGE_MAVEN}/net/neoforged/neoforge/maven-metadata.xml`)
      const all = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1])
      // NeoForge drops the "1." prefix: MC 1.20.6 -> 20.6.x
      const parts = mcVersion.split('.')
      const prefix = `${parts[1]}.${parts[2] ?? '0'}.`
      const mine = all.filter((v) => v.startsWith(prefix)).reverse()
      return mine.map((v, i) => ({
        version: v,
        stable: !v.endsWith('-beta'),
        mcVersion,
        recommended: i === 0
      }))
    }

    default:
      return []
  }
}

/** Which Minecraft versions a loader supports, for the version picker. */
export async function loaderGameVersions(loader: LoaderId): Promise<string[]> {
  if (loader === 'fabric') {
    const list = await fetchJsonCached<{ version: string; stable: boolean }[]>(`${FABRIC_META}/versions/game`)
    return list.map((v) => v.version)
  }
  if (loader === 'quilt') {
    const list = await fetchJsonCached<{ version: string }[]>(`${QUILT_META}/versions/game`)
    return list.map((v) => v.version)
  }
  return []
}

// --- Installation -----------------------------------------------------------

export interface LoaderInstallResult {
  /** The version id to launch, e.g. "fabric-loader-0.16.9-1.21.4". */
  versionId: string
}

/** Fabric and Quilt both publish a ready-made version json — nothing to run. */
async function installMetaProfile(
  base: string,
  mcVersion: string,
  loaderVersion: string
): Promise<LoaderInstallResult> {
  const url = `${base}/versions/loader/${encodeURIComponent(mcVersion)}/${encodeURIComponent(loaderVersion)}/profile/json`
  const profile = await fetchJsonCached<VersionJson>(url, 24 * 60 * 60 * 1000)
  writeLocalVersion(profile)
  return { versionId: profile.id }
}

export interface InstallProgress {
  (message: string, fraction: number | null): void
}

export async function installLoader(
  loader: LoaderId,
  mcVersion: string,
  loaderVersion: string,
  javaBinary: string,
  onProgress: InstallProgress = () => {}
): Promise<LoaderInstallResult> {
  switch (loader) {
    case 'vanilla':
      return { versionId: mcVersion }

    case 'fabric':
      onProgress('Fetching Fabric profile', null)
      return installMetaProfile(FABRIC_META, mcVersion, loaderVersion)

    case 'quilt':
      onProgress('Fetching Quilt profile', null)
      return installMetaProfile(QUILT_META, mcVersion, loaderVersion)

    case 'forge':
      return installForgeLike(
        `${FORGE_MAVEN}/net/minecraftforge/forge/${mcVersion}-${loaderVersion}/forge-${mcVersion}-${loaderVersion}-installer.jar`,
        mcVersion,
        javaBinary,
        onProgress
      )

    case 'neoforge':
      return installForgeLike(
        `${NEOFORGE_MAVEN}/net/neoforged/neoforge/${loaderVersion}/neoforge-${loaderVersion}-installer.jar`,
        mcVersion,
        javaBinary,
        onProgress
      )

    default:
      throw new Error(`Loader ${loader} is not supported yet`)
  }
}

// --- Forge / NeoForge installer pipeline ------------------------------------

interface InstallProfile {
  version?: string
  json?: string
  path?: string
  minecraft?: string
  libraries?: Library[]
  processors?: {
    sides?: string[]
    jar: string
    classpath: string[]
    args: string[]
    outputs?: Record<string, string>
  }[]
  data?: Record<string, { client: string; server: string }>
}

/**
 * Modern Forge (1.13+) and NeoForge ship an installer jar rather than a plain
 * version json. We unpack it, install its libraries, then run its "processors"
 * (binary patcher, jar signer stripper, etc.) exactly like the official installer.
 */
async function installForgeLike(
  installerUrl: string,
  mcVersion: string,
  javaBinary: string,
  onProgress: InstallProgress
): Promise<LoaderInstallResult> {
  onProgress('Downloading installer', null)
  const installerJar = join(paths.cache, installerUrl.split('/').pop()!)
  await downloadOne({ url: installerUrl, dest: installerJar })

  const zip = new AdmZip(installerJar)
  const readEntry = (name: string): string | null => {
    const entry = zip.getEntry(name)
    return entry ? entry.getData().toString('utf8') : null
  }

  const profileRaw = readEntry('install_profile.json')
  if (!profileRaw) throw new Error('Installer jar has no install_profile.json — unsupported Forge version')
  const profile = JSON.parse(profileRaw) as InstallProfile

  // Legacy (<=1.12.2) installers embed the launch version json inline.
  let versionJson: VersionJson
  const inlineVersion = (profile as unknown as { versionInfo?: VersionJson }).versionInfo
  if (inlineVersion) {
    versionJson = inlineVersion
  } else {
    const versionPath = profile.json?.replace(/^\//, '') ?? 'version.json'
    const versionRaw = readEntry(versionPath)
    if (!versionRaw) throw new Error(`Installer jar has no ${versionPath}`)
    versionJson = JSON.parse(versionRaw) as VersionJson
  }

  // 1. The universal/client jar the installer carries in maven/ goes to our library store.
  onProgress('Extracting bundled libraries', null)
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue
    if (!entry.entryName.startsWith('maven/')) continue
    const dest = safeJoin(paths.libraries, entry.entryName.slice('maven/'.length))
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, entry.getData())
  }
  // Some installers put the loader jar at data/client.lzma + a `path` coordinate.
  const clientLzma = zip.getEntry('data/client.lzma')
  let clientLzmaPath: string | null = null
  if (clientLzma) {
    clientLzmaPath = join(paths.cache, 'forge-client.lzma')
    writeFileSync(clientLzmaPath, clientLzma.getData())
  }

  // 2. Download installer libraries (these are the processor dependencies).
  const allLibs = [...(profile.libraries ?? []), ...(versionJson.libraries ?? [])]
  let libDone = 0
  for (const lib of allLibs) {
    const art = lib.downloads?.artifact
    const dest = art?.path ? join(paths.libraries, art.path) : libraryPath(lib.name)
    const url = art?.url || (lib.url ?? 'https://libraries.minecraft.net/').replace(/\/?$/, '/') + mavenPath(lib.name).replace(/\\/g, '/')
    if (url && !existsSync(dest)) {
      try {
        await downloadOne({ url, dest, sha1: art?.sha1, size: art?.size })
      } catch (err) {
        // Some Forge profiles list libraries with empty URLs that come from the jar itself.
        if (!existsSync(dest)) throw err
      }
    }
    libDone++
    onProgress(`Installing loader libraries (${libDone}/${allLibs.length})`, libDone / allLibs.length)
  }

  // 3. Run the processors.
  if (profile.processors?.length) {
    const vanillaJar = join(paths.versions, mcVersion, `${mcVersion}.jar`)
    const data = resolveProcessorData(profile.data ?? {}, clientLzmaPath, vanillaJar, mcVersion)

    const applicable = profile.processors.filter((p) => !p.sides || p.sides.includes('client'))
    for (let i = 0; i < applicable.length; i++) {
      const proc = applicable[i]
      onProgress(`Patching Minecraft (step ${i + 1}/${applicable.length})`, i / applicable.length)

      const jar = libraryPath(proc.jar)
      const mainClass = readMainClass(jar)
      const cp = [jar, ...proc.classpath.map((c) => libraryPath(c))].join(
        process.platform === 'win32' ? ';' : ':'
      )
      const args = proc.args.map((a) => substituteToken(a, data))

      try {
        await run(javaBinary, ['-cp', cp, mainClass, ...args], {
          maxBuffer: 32 * 1024 * 1024,
          windowsHide: true
        })
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err)
        throw new Error(`Forge processor ${proc.jar} failed: ${detail.slice(0, 600)}`)
      }
    }
  }

  // 4. Persist the launch version json.
  if (!versionJson.inheritsFrom) versionJson.inheritsFrom = mcVersion
  writeLocalVersion(versionJson)
  rmSync(installerJar, { force: true })
  onProgress('Loader installed', 1)
  return { versionId: versionJson.id }
}

/** Expand `{TOKEN}` placeholders and `[maven:coord]` references in processor args. */
function substituteToken(arg: string, data: Record<string, string>): string {
  let out = arg
  const bracket = /^\[(.+)\]$/.exec(out)
  if (bracket) return libraryPath(bracket[1])
  out = out.replace(/\{([A-Z_]+)\}/g, (_, key: string) => data[key] ?? `{${key}}`)
  return out
}

function resolveProcessorData(
  raw: Record<string, { client: string; server: string }>,
  clientLzmaPath: string | null,
  vanillaJar: string,
  mcVersion: string
): Record<string, string> {
  const data: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw)) {
    const v = value.client
    if (!v) continue
    if (v.startsWith('[') && v.endsWith(']')) {
      data[key] = libraryPath(v.slice(1, -1))
    } else if (v.startsWith('/')) {
      // A path inside the installer jar; we already extracted client.lzma.
      data[key] = v === '/data/client.lzma' && clientLzmaPath ? clientLzmaPath : join(paths.cache, v.slice(1))
    } else {
      data[key] = v
    }
  }
  data.SIDE = 'client'
  data.MINECRAFT_JAR = vanillaJar
  data.MINECRAFT_VERSION = mcVersion
  data.ROOT = paths.root
  data.INSTALLER = join(paths.cache, 'installer.jar')
  data.LIBRARY_DIR = paths.libraries
  return data
}

function readMainClass(jar: string): string {
  const manifest = new AdmZip(jar).getEntry('META-INF/MANIFEST.MF')
  if (!manifest) throw new Error(`No manifest in ${jar}`)
  const text = manifest.getData().toString('utf8').replace(/\r\n[ \t]/g, '')
  const match = /Main-Class:\s*(\S+)/.exec(text)
  if (!match) throw new Error(`No Main-Class in ${jar}`)
  return match[1]
}

/** Best-effort check that a loader version is already installed locally. */
export function loaderInstalled(versionId: string): boolean {
  return readLocalVersion(versionId) !== null
}

/** Compose the launch version id for a given loader selection. */
export function expectedVersionId(loader: LoaderId, mcVersion: string, loaderVersion: string | null): string {
  if (loader === 'vanilla' || !loaderVersion) return mcVersion
  if (loader === 'fabric') return `fabric-loader-${loaderVersion}-${mcVersion}`
  if (loader === 'quilt') return `quilt-loader-${loaderVersion}-${mcVersion}`
  if (loader === 'forge') return `${mcVersion}-forge-${loaderVersion}`
  if (loader === 'neoforge') return `neoforge-${loaderVersion}`
  return mcVersion
}
