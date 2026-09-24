import { execFile } from 'node:child_process'
import { existsSync, readdirSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { homedir, platform } from 'node:os'
import { promisify } from 'node:util'
import AdmZip from 'adm-zip'
import { paths } from './paths'
import { downloadOne, fetchJson } from './net'
import { osArch } from './mojang'

const run = promisify(execFile)

export interface JavaInstall {
  path: string
  version: string
  major: number
  vendor: string
  arch: string
  /** True when Prismatic downloaded it rather than finding it on the system. */
  managed: boolean
}

const EXE = platform() === 'win32' ? 'java.exe' : 'java'

/** Common install roots per OS, searched one level deep for JDK/JRE folders. */
function candidateRoots(): string[] {
  const home = homedir()
  if (platform() === 'win32') {
    return [
      'C:\\Program Files\\Java',
      'C:\\Program Files\\Eclipse Adoptium',
      'C:\\Program Files\\Microsoft',
      'C:\\Program Files\\Amazon Corretto',
      'C:\\Program Files\\Zulu',
      'C:\\Program Files\\BellSoft',
      'C:\\Program Files (x86)\\Java',
      join(home, '.jdks'),
      join(home, 'scoop', 'apps'),
      join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Eclipse Adoptium')
    ]
  }
  if (platform() === 'darwin') {
    return ['/Library/Java/JavaVirtualMachines', join(home, 'Library/Java/JavaVirtualMachines'), '/opt/homebrew/opt']
  }
  return ['/usr/lib/jvm', '/usr/java', '/opt/java', join(home, '.jdks'), '/snap']
}

function javaBinariesUnder(dir: string): string[] {
  const out: string[] = []
  if (!existsSync(dir)) return out
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    const base = join(dir, entry)
    // Both layouts: <root>/bin/java and macOS's <root>/Contents/Home/bin/java
    for (const rel of [join('bin', EXE), join('Contents', 'Home', 'bin', EXE), join('jre', 'bin', EXE)]) {
      const candidate = join(base, rel)
      if (existsSync(candidate)) out.push(candidate)
    }
  }
  return out
}

/** Parse `java -version` output (it goes to stderr, historically). */
export async function probeJava(binary: string): Promise<JavaInstall | null> {
  try {
    const { stdout, stderr } = await run(binary, ['-XshowSettings:properties', '-version'], { timeout: 8000 })
    const text = `${stdout}\n${stderr}`
    const versionLine = /java\.version = ([^\s]+)/.exec(text)?.[1] ?? /version "([^"]+)"/.exec(text)?.[1]
    if (!versionLine) return null
    const vendor = /java\.vendor = (.+)/.exec(text)?.[1]?.trim() ?? 'Unknown'
    const jarch = /os\.arch = (.+)/.exec(text)?.[1]?.trim() ?? osArch()
    // 1.8.0_402 -> 8; 17.0.9 -> 17
    const major = versionLine.startsWith('1.')
      ? Number(versionLine.split('.')[1])
      : Number(versionLine.split(/[.\-+]/)[0])
    return {
      path: binary,
      version: versionLine,
      major,
      vendor,
      arch: jarch,
      managed: binary.startsWith(paths.java)
    }
  } catch {
    return null
  }
}

export async function detectJava(): Promise<JavaInstall[]> {
  const seen = new Set<string>()
  const candidates: string[] = []

  const push = (p: string): void => {
    const key = p.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      candidates.push(p)
    }
  }

  for (const root of [...candidateRoots(), paths.java]) {
    for (const bin of javaBinariesUnder(root)) push(bin)
  }
  if (process.env.JAVA_HOME) push(join(process.env.JAVA_HOME, 'bin', EXE))
  // Whatever is on PATH.
  push(EXE)

  const probed = await Promise.all(candidates.map(probeJava))
  const installs = probed.filter((x): x is JavaInstall => x !== null)

  // Deduplicate by version+arch, preferring a real path over the bare "java".
  const byKey = new Map<string, JavaInstall>()
  for (const inst of installs) {
    const key = `${inst.version}|${inst.arch}`
    const existing = byKey.get(key)
    if (!existing || (existing.path === EXE && inst.path !== EXE)) byKey.set(key, inst)
  }
  return [...byKey.values()].sort((a, b) => b.major - a.major)
}

// --- Automatic provisioning via Adoptium -----------------------------------

function adoptiumOs(): string {
  const p = platform()
  return p === 'win32' ? 'windows' : p === 'darwin' ? 'mac' : 'linux'
}

function adoptiumArch(): string {
  const a = osArch()
  if (a === 'x86_64') return 'x64'
  if (a === 'arm64') return 'aarch64'
  if (a === 'x86') return 'x86'
  return a
}

interface AdoptiumAsset {
  binary: {
    package: { name: string; link: string; checksum: string; size: number }
    image_type: string
  }
  release_name: string
  version: { semver: string; major: number }
}

/**
 * Download and unpack a JRE for the requested major version into the managed
 * java folder, then return the resulting java binary.
 */
export async function provisionJava(major: number, onProgress?: (msg: string, frac: number | null) => void): Promise<JavaInstall> {
  const targetDir = join(paths.java, `jre-${major}`)
  const existing = javaBinariesUnder(paths.java).find((b) => b.includes(`jre-${major}`))
  if (existing) {
    const probe = await probeJava(existing)
    if (probe) return probe
  }

  onProgress?.(`Looking up a Java ${major} runtime`, null)
  const url =
    `https://api.adoptium.net/v3/assets/latest/${major}/hotspot` +
    `?os=${adoptiumOs()}&architecture=${adoptiumArch()}&image_type=jre&vendor=eclipse`
  const assets = await fetchJson<AdoptiumAsset[]>(url)
  const asset = assets.find((a) => a.binary.image_type === 'jre') ?? assets[0]
  if (!asset) throw new Error(`No Adoptium JRE available for Java ${major} on ${adoptiumOs()}/${adoptiumArch()}`)

  const pkg = asset.binary.package
  const archive = join(paths.cache, pkg.name)
  onProgress?.(`Downloading ${asset.release_name}`, 0)

  let received = 0
  await downloadOne({ url: pkg.link, dest: archive, size: pkg.size }, (n) => {
    received += n
    onProgress?.(`Downloading ${asset.release_name}`, pkg.size ? received / pkg.size : null)
  })

  onProgress?.(`Unpacking ${asset.release_name}`, null)
  rmSync(targetDir, { recursive: true, force: true })
  mkdirSync(targetDir, { recursive: true })

  if (pkg.name.endsWith('.zip')) {
    new AdmZip(archive).extractAllTo(targetDir, true)
  } else {
    // .tar.gz on macOS/Linux — tar is present on both.
    await run('tar', ['-xzf', archive, '-C', targetDir])
  }
  rmSync(archive, { force: true })

  const bin = javaBinariesUnder(targetDir)[0]
  if (!bin) throw new Error(`Unpacked Java ${major} but found no java binary under ${targetDir}`)
  const probe = await probeJava(bin)
  if (!probe) throw new Error(`Unpacked Java ${major} is not runnable`)
  return probe
}

/** Pick the best already-known install for a required major version. */
export function pickJava(installs: JavaInstall[], requiredMajor: number): JavaInstall | null {
  const arch64 = installs.filter((i) => i.arch !== 'x86')
  const pool = arch64.length ? arch64 : installs
  // Exact match first — Minecraft is picky, e.g. 1.16 hates Java 17.
  return (
    pool.find((i) => i.major === requiredMajor) ??
    pool.filter((i) => i.major > requiredMajor).sort((a, b) => a.major - b.major)[0] ??
    null
  )
}
