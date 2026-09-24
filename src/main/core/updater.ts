import { app, shell } from 'electron'
import { fetchJson } from './net'
import { getSettings } from './settings'

/**
 * Update checking.
 *
 * Deliberately a checker, not an installer. electron-updater cannot update an
 * MSI install — its Windows support is NSIS only — so an app shipped as an MSI
 * has to be updated by running the new MSI, which upgrades in place.
 *
 * What the launcher can do usefully is notice a new version exists, show what
 * changed, and hand the download to the browser. That works for every
 * packaging format, including a portable build with no installer at all.
 */

export interface UpdateInfo {
  currentVersion: string
  latestVersion: string
  /** True when latestVersion is genuinely newer than what is running. */
  updateAvailable: boolean
  /** Release notes, usually Markdown. */
  notes: string
  /** Page to open for the download. */
  url: string
  /** Direct link to the matching installer, when one could be identified. */
  downloadUrl: string | null
  publishedAt: string | null
  checkedAt: number
}

/**
 * Compare two semver-ish versions.
 *
 * Handles the common shapes (1.2.3, v1.2.3, 1.2.3-beta.1) without pulling in a
 * dependency. A prerelease sorts below the same numeric version, so 0.2.0-beta
 * does not look newer than 0.2.0.
 */
export function isNewer(candidate: string, current: string): boolean {
  const parse = (raw: string): { nums: number[]; pre: string } => {
    const cleaned = raw.trim().replace(/^v/i, '')
    const [core, ...rest] = cleaned.split('-')
    return {
      nums: core.split('.').map((n) => Number.parseInt(n, 10) || 0),
      pre: rest.join('-')
    }
  }

  // A version that does not start with a number cannot be compared. Returning
  // false means an unreadable version on either side is treated as "no update"
  // rather than prompting on data we do not understand.
  const parseable = (raw: string): boolean => /^v?\d+(\.\d+)*/.test(raw.trim())
  if (!parseable(candidate) || !parseable(current)) return false

  const a = parse(candidate)
  const b = parse(current)

  for (let i = 0; i < Math.max(a.nums.length, b.nums.length); i++) {
    const left = a.nums[i] ?? 0
    const right = b.nums[i] ?? 0
    if (left !== right) return left > right
  }

  // Same numbers: a release beats a prerelease, and otherwise compare tags.
  if (a.pre === b.pre) return false
  if (!a.pre) return true
  if (!b.pre) return false
  return a.pre.localeCompare(b.pre) > 0
}

interface GithubRelease {
  tag_name: string
  name: string
  body: string
  html_url: string
  draft: boolean
  prerelease: boolean
  published_at: string
  assets: { name: string; browser_download_url: string; size: number }[]
}

/** Prefer an installer matching how this copy was most likely installed. */
function pickAsset(assets: GithubRelease['assets']): string | null {
  if (process.platform === 'win32') {
    const order = ['.msi', '.exe']
    for (const ext of order) {
      const hit = assets.find((a) => a.name.toLowerCase().endsWith(ext))
      if (hit) return hit.browser_download_url
    }
  }
  if (process.platform === 'darwin') {
    const hit = assets.find((a) => a.name.toLowerCase().endsWith('.dmg'))
    if (hit) return hit.browser_download_url
  }
  if (process.platform === 'linux') {
    const hit = assets.find((a) => a.name.toLowerCase().endsWith('.appimage'))
    if (hit) return hit.browser_download_url
  }
  return assets[0]?.browser_download_url ?? null
}

async function checkGithub(repo: string, includePrereleases: boolean): Promise<UpdateInfo> {
  const clean = repo.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\/+$/, '')
  if (!/^[\w.-]+\/[\w.-]+$/.test(clean)) {
    throw new Error(`"${repo}" is not an owner/repo pair, e.g. jannes/prismatic.`)
  }

  // The releases list is used rather than /releases/latest, because that
  // endpoint skips prereleases entirely and 404s on a repo that has only ever
  // published one.
  const releases = await fetchJson<GithubRelease[]>(
    `https://api.github.com/repos/${clean}/releases?per_page=20`
  )

  const usable = releases.filter((r) => !r.draft && (includePrereleases || !r.prerelease))
  if (usable.length === 0) throw new Error('That repository has no published releases yet.')

  const latest = usable[0]
  const version = latest.tag_name.replace(/^v/i, '')

  return {
    currentVersion: app.getVersion(),
    latestVersion: version,
    updateAvailable: isNewer(version, app.getVersion()),
    notes: latest.body ?? '',
    url: latest.html_url,
    downloadUrl: pickAsset(latest.assets ?? []),
    publishedAt: latest.published_at ?? null,
    checkedAt: Date.now()
  }
}

interface VersionFeed {
  version: string
  notes?: string
  url?: string
  downloadUrl?: string
  publishedAt?: string
}

/** A plain JSON file, for anyone not publishing through GitHub. */
async function checkUrl(url: string): Promise<UpdateInfo> {
  const feed = await fetchJson<VersionFeed>(url)
  if (!feed?.version) throw new Error('That feed has no "version" field.')

  return {
    currentVersion: app.getVersion(),
    latestVersion: feed.version,
    updateAvailable: isNewer(feed.version, app.getVersion()),
    notes: feed.notes ?? '',
    url: feed.url ?? url,
    downloadUrl: feed.downloadUrl ?? null,
    publishedAt: feed.publishedAt ?? null,
    checkedAt: Date.now()
  }
}

export async function check(): Promise<UpdateInfo> {
  const { updates } = getSettings()

  if (updates.source === 'github') {
    if (!updates.githubRepo.trim()) {
      throw new Error('No repository set. Add one in Settings → Updates, e.g. jannes/prismatic.')
    }
    return checkGithub(updates.githubRepo, updates.includePrereleases)
  }

  if (updates.source === 'url') {
    if (!updates.feedUrl.trim()) throw new Error('No update feed URL set in Settings → Updates.')
    return checkUrl(updates.feedUrl)
  }

  throw new Error('Update checking is turned off.')
}

/**
 * Open the download in the browser rather than fetching it here.
 *
 * Downloading an installer inside the app and running it would mean the
 * launcher decides when to execute a binary from the internet. Handing the URL
 * to the browser keeps that decision, and the browser's own safety checks,
 * with the user.
 */
export async function openDownload(info: UpdateInfo): Promise<void> {
  const target = info.downloadUrl ?? info.url
  if (!/^https:\/\//i.test(target)) throw new Error('Refusing to open a non-HTTPS download link.')
  await shell.openExternal(target)
}
