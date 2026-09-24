import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import AdmZip from 'adm-zip'
import { gameDir, instanceDir, paths, safeJoin } from './paths'
import { downloadAll, downloadOne, fetchJson, type DownloadSpec } from './net'
import { createInstance, readInstance, writeInstance, slugify, emptyOverrides } from './instances'
import { projectVersions, readContentIndex } from './content'
import type { Instance, LoaderId } from '../../shared/types'

export interface PackProgress {
  (label: string, fraction: number | null): void
}

// --- Modrinth .mrpack -------------------------------------------------------

interface MrpackIndex {
  formatVersion: number
  game: string
  versionId: string
  name: string
  summary?: string
  files: {
    path: string
    hashes: { sha1?: string; sha512?: string }
    env?: { client?: 'required' | 'optional' | 'unsupported'; server?: string }
    downloads: string[]
    fileSize: number
  }[]
  dependencies: Record<string, string>
}

function loaderFromMrpack(deps: Record<string, string>): { loader: LoaderId; loaderVersion: string | null; mc: string } {
  const mc = deps.minecraft
  if (deps['fabric-loader']) return { loader: 'fabric', loaderVersion: deps['fabric-loader'], mc }
  if (deps['quilt-loader']) return { loader: 'quilt', loaderVersion: deps['quilt-loader'], mc }
  if (deps.neoforge) return { loader: 'neoforge', loaderVersion: deps.neoforge, mc }
  if (deps.forge) return { loader: 'forge', loaderVersion: deps.forge, mc }
  return { loader: 'vanilla', loaderVersion: null, mc }
}

export async function importMrpack(file: string, onProgress: PackProgress = () => {}, nameOverride?: string): Promise<Instance> {
  onProgress('Reading pack', null)
  const zip = new AdmZip(file)
  const indexEntry = zip.getEntry('modrinth.index.json')
  if (!indexEntry) throw new Error('Not a Modrinth pack: modrinth.index.json is missing')
  const index = JSON.parse(indexEntry.getData().toString('utf8')) as MrpackIndex

  const { loader, loaderVersion, mc } = loaderFromMrpack(index.dependencies)
  const inst = createInstance({
    name: nameOverride ?? index.name,
    mcVersion: mc,
    loader,
    loaderVersion,
    notes: index.summary ?? ''
  })
  writeInstance({
    ...inst,
    pack: { platform: 'modrinth', id: '', versionId: index.versionId, name: index.name }
  })

  // 1. Overrides (config, resource packs, anything the author bundled).
  onProgress('Extracting overrides', null)
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue
    const name = entry.entryName
    const prefix = name.startsWith('overrides/')
      ? 'overrides/'
      : name.startsWith('client-overrides/')
        ? 'client-overrides/'
        : null
    if (!prefix) continue
    const dest = safeJoin(gameDir(inst.id), name.slice(prefix.length))
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, entry.getData())
  }

  // 2. Downloads listed in the index. `path` comes from the pack author, so it
  //    gets the same treatment as an entry name.
  const specs: DownloadSpec[] = index.files
    .filter((f) => f.env?.client !== 'unsupported')
    .map((f) => ({
      url: f.downloads[0],
      dest: safeJoin(gameDir(inst.id), f.path),
      sha1: f.hashes.sha1,
      size: f.fileSize
    }))

  await downloadAll(specs, (p) => onProgress(`Downloading mods (${p.done}/${p.total})`, p.total ? p.done / p.total : null))
  onProgress('Pack installed', 1)
  return readInstance(inst.id)!
}

/** Install a Modrinth modpack straight from its project id. */
export async function installModrinthPack(
  projectId: string,
  versionId: string | null,
  onProgress: PackProgress = () => {},
  nameOverride?: string
): Promise<Instance> {
  onProgress('Resolving pack version', null)
  const versions = await projectVersions('modrinth', projectId)
  const version = versionId ? versions.find((v) => v.id === versionId) : versions[0]
  if (!version) throw new Error('No downloadable version for this pack')
  const file = version.files.find((f) => f.primary) ?? version.files[0]

  const tmp = join(paths.cache, file.filename)
  let got = 0
  await downloadOne({ url: file.url, dest: tmp, sha1: file.sha1, size: file.size }, (n) => {
    got += n
    onProgress(`Downloading ${version.name}`, file.size ? got / file.size : null)
  })
  return importMrpack(tmp, onProgress, nameOverride)
}

// --- CurseForge pack zip ----------------------------------------------------

interface CfManifest {
  minecraft: { version: string; modLoaders: { id: string; primary: boolean }[] }
  name: string
  version: string
  author: string
  files: { projectID: number; fileID: number; required: boolean }[]
  overrides: string
}

export async function importCurseForgePack(file: string, onProgress: PackProgress = () => {}): Promise<Instance> {
  onProgress('Reading pack', null)
  const zip = new AdmZip(file)
  const manifestEntry = zip.getEntry('manifest.json')
  if (!manifestEntry) throw new Error('Not a CurseForge pack: manifest.json is missing')
  const manifest = JSON.parse(manifestEntry.getData().toString('utf8')) as CfManifest

  const primary = manifest.minecraft.modLoaders.find((l) => l.primary) ?? manifest.minecraft.modLoaders[0]
  // Loader ids look like "forge-47.2.0" or "neoforge-20.6.119" or "fabric-0.16.9".
  const [loaderName, loaderVersion] = (primary?.id ?? 'vanilla').split(/-(.+)/)
  const loader = (['forge', 'fabric', 'quilt', 'neoforge'].includes(loaderName) ? loaderName : 'vanilla') as LoaderId

  const inst = createInstance({
    name: manifest.name,
    mcVersion: manifest.minecraft.version,
    loader,
    loaderVersion: loaderVersion ?? null,
    notes: `CurseForge pack ${manifest.version} by ${manifest.author}`
  })

  onProgress('Extracting overrides', null)
  const overridesPrefix = `${manifest.overrides ?? 'overrides'}/`
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory || !entry.entryName.startsWith(overridesPrefix)) continue
    const dest = safeJoin(gameDir(inst.id), entry.entryName.slice(overridesPrefix.length))
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, entry.getData())
  }

  // Resolve every project/file pair through the CurseForge API.
  const total = manifest.files.length
  let done = 0
  for (const entry of manifest.files) {
    done++
    onProgress(`Resolving mods (${done}/${total})`, done / total)
    try {
      const versions = await projectVersions('curseforge', String(entry.projectID))
      const match = versions.find((v) => v.id === String(entry.fileID)) ?? versions[0]
      const f = match?.files[0]
      if (!f) continue
      await downloadOne({ url: f.url, dest: join(gameDir(inst.id), 'mods', f.filename), sha1: f.sha1, size: f.size })
    } catch {
      // Keep going: one unavailable mod shouldn't abort a 200-mod pack.
    }
  }
  onProgress('Pack installed', 1)
  return readInstance(inst.id)!
}

// --- MultiMC / Prism instance zip ------------------------------------------

interface MmcPack {
  components: { uid: string; version: string; cachedName?: string }[]
  formatVersion: number
}

const MMC_UID_TO_LOADER: Record<string, LoaderId> = {
  'net.fabricmc.fabric-loader': 'fabric',
  'org.quiltmc.quilt-loader': 'quilt',
  'net.minecraftforge': 'forge',
  'net.neoforged': 'neoforge'
}

function parseIni(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const idx = line.indexOf('=')
    if (idx <= 0 || line.trimStart().startsWith('#')) continue
    out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
  }
  return out
}

/** Import a zipped MultiMC/Prism instance, preserving its settings where we can. */
export async function importMultiMcInstance(file: string, onProgress: PackProgress = () => {}): Promise<Instance> {
  onProgress('Reading instance', null)
  const zip = new AdmZip(file)
  const entries = zip.getEntries()

  // The zip may be rooted at the instance folder or one level in.
  const cfgEntry = entries.find((e) => e.entryName.endsWith('instance.cfg'))
  if (!cfgEntry) throw new Error('Not a MultiMC/Prism instance: instance.cfg is missing')
  const root = cfgEntry.entryName.slice(0, cfgEntry.entryName.length - 'instance.cfg'.length)

  const cfg = parseIni(cfgEntry.getData().toString('utf8'))
  const packEntry = entries.find((e) => e.entryName === `${root}mmc-pack.json`)
  const pack = packEntry ? (JSON.parse(packEntry.getData().toString('utf8')) as MmcPack) : { components: [], formatVersion: 1 }

  const mcComponent = pack.components.find((c) => c.uid === 'net.minecraft')
  const loaderComponent = pack.components.find((c) => MMC_UID_TO_LOADER[c.uid])

  const name = cfg.name || 'Imported instance'
  const inst = createInstance({
    name,
    mcVersion: mcComponent?.version ?? cfg.IntendedVersion ?? '1.20.1',
    loader: loaderComponent ? MMC_UID_TO_LOADER[loaderComponent.uid] : 'vanilla',
    loaderVersion: loaderComponent?.version ?? null,
    notes: cfg.notes ?? ''
  })

  // Carry over the per-instance overrides MultiMC stores in instance.cfg.
  const overrides = emptyOverrides()
  if (cfg.OverrideMemory === 'true') {
    overrides.memory = { min: Number(cfg.MinMemAlloc ?? 512), max: Number(cfg.MaxMemAlloc ?? 4096) }
  }
  if (cfg.OverrideJavaLocation === 'true' && cfg.JavaPath) overrides.javaPath = cfg.JavaPath
  if (cfg.OverrideJavaArgs === 'true' && cfg.JvmArgs) overrides.jvmArgs = cfg.JvmArgs
  if (cfg.OverrideWindow === 'true') {
    overrides.window = {
      width: Number(cfg.MinecraftWinWidth ?? 1280),
      height: Number(cfg.MinecraftWinHeight ?? 720),
      maximized: cfg.LaunchMaximized === 'true',
      fullscreen: false
    }
  }
  if (cfg.OverrideCommands === 'true') {
    overrides.commands = {
      pre: cfg.PreLaunchCommand ?? '',
      wrapper: cfg.WrapperCommand ?? '',
      post: cfg.PostExitCommand ?? ''
    }
  }

  onProgress('Extracting files', null)
  // MultiMC puts the game in .minecraft/ (or minecraft/ on very old versions).
  for (const entry of entries) {
    if (entry.isDirectory) continue
    const rel = entry.entryName.slice(root.length)
    if (!rel || rel === 'instance.cfg' || rel === 'mmc-pack.json') continue

    let dest: string
    if (rel.startsWith('.minecraft/')) dest = safeJoin(gameDir(inst.id), rel.slice('.minecraft/'.length))
    else if (rel.startsWith('minecraft/')) dest = safeJoin(gameDir(inst.id), rel.slice('minecraft/'.length))
    else dest = safeJoin(instanceDir(inst.id), rel)

    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, entry.getData())
  }

  const final = writeInstance({ ...readInstance(inst.id)!, overrides, group: cfg.InstanceGroup || null })
  onProgress('Instance imported', 1)
  return final
}

// --- Export -----------------------------------------------------------------

function addFolder(zip: AdmZip, dir: string, zipPrefix: string, skip: (rel: string) => boolean): void {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    const rel = `${zipPrefix}${entry.name}`
    if (skip(rel)) continue
    if (entry.isDirectory()) addFolder(zip, full, `${rel}/`, skip)
    else zip.addFile(rel, readFileSync(full))
  }
}

/** Export as a MultiMC/Prism-compatible instance zip. */
export function exportInstance(instanceId: string, destFile: string, includeSaves = true): string {
  const inst = readInstance(instanceId)
  if (!inst) throw new Error(`No such instance: ${instanceId}`)
  const zip = new AdmZip()

  const uidByLoader: Partial<Record<LoaderId, string>> = {
    fabric: 'net.fabricmc.fabric-loader',
    quilt: 'org.quiltmc.quilt-loader',
    forge: 'net.minecraftforge',
    neoforge: 'net.neoforged'
  }
  const components: MmcPack['components'] = [{ uid: 'net.minecraft', version: inst.mcVersion, cachedName: 'Minecraft' }]
  const uid = uidByLoader[inst.loader]
  if (uid && inst.loaderVersion) components.push({ uid, version: inst.loaderVersion, cachedName: inst.loader })

  zip.addFile('mmc-pack.json', Buffer.from(JSON.stringify({ components, formatVersion: 1 }, null, 2)))

  const cfg: string[] = [
    '[General]',
    'ConfigVersion=1.2',
    `name=${inst.name}`,
    `notes=${inst.notes.replace(/\n/g, ' ')}`,
    `iconKey=${inst.icon}`,
    inst.group ? `InstanceGroup=${inst.group}` : ''
  ]
  if (inst.overrides.memory) {
    cfg.push('OverrideMemory=true', `MinMemAlloc=${inst.overrides.memory.min}`, `MaxMemAlloc=${inst.overrides.memory.max}`)
  }
  if (inst.overrides.javaPath) cfg.push('OverrideJavaLocation=true', `JavaPath=${inst.overrides.javaPath}`)
  if (inst.overrides.jvmArgs) cfg.push('OverrideJavaArgs=true', `JvmArgs=${inst.overrides.jvmArgs}`)
  zip.addFile('instance.cfg', Buffer.from(cfg.filter(Boolean).join('\n')))

  addFolder(zip, gameDir(instanceId), '.minecraft/', (rel) => {
    if (!includeSaves && rel.startsWith('.minecraft/saves/')) return true
    // Never ship logs, crash dumps or caches.
    return /^\.minecraft\/(logs|crash-reports|\.mixin\.out|realms-persistence\.json)/.test(rel)
  })

  mkdirSync(dirname(destFile), { recursive: true })
  zip.writeZip(destFile)
  return destFile
}

/** Export as a Modrinth .mrpack, using the recorded provenance for mod links. */
export async function exportMrpack(instanceId: string, destFile: string, versionLabel = '1.0.0'): Promise<string> {
  const inst = readInstance(instanceId)
  if (!inst) throw new Error(`No such instance: ${instanceId}`)
  const index = readContentIndex(instanceId)

  const dependencies: Record<string, string> = { minecraft: inst.mcVersion }
  if (inst.loader === 'fabric' && inst.loaderVersion) dependencies['fabric-loader'] = inst.loaderVersion
  if (inst.loader === 'quilt' && inst.loaderVersion) dependencies['quilt-loader'] = inst.loaderVersion
  if (inst.loader === 'forge' && inst.loaderVersion) dependencies.forge = inst.loaderVersion
  if (inst.loader === 'neoforge' && inst.loaderVersion) dependencies.neoforge = inst.loaderVersion

  const files: MrpackIndex['files'] = []
  const zip = new AdmZip()
  const modsDir = join(gameDir(instanceId), 'mods')

  // Mods we know the origin of become links; everything else is bundled.
  const linked = new Set<string>()
  if (existsSync(modsDir)) {
    for (const filename of readdirSync(modsDir)) {
      const provider = index[filename]
      if (!provider || provider.platform !== 'modrinth') continue
      try {
        const versions = await projectVersions('modrinth', provider.projectId)
        const version = versions.find((v) => v.id === provider.versionId)
        const file = version?.files.find((f) => f.primary) ?? version?.files[0]
        if (!file?.sha1) continue
        files.push({
          path: `mods/${filename}`,
          hashes: { sha1: file.sha1 },
          env: { client: 'required', server: 'required' },
          downloads: [file.url],
          fileSize: file.size
        })
        linked.add(filename)
      } catch {
        /* fall through to bundling */
      }
    }
  }

  const indexJson: MrpackIndex = {
    formatVersion: 1,
    game: 'minecraft',
    versionId: versionLabel,
    name: inst.name,
    summary: inst.notes,
    files,
    dependencies
  }
  zip.addFile('modrinth.index.json', Buffer.from(JSON.stringify(indexJson, null, 2)))

  addFolder(zip, gameDir(instanceId), 'overrides/', (rel) => {
    const inner = rel.slice('overrides/'.length)
    if (inner.startsWith('mods/') && linked.has(inner.slice('mods/'.length))) return true
    return /^(logs|crash-reports|saves|screenshots|\.mixin\.out|realms-persistence\.json|usercache\.json|servers\.dat)/.test(inner)
  })

  mkdirSync(dirname(destFile), { recursive: true })
  zip.writeZip(destFile)
  return destFile
}

/** Read a pack zip and report what it is, without importing. */
export function inspectPack(file: string): { kind: 'mrpack' | 'curseforge' | 'multimc' | 'unknown'; name: string; mcVersion: string; loader: string } {
  try {
    const zip = new AdmZip(file)
    const mr = zip.getEntry('modrinth.index.json')
    if (mr) {
      const index = JSON.parse(mr.getData().toString('utf8')) as MrpackIndex
      const { loader, mc } = loaderFromMrpack(index.dependencies)
      return { kind: 'mrpack', name: index.name, mcVersion: mc, loader }
    }
    const cf = zip.getEntry('manifest.json')
    if (cf) {
      const manifest = JSON.parse(cf.getData().toString('utf8')) as CfManifest
      const primary = manifest.minecraft.modLoaders.find((l) => l.primary) ?? manifest.minecraft.modLoaders[0]
      return {
        kind: 'curseforge',
        name: manifest.name,
        mcVersion: manifest.minecraft.version,
        loader: (primary?.id ?? 'vanilla').split('-')[0]
      }
    }
    const mmc = zip.getEntries().find((e) => e.entryName.endsWith('instance.cfg'))
    if (mmc) {
      const cfg = parseIni(mmc.getData().toString('utf8'))
      return { kind: 'multimc', name: cfg.name ?? 'Instance', mcVersion: cfg.IntendedVersion ?? '', loader: '' }
    }
  } catch {
    /* fall through */
  }
  return { kind: 'unknown', name: '', mcVersion: '', loader: '' }
}

/** Dispatch on content, so the UI only needs one "import this file" action. */
export async function importAnyPack(file: string, onProgress: PackProgress = () => {}): Promise<Instance> {
  const info = inspectPack(file)
  if (info.kind === 'mrpack') return importMrpack(file, onProgress)
  if (info.kind === 'curseforge') return importCurseForgePack(file, onProgress)
  if (info.kind === 'multimc') return importMultiMcInstance(file, onProgress)
  throw new Error('Unrecognised file. Expected a .mrpack, a CurseForge pack zip, or a MultiMC/Prism instance zip.')
}
