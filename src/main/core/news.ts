import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { paths } from './paths'
import { fetchJsonCached } from './net'
import { getSettings } from './settings'
import type { NewsPost } from '../../shared/news'
import { EXAMPLE_POST } from '../../shared/news'

/**
 * News comes from three places, in descending order of how much the launcher
 * trusts it:
 *
 *  1. Markdown files in the user's own news folder.
 *  2. JSON feeds they have subscribed to.
 *  3. Mojang's official Java patch notes.
 *
 * Only the first is writable. The other two are fetched and cached, and their
 * content is rendered as Markdown into React elements rather than HTML, so a
 * feed cannot inject markup.
 */

export function newsDir(): string {
  const dir = join(paths.root, 'news')
  mkdirSync(dir, { recursive: true })
  return dir
}

// --- Local Markdown posts ---------------------------------------------------

/**
 * Parse the small frontmatter block at the top of a post.
 *
 * Deliberately not YAML: `key: value` lines only. A full YAML parser would be
 * another dependency and would let a typo fail in ways that are hard to
 * explain, whereas this can only ever mis-read one line.
 */
function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw)
  if (!match) return { meta: {}, body: raw.trim() }

  const meta: Record<string, string> = {}
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(':')
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim().toLowerCase()
    let value = line.slice(idx + 1).trim()
    // Quotes are optional; strip them if present so both styles work.
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    meta[key] = value
  }
  return { meta, body: match[2].trim() }
}

function firstParagraph(body: string): string {
  const text = body
    .split(/\r?\n\r?\n/)[0]
    // Strip the Markdown that would look wrong in a one-line teaser.
    .replace(/^#+\s*/gm, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > 180 ? `${text.slice(0, 177)}…` : text
}

export function listLocal(): NewsPost[] {
  const dir = newsDir()
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((file): NewsPost | null => {
      try {
        const raw = readFileSync(join(dir, file), 'utf8')
        const { meta, body } = parseFrontmatter(raw)
        return {
          id: `local:${file}`,
          // Falling back to the filename means a post with no frontmatter at
          // all still shows up with a sensible title rather than being skipped.
          title: meta.title || file.replace(/\.md$/, '').replace(/[-_]/g, ' '),
          summary: meta.summary || firstParagraph(body),
          body,
          date: meta.date || new Date().toISOString().slice(0, 10),
          tag: meta.tag || '',
          image: meta.image || null,
          link: meta.link || null,
          pinned: meta.pinned === 'true',
          source: 'local' as const,
          sourceName: 'You',
          file
        }
      } catch {
        return null
      }
    })
    .filter((p): p is NewsPost => p !== null)
}

/** Turn a title into a stable, readable filename. */
function slugFor(title: string, date: string): string {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'post'
  return `${date}-${slug}.md`
}

export interface DraftPost {
  title: string
  body: string
  date?: string
  tag?: string
  summary?: string
  image?: string
  link?: string
  pinned?: boolean
  /** Set when editing, so the original file is replaced rather than duplicated. */
  file?: string
}

export function savePost(draft: DraftPost): NewsPost {
  if (!draft.title.trim()) throw new Error('A post needs a title.')

  const date = (draft.date || new Date().toISOString().slice(0, 10)).trim()
  const dir = newsDir()
  const filename = draft.file ?? slugFor(draft.title, date)

  const front: string[] = [`title: ${draft.title.trim()}`, `date: ${date}`]
  if (draft.tag?.trim()) front.push(`tag: ${draft.tag.trim()}`)
  if (draft.summary?.trim()) front.push(`summary: ${draft.summary.trim()}`)
  if (draft.image?.trim()) front.push(`image: ${draft.image.trim()}`)
  if (draft.link?.trim()) front.push(`link: ${draft.link.trim()}`)
  if (draft.pinned) front.push('pinned: true')

  const contents = `---\n${front.join('\n')}\n---\n\n${draft.body.trim()}\n`
  writeFileSync(join(dir, filename), contents, 'utf8')

  // If the title changed, the old file would otherwise linger as a duplicate.
  const expected = slugFor(draft.title, date)
  if (draft.file && draft.file !== expected && existsSync(join(dir, draft.file))) {
    // Only rename when the target is free, so an existing post is never clobbered.
    if (!existsSync(join(dir, expected))) {
      writeFileSync(join(dir, expected), contents, 'utf8')
      rmSync(join(dir, draft.file), { force: true })
    }
  }

  return listLocal().find((p) => p.title === draft.title.trim()) ?? listLocal()[0]
}

export function deletePost(file: string): void {
  // Refuse anything that is not a plain filename in the news folder.
  if (file.includes('/') || file.includes('\\') || file.includes('..')) {
    throw new Error('Invalid post name.')
  }
  rmSync(join(newsDir(), file), { force: true })
}

/** Drop an example post in on first run, so the format is self-explanatory. */
export function seedExample(): void {
  const dir = newsDir()
  if (readdirSync(dir).some((f) => f.endsWith('.md'))) return
  writeFileSync(join(dir, 'README-example.md'), EXAMPLE_POST, 'utf8')
}

// --- Remote feeds -----------------------------------------------------------

interface RemoteEntry {
  id?: string
  title?: string
  summary?: string
  body?: string
  date?: string
  tag?: string
  image?: string
  link?: string
  pinned?: boolean
}

/**
 * Fetch a subscribed JSON feed.
 *
 * The shape is intentionally the same as a local post, so publishing is just
 * "put your posts in an array in a file somewhere public".
 */
async function fetchFeed(name: string, url: string): Promise<NewsPost[]> {
  const data = await fetchJsonCached<RemoteEntry[] | { posts: RemoteEntry[] }>(url, 10 * 60 * 1000)
  const entries = Array.isArray(data) ? data : (data?.posts ?? [])
  if (!Array.isArray(entries)) return []

  return entries.slice(0, 50).map((entry, index) => ({
    id: `remote:${url}:${entry.id ?? index}`,
    title: entry.title ?? 'Untitled',
    summary: entry.summary ?? '',
    body: entry.body ?? '',
    date: entry.date ?? '',
    tag: entry.tag ?? '',
    image: entry.image ?? null,
    link: entry.link ?? null,
    pinned: Boolean(entry.pinned),
    source: 'remote' as const,
    sourceName: name
  }))
}

// --- Mojang patch notes -----------------------------------------------------

const MOJANG_BASE = 'https://launchercontent.mojang.com'
const PATCH_NOTES = `${MOJANG_BASE}/v2/javaPatchNotes.json`

interface PatchNote {
  title: string
  version: string
  type: string
  id: string
  date?: string
  shortText?: string
  image?: { url?: string }
}

async function fetchMojang(limit = 15): Promise<NewsPost[]> {
  const data = await fetchJsonCached<{ entries: PatchNote[] }>(PATCH_NOTES, 30 * 60 * 1000)
  return (data.entries ?? []).slice(0, limit).map((entry) => ({
    id: `mojang:${entry.id}`,
    title: entry.title,
    summary: entry.shortText ?? '',
    body: '',
    date: entry.date ?? '',
    tag: entry.type === 'snapshot' ? 'Snapshot' : 'Release',
    // Image urls in the feed are relative to the content host.
    image: entry.image?.url ? `${MOJANG_BASE}${entry.image.url}` : null,
    link: `https://www.minecraft.net/article/minecraft-${entry.type}-${entry.version.replace(/\./g, '-')}`,
    pinned: false,
    source: 'mojang' as const,
    sourceName: 'Minecraft'
  }))
}

// --- Aggregation ------------------------------------------------------------

export interface NewsResult {
  posts: NewsPost[]
  errors: { source: string; reason: string }[]
}

export async function loadAll(): Promise<NewsResult> {
  const settings = getSettings()
  const errors: NewsResult['errors'] = []

  const local = listLocal()

  const remote: NewsPost[] = []
  for (const feed of settings.news.feeds.filter((f) => f.enabled)) {
    try {
      remote.push(...(await fetchFeed(feed.name, feed.url)))
    } catch (err) {
      // One unreachable feed must not hide the others, or the user's own posts.
      errors.push({ source: feed.name, reason: err instanceof Error ? err.message : String(err) })
    }
  }

  let mojang: NewsPost[] = []
  if (settings.news.showMojang) {
    try {
      mojang = await fetchMojang()
    } catch (err) {
      errors.push({ source: 'Minecraft patch notes', reason: err instanceof Error ? err.message : String(err) })
    }
  }

  // Pinned first, then newest. Undated posts sort last rather than to the top,
  // which is what an empty string would otherwise do.
  const posts = [...local, ...remote, ...mojang].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    if (!a.date) return 1
    if (!b.date) return -1
    return b.date.localeCompare(a.date)
  })

  return { posts, errors }
}
