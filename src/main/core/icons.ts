import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { extname, join } from 'node:path'
import { paths } from './paths'

/**
 * User-supplied instance icons.
 *
 * Images are copied into the launcher's own icons folder rather than
 * referenced where they sit, so an instance keeps its icon after the original
 * is moved, renamed or deleted — and so exporting an instance can carry the
 * icon with it.
 */

const ALLOWED = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp'])

/** Refuse anything big enough to suggest it is not really an icon. */
const MAX_BYTES = 8 * 1024 * 1024

export interface StoredIcon {
  /** The value stored on an instance, e.g. "file:a1b2c3.png". */
  key: string
  /** Absolute path, for display through the prismatic-file protocol. */
  path: string
  sizeBytes: number
  addedAt: number
}

function iconsDir(): string {
  mkdirSync(paths.icons, { recursive: true })
  return paths.icons
}

export function importIcon(sourcePath: string): StoredIcon {
  if (!existsSync(sourcePath)) throw new Error('That file no longer exists.')

  const ext = extname(sourcePath).toLowerCase()
  if (!ALLOWED.has(ext)) {
    throw new Error(`${ext || 'That file'} is not an image. Use PNG, JPG, GIF, WebP, BMP or ICO.`)
  }

  const stat = statSync(sourcePath)
  if (stat.size > MAX_BYTES) {
    throw new Error(`That image is ${Math.round(stat.size / 1024 / 1024)} MB. Icons are limited to 8 MB.`)
  }

  // Name by content hash, so importing the same picture twice reuses one file
  // instead of filling the folder with duplicates.
  const hash = createHash('sha1').update(readFileSync(sourcePath)).digest('hex').slice(0, 16)
  const filename = `${hash}${ext}`
  const dest = join(iconsDir(), filename)
  if (!existsSync(dest)) copyFileSync(sourcePath, dest)

  return { key: `file:${filename}`, path: dest, sizeBytes: stat.size, addedAt: Date.now() }
}

export function listIcons(): StoredIcon[] {
  const dir = iconsDir()
  return readdirSync(dir)
    .filter((f) => ALLOWED.has(extname(f).toLowerCase()))
    .map((f) => {
      const full = join(dir, f)
      const stat = statSync(full)
      return { key: `file:${f}`, path: full, sizeBytes: stat.size, addedAt: stat.mtimeMs }
    })
    .sort((a, b) => b.addedAt - a.addedAt)
}

/** Resolve a stored icon key to a path, or null for a built-in glyph key. */
export function resolveIcon(key: string): string | null {
  if (!key.startsWith('file:')) return null
  const filename = key.slice('file:'.length)
  // Reject anything that tries to climb out of the icons folder.
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) return null
  const full = join(iconsDir(), filename)
  return existsSync(full) ? full : null
}

export function deleteIcon(key: string): void {
  const path = resolveIcon(key)
  if (path) rmSync(path, { force: true })
}
