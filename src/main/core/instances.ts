import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  cpSync,
  statSync,
  renameSync
} from 'node:fs'
import { join } from 'node:path'
import { paths, instanceDir, gameDir } from './paths'
import { expectedVersionId } from './loaders'
import type { Instance, InstanceOverrides, LoaderId, WorldSave, ScreenshotEntry, ServerEntry } from '../../shared/types'

const META_FILE = 'instance.json'

export function emptyOverrides(): InstanceOverrides {
  return {
    memory: null,
    javaPath: null,
    jvmArgs: null,
    window: null,
    commands: null,
    env: null,
    quickPlay: null,
    showLogAfterLaunch: null,
    closeLauncherOnLaunch: null
  }
}

/** Turn a display name into a safe, unique folder name. */
export function slugify(name: string): string {
  const base =
    name
      .normalize('NFKD')
      .replace(/[^\w\s.-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/^[.\-]+|[.\-]+$/g, '')
      .slice(0, 48) || 'instance'
  let candidate = base
  let n = 2
  while (existsSync(instanceDir(candidate))) candidate = `${base}-${n++}`
  return candidate
}

export function readInstance(id: string): Instance | null {
  const file = join(instanceDir(id), META_FILE)
  if (!existsSync(file)) return null
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Instance
    return { ...parsed, id, overrides: { ...emptyOverrides(), ...parsed.overrides } }
  } catch {
    return null
  }
}

export function writeInstance(inst: Instance): Instance {
  mkdirSync(instanceDir(inst.id), { recursive: true })
  writeFileSync(join(instanceDir(inst.id), META_FILE), JSON.stringify(inst, null, 2), 'utf8')
  return inst
}

export function listInstances(): Instance[] {
  if (!existsSync(paths.instances)) return []
  return readdirSync(paths.instances, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => readInstance(e.name))
    .filter((x): x is Instance => x !== null)
}

export interface CreateOptions {
  name: string
  mcVersion: string
  loader: LoaderId
  loaderVersion: string | null
  icon?: string
  group?: string | null
  notes?: string
}

export function createInstance(opts: CreateOptions): Instance {
  const id = slugify(opts.name)
  const inst: Instance = {
    id,
    name: opts.name.trim() || id,
    group: opts.group ?? null,
    icon: opts.icon ?? 'grass',
    mcVersion: opts.mcVersion,
    loader: opts.loader,
    loaderVersion: opts.loaderVersion,
    components: buildComponents(opts.mcVersion, opts.loader, opts.loaderVersion),
    notes: opts.notes ?? '',
    created: Date.now(),
    lastPlayed: null,
    totalPlaySeconds: 0,
    overrides: emptyOverrides(),
    favourite: false
  }
  mkdirSync(gameDir(id), { recursive: true })
  for (const sub of ['mods', 'resourcepacks', 'shaderpacks', 'saves', 'config', 'screenshots']) {
    mkdirSync(join(gameDir(id), sub), { recursive: true })
  }
  return writeInstance(inst)
}

function buildComponents(mcVersion: string, loader: LoaderId, loaderVersion: string | null) {
  const comps = [{ uid: 'net.minecraft', version: mcVersion, important: true }]
  const uids: Partial<Record<LoaderId, string>> = {
    fabric: 'net.fabricmc.fabric-loader',
    quilt: 'org.quiltmc.quilt-loader',
    forge: 'net.minecraftforge',
    neoforge: 'net.neoforged'
  }
  const uid = uids[loader]
  if (uid && loaderVersion) comps.push({ uid, version: loaderVersion, important: true })
  return comps
}

export function updateInstance(id: string, patch: Partial<Instance>): Instance {
  const current = readInstance(id)
  if (!current) throw new Error(`No such instance: ${id}`)
  const merged: Instance = {
    ...current,
    ...patch,
    id: current.id,
    overrides: { ...current.overrides, ...(patch.overrides ?? {}) }
  }
  // Keep the component list in sync when version/loader changes.
  if (patch.mcVersion || patch.loader || patch.loaderVersion !== undefined) {
    merged.components = buildComponents(merged.mcVersion, merged.loader, merged.loaderVersion)
  }
  return writeInstance(merged)
}

export function deleteInstance(id: string): void {
  rmSync(instanceDir(id), { recursive: true, force: true })
}

export function duplicateInstance(id: string, newName: string): Instance {
  const source = readInstance(id)
  if (!source) throw new Error(`No such instance: ${id}`)
  const newId = slugify(newName)
  cpSync(instanceDir(id), instanceDir(newId), { recursive: true })
  return writeInstance({
    ...source,
    id: newId,
    name: newName,
    created: Date.now(),
    lastPlayed: null,
    totalPlaySeconds: 0
  })
}

export function renameInstanceFolder(id: string, newName: string): Instance {
  const source = readInstance(id)
  if (!source) throw new Error(`No such instance: ${id}`)
  return writeInstance({ ...source, name: newName })
}

/** The version id we should launch for this instance. */
export function launchVersionId(inst: Instance): string {
  return expectedVersionId(inst.loader, inst.mcVersion, inst.loaderVersion)
}

export function recordPlaySession(id: string, seconds: number): void {
  const inst = readInstance(id)
  if (!inst) return
  writeInstance({
    ...inst,
    lastPlayed: Date.now(),
    totalPlaySeconds: inst.totalPlaySeconds + Math.max(0, Math.round(seconds))
  })
}

export function listGroups(): string[] {
  const groups = new Set<string>()
  for (const inst of listInstances()) if (inst.group) groups.add(inst.group)
  return [...groups].sort((a, b) => a.localeCompare(b))
}

// --- In-instance content ----------------------------------------------------

function dirSize(dir: string): number {
  let total = 0
  const walk = (d: string): void => {
    let entries: import('node:fs').Dirent[]
    try {
      entries = readdirSync(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const p = join(d, e.name)
      if (e.isDirectory()) walk(p)
      else {
        try {
          total += statSync(p).size
        } catch {
          /* ignore */
        }
      }
    }
  }
  walk(dir)
  return total
}

export function listWorlds(id: string): WorldSave[] {
  const savesDir = join(gameDir(id), 'saves')
  if (!existsSync(savesDir)) return []
  return readdirSync(savesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const folder = join(savesDir, e.name)
      // level.dat is NBT; reading it properly needs a parser. The folder name and
      // mtime are enough for the list, and we read level.dat_old's sibling text
      // files when present.
      let lastPlayed = 0
      try {
        lastPlayed = statSync(join(folder, 'level.dat')).mtimeMs
      } catch {
        lastPlayed = statSync(folder).mtimeMs
      }
      return {
        folder: e.name,
        name: e.name,
        gameVersion: '',
        lastPlayed,
        sizeBytes: dirSize(folder),
        hardcore: false,
        gameMode: 0
      }
    })
    .sort((a, b) => b.lastPlayed - a.lastPlayed)
}

export function deleteWorld(id: string, folder: string): void {
  rmSync(join(gameDir(id), 'saves', folder), { recursive: true, force: true })
}

export function listScreenshots(id: string): ScreenshotEntry[] {
  const dir = join(gameDir(id), 'screenshots')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => /\.(png|jpg|jpeg)$/i.test(f))
    .map((f) => {
      const stat = statSync(join(dir, f))
      return { file: join(dir, f), name: f, takenAt: stat.mtimeMs, sizeBytes: stat.size }
    })
    .sort((a, b) => b.takenAt - a.takenAt)
}

/** Parse servers.dat just enough to list server names and addresses. */
export function listServers(id: string): ServerEntry[] {
  const file = join(gameDir(id), 'servers.dat')
  if (!existsSync(file)) return []
  try {
    // servers.dat is uncompressed NBT. Rather than a full parser, scan for the
    // "name"/"ip" TAG_String pairs, which is reliable for this simple structure.
    const buf = readFileSync(file)
    const entries: ServerEntry[] = []
    let i = 0
    let pendingName: string | null = null
    while (i < buf.length - 4) {
      const tag = buf[i]
      if (tag === 8) {
        const nameLen = buf.readUInt16BE(i + 1)
        const key = buf.toString('utf8', i + 3, i + 3 + nameLen)
        const valLen = buf.readUInt16BE(i + 3 + nameLen)
        const value = buf.toString('utf8', i + 5 + nameLen, i + 5 + nameLen + valLen)
        if (key === 'name') pendingName = value
        if (key === 'ip') {
          entries.push({ name: pendingName ?? value, ip: value, icon: null })
          pendingName = null
        }
        i += 5 + nameLen + valLen
        continue
      }
      i++
    }
    return entries
  } catch {
    return []
  }
}

/** Resource packs and shader packs are just files in their folders. */
export function listPackFiles(id: string, kind: 'resourcepacks' | 'shaderpacks'): { name: string; sizeBytes: number; enabled: boolean }[] {
  const dir = join(gameDir(id), kind)
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() || e.isDirectory())
    .map((e) => {
      const p = join(dir, e.name)
      return {
        name: e.name,
        sizeBytes: e.isDirectory() ? dirSize(p) : statSync(p).size,
        enabled: !e.name.endsWith('.disabled')
      }
    })
}

export function togglePackFile(id: string, kind: 'resourcepacks' | 'shaderpacks', name: string): void {
  const dir = join(gameDir(id), kind)
  const from = join(dir, name)
  const to = name.endsWith('.disabled') ? join(dir, name.slice(0, -'.disabled'.length)) : `${from}.disabled`
  renameSync(from, to)
}

export function deletePackFile(id: string, kind: 'resourcepacks' | 'shaderpacks', name: string): void {
  rmSync(join(gameDir(id), kind, name), { recursive: true, force: true })
}

export function instanceSize(id: string): number {
  return dirSize(instanceDir(id))
}
