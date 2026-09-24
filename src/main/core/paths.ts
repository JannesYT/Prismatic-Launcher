import { app } from 'electron'
import { join, resolve, sep } from 'node:path'
import { mkdirSync } from 'node:fs'

/**
 * Prism-style layout: one shared asset/library store, instances kept separate so
 * they can be zipped and moved around individually.
 */
const root = app.getPath('userData')

export const paths = {
  root,
  settings: join(root, 'prismatic.json'),
  accounts: join(root, 'accounts.json'),
  instances: join(root, 'instances'),
  /** Shared between every instance — this is what keeps disk usage sane. */
  assets: join(root, 'assets'),
  assetObjects: join(root, 'assets', 'objects'),
  assetIndexes: join(root, 'assets', 'indexes'),
  libraries: join(root, 'libraries'),
  versions: join(root, 'versions'),
  natives: join(root, 'natives'),
  java: join(root, 'java'),
  icons: join(root, 'icons'),
  cache: join(root, 'cache'),
  logs: join(root, 'logs')
}

export function ensureDirs(): void {
  for (const p of [
    paths.instances,
    paths.assetObjects,
    paths.assetIndexes,
    paths.libraries,
    paths.versions,
    paths.natives,
    paths.java,
    paths.icons,
    paths.cache,
    paths.logs
  ]) {
    mkdirSync(p, { recursive: true })
  }
}

export function instanceDir(id: string): string {
  return join(paths.instances, id)
}

/** The folder Minecraft itself treats as its game directory. */
export function gameDir(id: string): string {
  return join(paths.instances, id, '.minecraft')
}

/**
 * Join a path from an untrusted archive entry, refusing anything that escapes
 * `baseDir`.
 *
 * Modpacks and instance archives are arbitrary files downloaded from the
 * internet, and a zip entry may be named `../../../evil` or be an absolute
 * path. Joining that straight onto a destination ("zip slip") lets an archive
 * overwrite files anywhere the launcher can write. Every destination derived
 * from an entry name must go through here.
 */
export function safeJoin(baseDir: string, entryName: string): string {
  // Normalise separators and strip any drive letter or leading slash so the
  // entry can only ever be interpreted as relative.
  const relative = entryName.replace(/\\/g, '/').replace(/^([a-zA-Z]:)?\/+/, '')
  const target = resolve(baseDir, relative)
  const base = resolve(baseDir)
  if (target !== base && !target.startsWith(base + sep)) {
    throw new Error(`Archive entry "${entryName}" tries to write outside the target folder.`)
  }
  return target
}

/** Maven coordinate -> repo-relative path. `group:artifact:version[:classifier]` */
export function mavenPath(coord: string): string {
  const [name, ext = 'jar'] = coord.split('@')
  const parts = name.split(':')
  const [group, artifact, version] = parts
  const classifier = parts[3]
  const file = classifier
    ? `${artifact}-${version}-${classifier}.${ext}`
    : `${artifact}-${version}.${ext}`
  return join(...group.split('.'), artifact, version, file)
}

export function libraryPath(coord: string): string {
  return join(paths.libraries, mavenPath(coord))
}
