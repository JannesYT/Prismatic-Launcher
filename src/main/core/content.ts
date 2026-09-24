import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import AdmZip from 'adm-zip'
import { gameDir, instanceDir } from './paths'
import { downloadOne, fetchJson, USER_AGENT } from './net'
import { getSettings } from './settings'
import type { ContentKind, InstalledMod, ProjectHit, ProjectVersion } from '../../shared/types'

const MODRINTH = 'https://api.modrinth.com/v2'
const CURSEFORGE = 'https://api.curseforge.com/v1'

/** CurseForge class ids for the content types we support. */
const CF_CLASS: Record<ContentKind, number> = {
  mod: 6,
  resourcepack: 12,
  shader: 6552,
  datapack: 6945,
  modpack: 4471
}

export interface SearchQuery {
  query: string
  kind: ContentKind
  gameVersion?: string
  loader?: string
  categories?: string[]
  sort?: 'relevance' | 'downloads' | 'follows' | 'newest' | 'updated'
  offset?: number
  limit?: number
  platform: 'modrinth' | 'curseforge'
}

// --- Modrinth ---------------------------------------------------------------

const MODRINTH_TYPE: Record<ContentKind, string> = {
  mod: 'mod',
  resourcepack: 'resourcepack',
  shader: 'shader',
  datapack: 'datapack',
  modpack: 'modpack'
}

interface ModrinthHit {
  project_id: string
  slug: string
  title: string
  description: string
  author: string
  downloads: number
  follows: number
  icon_url: string | null
  categories: string[]
  versions: string[]
  date_modified: string
  client_side: 'required' | 'optional' | 'unsupported'
  server_side: 'required' | 'optional' | 'unsupported'
}

async function searchModrinth(q: SearchQuery): Promise<{ hits: ProjectHit[]; total: number }> {
  const facets: string[][] = [[`project_type:${MODRINTH_TYPE[q.kind]}`]]
  if (q.gameVersion) facets.push([`versions:${q.gameVersion}`])
  if (q.loader && q.loader !== 'vanilla' && q.kind !== 'resourcepack') facets.push([`categories:${q.loader}`])
  if (q.categories?.length) facets.push(q.categories.map((c) => `categories:${c}`))

  const params = new URLSearchParams({
    query: q.query,
    facets: JSON.stringify(facets),
    index: q.sort === 'relevance' || !q.sort ? 'relevance' : q.sort,
    offset: String(q.offset ?? 0),
    limit: String(q.limit ?? 30)
  })

  const res = await fetchJson<{ hits: ModrinthHit[]; total_hits: number }>(`${MODRINTH}/search?${params}`)
  return {
    total: res.total_hits,
    hits: res.hits.map((h) => ({
      platform: 'modrinth' as const,
      id: h.project_id,
      slug: h.slug,
      title: h.title,
      description: h.description,
      author: h.author,
      downloads: h.downloads,
      follows: h.follows,
      iconUrl: h.icon_url,
      categories: h.categories,
      loaders: h.categories.filter((c) => ['fabric', 'forge', 'quilt', 'neoforge'].includes(c)),
      gameVersions: h.versions,
      updated: h.date_modified,
      clientSide: h.client_side,
      serverSide: h.server_side
    }))
  }
}

interface ModrinthVersion {
  id: string
  name: string
  version_number: string
  version_type: 'release' | 'beta' | 'alpha'
  game_versions: string[]
  loaders: string[]
  date_published: string
  downloads: number
  files: { url: string; filename: string; size: number; hashes: { sha1?: string }; primary: boolean }[]
  dependencies: { project_id: string | null; version_id: string | null; dependency_type: string }[]
}

function mapModrinthVersion(v: ModrinthVersion): ProjectVersion {
  return {
    id: v.id,
    name: v.name,
    versionNumber: v.version_number,
    channel: v.version_type,
    gameVersions: v.game_versions,
    loaders: v.loaders,
    datePublished: v.date_published,
    downloads: v.downloads,
    files: v.files.map((f) => ({
      url: f.url,
      filename: f.filename,
      size: f.size,
      sha1: f.hashes?.sha1,
      primary: f.primary
    })),
    dependencies: v.dependencies.map((d) => ({
      projectId: d.project_id,
      versionId: d.version_id,
      type: d.dependency_type
    }))
  }
}

// --- CurseForge -------------------------------------------------------------

function cfHeaders(): Record<string, string> {
  const key = getSettings().integrations.curseforgeApiKey.trim()
  if (!key) {
    throw new Error(
      'CurseForge needs a free API key. Get one at console.curseforge.com and paste it into ' +
        'Settings -> Integrations. Modrinth works without a key.'
    )
  }
  return { 'x-api-key': key, 'User-Agent': USER_AGENT, Accept: 'application/json' }
}

interface CfMod {
  id: number
  slug: string
  name: string
  summary: string
  downloadCount: number
  thumbsUpCount?: number
  logo?: { thumbnailUrl: string }
  authors: { name: string }[]
  categories: { name: string; slug: string }[]
  latestFilesIndexes?: { gameVersion: string; modLoader?: number }[]
  dateModified: string
}

const CF_LOADER: Record<number, string> = { 1: 'forge', 4: 'fabric', 5: 'quilt', 6: 'neoforge' }
const CF_LOADER_ID: Record<string, number> = { forge: 1, fabric: 4, quilt: 5, neoforge: 6 }

async function searchCurseForge(q: SearchQuery): Promise<{ hits: ProjectHit[]; total: number }> {
  const params = new URLSearchParams({
    gameId: '432',
    classId: String(CF_CLASS[q.kind]),
    searchFilter: q.query,
    sortOrder: 'desc',
    index: String(q.offset ?? 0),
    pageSize: String(q.limit ?? 30),
    sortField: q.sort === 'downloads' ? '6' : q.sort === 'updated' ? '3' : q.sort === 'newest' ? '11' : '2'
  })
  if (q.gameVersion) params.set('gameVersion', q.gameVersion)
  if (q.loader && CF_LOADER_ID[q.loader]) params.set('modLoaderType', String(CF_LOADER_ID[q.loader]))

  const res = await fetch(`${CURSEFORGE}/mods/search?${params}`, { headers: cfHeaders() })
  if (!res.ok) throw new Error(`CurseForge search failed: ${res.status}`)
  const json = (await res.json()) as { data: CfMod[]; pagination: { totalCount: number } }

  return {
    total: json.pagination.totalCount,
    hits: json.data.map((m) => ({
      platform: 'curseforge' as const,
      id: String(m.id),
      slug: m.slug,
      title: m.name,
      description: m.summary,
      author: m.authors[0]?.name ?? 'Unknown',
      downloads: m.downloadCount,
      follows: m.thumbsUpCount ?? 0,
      iconUrl: m.logo?.thumbnailUrl ?? null,
      categories: m.categories.map((c) => c.slug),
      loaders: [...new Set((m.latestFilesIndexes ?? []).map((i) => (i.modLoader ? CF_LOADER[i.modLoader] : '')).filter(Boolean))],
      gameVersions: [...new Set((m.latestFilesIndexes ?? []).map((i) => i.gameVersion))],
      updated: m.dateModified
    }))
  }
}

interface CfFile {
  id: number
  displayName: string
  fileName: string
  releaseType: 1 | 2 | 3
  fileDate: string
  downloadCount: number
  fileLength: number
  downloadUrl: string | null
  gameVersions: string[]
  hashes: { value: string; algo: number }[]
  dependencies: { modId: number; relationType: number }[]
}

const CF_RELATION: Record<number, string> = { 1: 'embedded', 2: 'optional', 3: 'required', 4: 'tool', 5: 'incompatible', 6: 'include' }

// --- Public API -------------------------------------------------------------

export async function search(q: SearchQuery): Promise<{ hits: ProjectHit[]; total: number }> {
  return q.platform === 'curseforge' ? searchCurseForge(q) : searchModrinth(q)
}

export async function projectVersions(
  platform: 'modrinth' | 'curseforge',
  projectId: string,
  gameVersion?: string,
  loader?: string
): Promise<ProjectVersion[]> {
  if (platform === 'modrinth') {
    const params = new URLSearchParams()
    if (gameVersion) params.set('game_versions', JSON.stringify([gameVersion]))
    if (loader && loader !== 'vanilla') params.set('loaders', JSON.stringify([loader]))
    const list = await fetchJson<ModrinthVersion[]>(
      `${MODRINTH}/project/${projectId}/version${params.toString() ? `?${params}` : ''}`
    )
    return list.map(mapModrinthVersion)
  }

  const res = await fetch(`${CURSEFORGE}/mods/${projectId}/files?pageSize=50`, { headers: cfHeaders() })
  if (!res.ok) throw new Error(`CurseForge file list failed: ${res.status}`)
  const json = (await res.json()) as { data: CfFile[] }
  return json.data
    .filter((f) => (!gameVersion || f.gameVersions.includes(gameVersion)))
    .map((f) => ({
      id: String(f.id),
      name: f.displayName,
      versionNumber: f.fileName,
      channel: f.releaseType === 1 ? ('release' as const) : f.releaseType === 2 ? ('beta' as const) : ('alpha' as const),
      gameVersions: f.gameVersions.filter((v) => /^\d/.test(v)),
      loaders: f.gameVersions.filter((v) => !/^\d/.test(v)).map((v) => v.toLowerCase()),
      datePublished: f.fileDate,
      downloads: f.downloadCount,
      files: [
        {
          // CurseForge hides downloadUrl for projects that opted out of third-party
          // distribution; the deterministic CDN path still works for those.
          url: f.downloadUrl ?? cfFallbackUrl(f.id, f.fileName),
          filename: f.fileName,
          size: f.fileLength,
          sha1: f.hashes.find((h) => h.algo === 1)?.value,
          primary: true
        }
      ],
      dependencies: f.dependencies.map((d) => ({
        projectId: String(d.modId),
        versionId: null,
        type: CF_RELATION[d.relationType] ?? 'optional'
      }))
    }))
}

function cfFallbackUrl(fileId: number, fileName: string): string {
  const id = String(fileId)
  return `https://mediafilez.forgecdn.net/files/${id.slice(0, 4)}/${id.slice(4)}/${encodeURIComponent(fileName)}`
}

const TARGET_DIR: Record<ContentKind, string> = {
  mod: 'mods',
  resourcepack: 'resourcepacks',
  shader: 'shaderpacks',
  datapack: 'datapacks',
  modpack: '.'
}

/** Download a project version's primary file into the right folder of an instance. */
export async function installContent(
  instanceId: string,
  kind: ContentKind,
  platform: 'modrinth' | 'curseforge',
  projectId: string,
  version: ProjectVersion,
  onProgress?: (fraction: number | null) => void
): Promise<InstalledMod> {
  const file = version.files.find((f) => f.primary) ?? version.files[0]
  if (!file) throw new Error(`${version.name} has no downloadable file`)

  const dir = join(gameDir(instanceId), TARGET_DIR[kind])
  mkdirSync(dir, { recursive: true })
  const dest = join(dir, file.filename)

  let got = 0
  await downloadOne({ url: file.url, dest, sha1: file.sha1, size: file.size }, (n) => {
    got += n
    onProgress?.(file.size ? got / file.size : null)
  })

  // Record provenance so we can offer updates later.
  const index = readContentIndex(instanceId)
  index[file.filename] = { platform, projectId, versionId: version.id }
  writeContentIndex(instanceId, index)

  return readMod(dir, file.filename, index)
}

/** Resolve and install required dependencies alongside a version. */
export async function installWithDependencies(
  instanceId: string,
  kind: ContentKind,
  platform: 'modrinth' | 'curseforge',
  projectId: string,
  version: ProjectVersion,
  gameVersion: string,
  loader: string,
  onProgress?: (label: string, fraction: number | null) => void
): Promise<InstalledMod[]> {
  const installed: InstalledMod[] = []
  const seen = new Set<string>([projectId])

  onProgress?.(version.name, null)
  installed.push(await installContent(instanceId, kind, platform, projectId, version, (f) => onProgress?.(version.name, f)))

  const required = version.dependencies.filter((d) => d.type === 'required' && d.projectId)
  for (const dep of required) {
    if (!dep.projectId || seen.has(dep.projectId)) continue
    seen.add(dep.projectId)
    try {
      const versions = await projectVersions(platform, dep.projectId, gameVersion, loader)
      const best = versions.find((v) => v.channel === 'release') ?? versions[0]
      if (!best) continue
      onProgress?.(`Dependency: ${best.name}`, null)
      installed.push(await installContent(instanceId, kind, platform, dep.projectId, best))
    } catch {
      // A missing optional-ish dependency shouldn't fail the whole install.
    }
  }
  return installed
}

// --- Installed mod listing --------------------------------------------------

type ContentIndex = Record<string, { platform: 'modrinth' | 'curseforge'; projectId: string; versionId: string }>

function indexPath(instanceId: string): string {
  return join(instanceDir(instanceId), 'content-index.json')
}

export function readContentIndex(instanceId: string): ContentIndex {
  const file = indexPath(instanceId)
  if (!existsSync(file)) return {}
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as ContentIndex
  } catch {
    return {}
  }
}

function writeContentIndex(instanceId: string, index: ContentIndex): void {
  writeFileSync(indexPath(instanceId), JSON.stringify(index, null, 2), 'utf8')
}

/** Read a jar's fabric.mod.json / mods.toml to show a real name and version. */
function readMod(dir: string, filename: string, index: ContentIndex): InstalledMod {
  const full = join(dir, filename)
  const enabled = !filename.endsWith('.disabled')
  const size = statSync(full).size
  const base: InstalledMod = {
    filename,
    enabled,
    name: filename.replace(/\.(jar|zip)(\.disabled)?$/i, ''),
    version: '',
    authors: [],
    description: '',
    loaders: [],
    size,
    provider: index[filename] ?? index[filename.replace(/\.disabled$/, '')]
  }

  try {
    const zip = new AdmZip(full)

    const fabricEntry = zip.getEntry('fabric.mod.json')
    if (fabricEntry) {
      const meta = JSON.parse(fabricEntry.getData().toString('utf8')) as {
        name?: string
        id?: string
        version?: string
        description?: string
        authors?: (string | { name: string })[]
      }
      return {
        ...base,
        name: meta.name ?? meta.id ?? base.name,
        version: meta.version ?? '',
        description: meta.description ?? '',
        authors: (meta.authors ?? []).map((a) => (typeof a === 'string' ? a : a.name)),
        loaders: ['fabric']
      }
    }

    const quiltEntry = zip.getEntry('quilt.mod.json')
    if (quiltEntry) {
      const meta = JSON.parse(quiltEntry.getData().toString('utf8')) as {
        quilt_loader?: { id?: string; version?: string; metadata?: { name?: string; description?: string } }
      }
      return {
        ...base,
        name: meta.quilt_loader?.metadata?.name ?? meta.quilt_loader?.id ?? base.name,
        version: meta.quilt_loader?.version ?? '',
        description: meta.quilt_loader?.metadata?.description ?? '',
        loaders: ['quilt']
      }
    }

    // Forge / NeoForge use a TOML file; a light regex read is enough for display.
    const toml =
      zip.getEntry('META-INF/neoforge.mods.toml') ?? zip.getEntry('META-INF/mods.toml')
    if (toml) {
      const text = toml.getData().toString('utf8')
      const grab = (key: string): string => new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"`, 'm').exec(text)?.[1] ?? ''
      return {
        ...base,
        name: grab('displayName') || base.name,
        version: grab('version').replace('${file.jarVersion}', ''),
        description: grab('description'),
        authors: grab('authors') ? [grab('authors')] : [],
        loaders: [toml.entryName.includes('neoforge') ? 'neoforge' : 'forge']
      }
    }
  } catch {
    /* unreadable jar — show the filename */
  }
  return base
}

export function listInstalledMods(instanceId: string): InstalledMod[] {
  const dir = join(gameDir(instanceId), 'mods')
  if (!existsSync(dir)) return []
  const index = readContentIndex(instanceId)
  return readdirSync(dir)
    .filter((f) => /\.jar(\.disabled)?$/i.test(f))
    .map((f) => readMod(dir, f, index))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function toggleMod(instanceId: string, filename: string): void {
  const dir = join(gameDir(instanceId), 'mods')
  const from = join(dir, filename)
  const to = filename.endsWith('.disabled')
    ? join(dir, filename.slice(0, -'.disabled'.length))
    : `${from}.disabled`
  renameSync(from, to)
}

export function deleteMod(instanceId: string, filename: string): void {
  rmSync(join(gameDir(instanceId), 'mods', filename), { force: true })
  const index = readContentIndex(instanceId)
  delete index[filename]
  writeContentIndex(instanceId, index)
}

/** Check every tracked mod for a newer version matching the instance. */
export async function checkModUpdates(
  instanceId: string,
  gameVersion: string,
  loader: string
): Promise<Record<string, ProjectVersion | null>> {
  const mods = listInstalledMods(instanceId)
  const result: Record<string, ProjectVersion | null> = {}

  await Promise.all(
    mods.map(async (mod) => {
      if (!mod.provider) {
        result[mod.filename] = null
        return
      }
      try {
        const versions = await projectVersions(mod.provider.platform, mod.provider.projectId, gameVersion, loader)
        const newest = versions[0]
        result[mod.filename] = newest && newest.id !== mod.provider.versionId ? newest : null
      } catch {
        result[mod.filename] = null
      }
    })
  )
  return result
}

/** Replace a mod file with a newer version, keeping the enabled state. */
export async function updateMod(
  instanceId: string,
  filename: string,
  version: ProjectVersion
): Promise<InstalledMod> {
  const index = readContentIndex(instanceId)
  const provider = index[filename]
  if (!provider) throw new Error(`${filename} has no known source, so it can't be updated automatically.`)
  const wasDisabled = filename.endsWith('.disabled')

  const installed = await installContent(instanceId, 'mod', provider.platform, provider.projectId, version)
  // Remove the old jar only after the new one landed.
  if (installed.filename !== filename) deleteMod(instanceId, filename)
  if (wasDisabled && !installed.filename.endsWith('.disabled')) {
    toggleMod(instanceId, installed.filename)
  }
  return installed
}
