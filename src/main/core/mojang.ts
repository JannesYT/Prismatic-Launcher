import { copyFileSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { arch, platform, release } from 'node:os'
import AdmZip from 'adm-zip'
import { paths, libraryPath, mavenPath } from './paths'
import { downloadAll, downloadOne, fetchJson, fetchJsonCached, type DownloadSpec, type Progress } from './net'
import type { McVersionSummary } from '../../shared/types'

const VERSION_MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'

// --- Mojang JSON shapes (the subset we consume) ----------------------------

export interface Rule {
  action: 'allow' | 'disallow'
  os?: { name?: string; version?: string; arch?: string }
  features?: Record<string, boolean>
}

export interface Artifact {
  path?: string
  sha1: string
  size: number
  url: string
}

export interface Library {
  name: string
  downloads?: { artifact?: Artifact; classifiers?: Record<string, Artifact> }
  url?: string // non-Mojang maven root (Fabric/Forge style)
  rules?: Rule[]
  natives?: Record<string, string>
  extract?: { exclude?: string[] }
  /** NeoForge/Forge marker: present on the client side only. */
  clientreq?: boolean
  serverreq?: boolean
}

export interface VersionJson {
  id: string
  inheritsFrom?: string
  type: string
  mainClass: string
  assets?: string
  minecraftArguments?: string
  arguments?: { game?: (string | { rules: Rule[]; value: string | string[] })[]; jvm?: (string | { rules: Rule[]; value: string | string[] })[] }
  libraries: Library[]
  assetIndex?: { id: string; sha1: string; size: number; totalSize: number; url: string }
  downloads?: Record<string, Artifact>
  javaVersion?: { component: string; majorVersion: number }
  logging?: { client?: { argument: string; file: Artifact & { id: string }; type: string } }
  complianceLevel?: number
  releaseTime?: string
}

// --- OS / rule evaluation ---------------------------------------------------

export function osName(): 'windows' | 'osx' | 'linux' {
  const p = platform()
  return p === 'win32' ? 'windows' : p === 'darwin' ? 'osx' : 'linux'
}

export function osArch(): string {
  const a = arch()
  if (a === 'x64') return 'x86_64'
  if (a === 'ia32') return 'x86'
  if (a === 'arm64') return 'arm64'
  return a
}

/** Mojang's `natives` classifier key, e.g. natives-windows / natives-osx-arm64. */
export function nativeClassifier(lib: Library): string | null {
  if (!lib.natives) return null
  const raw = lib.natives[osName()]
  if (!raw) return null
  return raw.replace('${arch}', arch() === 'ia32' ? '32' : '64')
}

export function ruleMatches(rules: Rule[] | undefined, features: Record<string, boolean> = {}): boolean {
  if (!rules || rules.length === 0) return true
  // Last matching rule wins, default deny when any rule exists.
  let allowed = false
  for (const rule of rules) {
    let ok = true
    if (rule.os) {
      if (rule.os.name && rule.os.name !== osName()) ok = false
      if (rule.os.arch && rule.os.arch !== (arch() === 'ia32' ? 'x86' : osArch()) && rule.os.arch !== arch()) ok = false
      if (rule.os.version && !new RegExp(rule.os.version).test(release())) ok = false
    }
    if (rule.features) {
      for (const [k, want] of Object.entries(rule.features)) {
        if ((features[k] ?? false) !== want) ok = false
      }
    }
    if (ok) allowed = rule.action === 'allow'
  }
  return allowed
}

// --- Version manifest ------------------------------------------------------

export async function listVersions(): Promise<McVersionSummary[]> {
  const manifest = await fetchJsonCached<{
    latest: { release: string; snapshot: string }
    versions: McVersionSummary[]
  }>(VERSION_MANIFEST, 60 * 60 * 1000)
  return manifest.versions
}

export async function latestVersions(): Promise<{ release: string; snapshot: string }> {
  const manifest = await fetchJsonCached<{ latest: { release: string; snapshot: string } }>(
    VERSION_MANIFEST,
    60 * 60 * 1000
  )
  return manifest.latest
}

function versionJsonPath(id: string): string {
  return join(paths.versions, id, `${id}.json`)
}

/** Fetch + cache a vanilla version json on disk (mirrors Mojang's own layout). */
export async function getVanillaVersion(id: string): Promise<VersionJson> {
  const file = versionJsonPath(id)
  if (existsSync(file)) {
    try {
      return JSON.parse(readFileSync(file, 'utf8')) as VersionJson
    } catch {
      /* refetch */
    }
  }
  const versions = await listVersions()
  const entry = versions.find((v) => v.id === id)
  if (!entry) throw new Error(`Unknown Minecraft version: ${id}`)
  const json = await fetchJson<VersionJson>(entry.url)
  mkdirSync(join(paths.versions, id), { recursive: true })
  writeFileSync(file, JSON.stringify(json, null, 2), 'utf8')
  return json
}

/** Read a locally stored version json (loader profiles live here too). */
export function readLocalVersion(id: string): VersionJson | null {
  const file = versionJsonPath(id)
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as VersionJson
  } catch {
    return null
  }
}

export function writeLocalVersion(json: VersionJson): void {
  mkdirSync(join(paths.versions, json.id), { recursive: true })
  writeFileSync(versionJsonPath(json.id), JSON.stringify(json, null, 2), 'utf8')
}

/**
 * Flatten an `inheritsFrom` chain into one effective version.
 * Loader profiles (Fabric/Forge/NeoForge) prepend their libraries and override mainClass.
 */
export async function resolveVersion(id: string): Promise<VersionJson> {
  const local = readLocalVersion(id)
  const self = local ?? (await getVanillaVersion(id))
  if (!self.inheritsFrom) return self

  const parent = await resolveVersion(self.inheritsFrom)
  return {
    ...parent,
    ...self,
    id: self.id,
    inheritsFrom: undefined,
    mainClass: self.mainClass || parent.mainClass,
    assets: self.assets ?? parent.assets,
    assetIndex: self.assetIndex ?? parent.assetIndex,
    downloads: { ...parent.downloads, ...self.downloads },
    javaVersion: self.javaVersion ?? parent.javaVersion,
    logging: self.logging ?? parent.logging,
    // Child libraries take precedence: same group:artifact replaces the parent's.
    libraries: dedupeLibraries([...(self.libraries ?? []), ...(parent.libraries ?? [])]),
    minecraftArguments: self.minecraftArguments ?? parent.minecraftArguments,
    arguments: {
      game: [...(parent.arguments?.game ?? []), ...(self.arguments?.game ?? [])],
      jvm: [...(parent.arguments?.jvm ?? []), ...(self.arguments?.jvm ?? [])]
    }
  }
}

/** Keep the first occurrence of each group:artifact[:classifier]. */
function dedupeLibraries(libs: Library[]): Library[] {
  const seen = new Set<string>()
  const out: Library[] = []
  for (const lib of libs) {
    const parts = lib.name.split(':')
    const key = `${parts[0]}:${parts[1]}${parts[3] ? ':' + parts[3] : ''}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(lib)
  }
  return out
}

// --- Download planning ------------------------------------------------------

function libraryUrl(lib: Library): string | null {
  const classifier = nativeClassifier(lib)
  if (classifier) {
    const art = lib.downloads?.classifiers?.[classifier]
    if (art) return art.url
    const base = lib.url ?? 'https://libraries.minecraft.net/'
    return base.replace(/\/?$/, '/') + mavenPath(`${lib.name}:${classifier}`).replace(/\\/g, '/')
  }
  if (lib.downloads?.artifact) return lib.downloads.artifact.url || null
  const base = lib.url ?? 'https://libraries.minecraft.net/'
  return base.replace(/\/?$/, '/') + mavenPath(lib.name).replace(/\\/g, '/')
}

export function libraryDest(lib: Library): string {
  const classifier = nativeClassifier(lib)
  if (classifier) {
    const art = lib.downloads?.classifiers?.[classifier]
    if (art?.path) return join(paths.libraries, art.path)
    return libraryPath(`${lib.name}:${classifier}`)
  }
  if (lib.downloads?.artifact?.path) return join(paths.libraries, lib.downloads.artifact.path)
  return libraryPath(lib.name)
}

export interface VersionPlan {
  version: VersionJson
  clientJar: string
  /** Non-native jars for the classpath, in order. */
  classpath: string[]
  /** Native jars that must be extracted next to the game. */
  nativeJars: { jar: string; exclude: string[] }[]
  downloads: DownloadSpec[]
  assetsRoot: string
  assetsIndexId: string
  /** Pre-1.7 versions need assets copied into resources/ instead. */
  legacyAssets: boolean
}

export async function planVersion(id: string, features: Record<string, boolean> = {}): Promise<VersionPlan> {
  const version = await resolveVersion(id)
  const downloads: DownloadSpec[] = []
  const classpath: string[] = []
  const nativeJars: { jar: string; exclude: string[] }[] = []

  // 1. client jar
  const clientJar = join(paths.versions, version.id, `${version.id}.jar`)
  const clientArt = version.downloads?.client
  if (clientArt) {
    downloads.push({ url: clientArt.url, dest: clientJar, sha1: clientArt.sha1, size: clientArt.size })
  }

  // 2. libraries
  for (const lib of version.libraries) {
    if (!ruleMatches(lib.rules, features)) continue
    if (lib.clientreq === false) continue
    const dest = libraryDest(lib)
    const url = libraryUrl(lib)
    const classifier = nativeClassifier(lib)
    const art = classifier ? lib.downloads?.classifiers?.[classifier] : lib.downloads?.artifact

    if (url) {
      downloads.push({ url, dest, sha1: art?.sha1, size: art?.size })
    }
    if (classifier) {
      nativeJars.push({ jar: dest, exclude: lib.extract?.exclude ?? ['META-INF/'] })
    } else {
      classpath.push(dest)
    }
  }

  // 3. asset index + objects
  const assetsIndexId = version.assets ?? version.assetIndex?.id ?? 'legacy'
  if (version.assetIndex) {
    const indexFile = join(paths.assetIndexes, `${version.assetIndex.id}.json`)
    downloads.push({
      url: version.assetIndex.url,
      dest: indexFile,
      sha1: version.assetIndex.sha1,
      size: version.assetIndex.size
    })
  }

  // 4. log4j config, which Mojang ships separately
  if (version.logging?.client) {
    downloads.push({
      url: version.logging.client.file.url,
      dest: join(paths.assets, 'log_configs', version.logging.client.file.id),
      sha1: version.logging.client.file.sha1,
      size: version.logging.client.file.size
    })
  }

  return {
    version,
    clientJar,
    classpath,
    nativeJars,
    downloads,
    assetsRoot: paths.assets,
    assetsIndexId,
    legacyAssets: assetsIndexId === 'legacy' || assetsIndexId === 'pre-1.6'
  }
}

interface AssetIndex {
  objects: Record<string, { hash: string; size: number }>
  map_to_resources?: boolean
  virtual?: boolean
}

export function readAssetIndex(indexId: string): AssetIndex | null {
  const file = join(paths.assetIndexes, `${indexId}.json`)
  if (!existsSync(file)) return null
  return JSON.parse(readFileSync(file, 'utf8')) as AssetIndex
}

export function planAssets(indexId: string): DownloadSpec[] {
  const index = readAssetIndex(indexId)
  if (!index) return []
  const specs: DownloadSpec[] = []
  for (const { hash, size } of Object.values(index.objects)) {
    const sub = hash.slice(0, 2)
    specs.push({
      url: `https://resources.download.minecraft.net/${sub}/${hash}`,
      dest: join(paths.assetObjects, sub, hash),
      sha1: hash,
      size
    })
  }
  return specs
}

/**
 * Old versions expect a flat `resources/` tree or a "virtual" assets folder
 * rather than the hashed object store.
 */
export function materialiseLegacyAssets(indexId: string, targetRoot: string): void {
  const index = readAssetIndex(indexId)
  if (!index) return
  for (const [name, { hash }] of Object.entries(index.objects)) {
    const src = join(paths.assetObjects, hash.slice(0, 2), hash)
    const dst = join(targetRoot, name)
    if (!existsSync(src) || existsSync(dst)) continue
    mkdirSync(join(dst, '..'), { recursive: true })
    try {
      copyFileSync(src, dst)
    } catch {
      /* non-fatal: a single missing legacy asset shouldn't block launch */
    }
  }
}

/** Unpack native libraries into the per-instance natives dir. */
export function extractNatives(nativeJars: { jar: string; exclude: string[] }[], targetDir: string): void {
  mkdirSync(targetDir, { recursive: true })
  for (const { jar, exclude } of nativeJars) {
    if (!existsSync(jar)) continue
    const zip = new AdmZip(jar)
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue
      if (exclude.some((prefix) => entry.entryName.startsWith(prefix))) continue
      // Only OS-relevant binaries; skip nested dirs that some jars carry.
      const name = entry.entryName.split('/').pop()!
      const out = join(targetDir, name)
      if (existsSync(out)) continue
      try {
        writeFileSync(out, entry.getData())
      } catch {
        /* locked file from a previous run — safe to ignore */
      }
    }
  }
}

/** Download everything a version needs, reporting progress. */
export async function installVersion(
  id: string,
  onProgress?: (p: Progress & { phase: string }) => void,
  signal?: AbortSignal
): Promise<VersionPlan> {
  const plan = await planVersion(id)

  onProgress?.({ phase: 'Client and libraries', done: 0, total: plan.downloads.length, bytesDone: 0, bytesTotal: 0, current: '' })
  await downloadAll(plan.downloads, (p) => onProgress?.({ ...p, phase: 'Client and libraries' }), signal)

  const assetSpecs = planAssets(plan.assetsIndexId)
  if (assetSpecs.length) {
    await downloadAll(assetSpecs, (p) => onProgress?.({ ...p, phase: 'Assets' }), signal)
  }
  return plan
}

/** Mojang's own "which JRE" hint, used to pick an Adoptium build. */
export function requiredJavaMajor(version: VersionJson): number {
  if (version.javaVersion?.majorVersion) return version.javaVersion.majorVersion
  // Fall back on release date heuristics for old versions with no javaVersion block.
  const year = Number((version.releaseTime ?? '').slice(0, 4))
  if (year >= 2021) return 17
  return 8
}

export { downloadOne }
