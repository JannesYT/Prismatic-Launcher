import { createHash } from 'node:crypto'
import {
  createReadStream,
  createWriteStream,
  existsSync,
  statSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs'
import { rename, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { paths } from './paths'
import { getSettings } from './settings'

export interface DownloadSpec {
  url: string
  dest: string
  sha1?: string
  size?: number
  /** Skip the download entirely if the file already matches. Default true. */
  cacheable?: boolean
}

export interface Progress {
  done: number
  total: number
  bytesDone: number
  bytesTotal: number
  current: string
}

const MIRRORS: Record<string, [RegExp, string][]> = {
  bmclapi: [
    [/^https?:\/\/(piston-meta|launchermeta)\.mojang\.com/, 'https://bmclapi2.bangbang93.com'],
    [/^https?:\/\/piston-data\.mojang\.com/, 'https://bmclapi2.bangbang93.com'],
    [/^https?:\/\/launcher\.mojang\.com/, 'https://bmclapi2.bangbang93.com'],
    [/^https?:\/\/resources\.download\.minecraft\.net/, 'https://bmclapi2.bangbang93.com/assets'],
    [/^https?:\/\/libraries\.minecraft\.net/, 'https://bmclapi2.bangbang93.com/maven'],
    [/^https?:\/\/maven\.minecraftforge\.net/, 'https://bmclapi2.bangbang93.com/maven'],
    [/^https?:\/\/meta\.fabricmc\.net/, 'https://bmclapi2.bangbang93.com/fabric-meta']
  ]
}

export function applyMirror(url: string): string {
  const mirror = getSettings().downloads.mirror
  if (mirror === 'official') return url
  for (const [pattern, replacement] of MIRRORS[mirror] ?? []) {
    if (pattern.test(url)) return url.replace(pattern, replacement)
  }
  return url
}

export const USER_AGENT = 'Prismatic/0.1.0 (github.com/jannes/prismatic)'

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(applyMirror(url), {
    ...init,
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...(init?.headers ?? {}) }
  })
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`)
  return (await res.json()) as T
}

export async function fetchText(url: string): Promise<string> {
  const res = await fetch(applyMirror(url), { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`)
  return await res.text()
}

/** Disk cache for metadata JSON that rarely changes (version manifests, loader lists). */
export async function fetchJsonCached<T>(url: string, ttlMs = 15 * 60 * 1000): Promise<T> {
  const key = createHash('sha1').update(url).digest('hex') + '.json'
  const file = join(paths.cache, key)
  if (existsSync(file)) {
    try {
      const { at, body } = JSON.parse(readFileSync(file, 'utf8'))
      if (Date.now() - at < ttlMs) return body as T
    } catch {
      /* fall through and refetch */
    }
  }
  const body = await fetchJson<T>(url)
  mkdirSync(paths.cache, { recursive: true })
  writeFileSync(file, JSON.stringify({ at: Date.now(), body }), 'utf8')
  return body
}

export function sha1File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha1')
    const stream = createReadStream(file)
    stream.on('data', (c) => hash.update(c))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

async function isUpToDate(spec: DownloadSpec): Promise<boolean> {
  if (spec.cacheable === false) return false
  if (!existsSync(spec.dest)) return false
  const stat = statSync(spec.dest)
  if (stat.size === 0) return false
  if (spec.size !== undefined && stat.size !== spec.size) return false
  if (spec.sha1 && getSettings().downloads.verifyHashes) {
    try {
      return (await sha1File(spec.dest)) === spec.sha1.toLowerCase()
    } catch {
      return false
    }
  }
  return true
}

/** Download one file to a temp path, verify, then atomically move into place. */
export async function downloadOne(spec: DownloadSpec, onBytes?: (n: number) => void): Promise<void> {
  if (await isUpToDate(spec)) {
    if (spec.size) onBytes?.(spec.size)
    return
  }
  mkdirSync(dirname(spec.dest), { recursive: true })
  const tmp = `${spec.dest}.part`

  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(applyMirror(spec.url), { headers: { 'User-Agent': USER_AGENT } })
      if (!res.ok || !res.body) throw new Error(`GET ${spec.url} -> ${res.status}`)

      const hash = createHash('sha1')
      const source = Readable.fromWeb(res.body as never)
      source.on('data', (chunk: Buffer) => {
        hash.update(chunk)
        onBytes?.(chunk.length)
      })
      await pipeline(source, createWriteStream(tmp))

      if (spec.sha1 && getSettings().downloads.verifyHashes) {
        const got = hash.digest('hex')
        if (got !== spec.sha1.toLowerCase()) {
          await unlink(tmp).catch(() => {})
          throw new Error(`Hash mismatch for ${spec.url}: expected ${spec.sha1}, got ${got}`)
        }
      }
      await rename(tmp, spec.dest)
      return
    } catch (err) {
      lastError = err
      await unlink(tmp).catch(() => {})
      // Back off a little before retrying transient network errors.
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)))
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

/** Download many files with bounded concurrency, reporting aggregate progress. */
export async function downloadAll(
  specs: DownloadSpec[],
  onProgress?: (p: Progress) => void,
  signal?: AbortSignal
): Promise<void> {
  const concurrency = Math.max(1, Math.min(32, getSettings().downloads.concurrency))
  const bytesTotal = specs.reduce((a, s) => a + (s.size ?? 0), 0)
  let done = 0
  let bytesDone = 0
  let cursor = 0
  let lastEmit = 0

  const emit = (current: string, force = false): void => {
    const now = Date.now()
    if (!force && now - lastEmit < 80) return
    lastEmit = now
    onProgress?.({ done, total: specs.length, bytesDone, bytesTotal, current })
  }

  const errors: Error[] = []
  const worker = async (): Promise<void> => {
    while (cursor < specs.length) {
      if (signal?.aborted) return
      const spec = specs[cursor++]
      try {
        await downloadOne(spec, (n) => {
          bytesDone += n
          emit(spec.dest)
        })
      } catch (err) {
        errors.push(err instanceof Error ? err : new Error(String(err)))
      }
      done++
      emit(spec.dest, true)
    }
  }

  emit('', true)
  await Promise.all(Array.from({ length: Math.min(concurrency, specs.length) }, worker))
  if (signal?.aborted) throw new Error('Cancelled')
  if (errors.length) {
    throw new Error(`${errors.length} download(s) failed. First: ${errors[0].message}`)
  }
}
