import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { gameDir } from './paths'
import { getSettings } from './settings'
import { readInstance } from './instances'
import { listInstalledMods, projectVersions, installContent } from './content'

export interface SeedResult {
  installed: string[]
  skipped: { name: string; reason: string }[]
}

/**
 * Compare a Modrinth slug against what a jar actually is.
 *
 * Needed because an imported modpack's mods never pass through our content
 * index — `importMrpack` downloads them straight from the pack manifest — so
 * provenance is unavailable and the only evidence is the jar itself.
 *
 * Both sides are reduced to letters and digits so "fabric-api",
 * "fabric_api-0.119.4+1.21.4.jar" and the mod id "fabric-api" all converge.
 */
function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * The name part of a jar filename, with the version stripped.
 *
 * "fabric-api-0.119.4+1.21.4.jar" -> "fabric-api"
 * "irisshaders-compat.jar"        -> "irisshaders-compat"  (no version to cut)
 *
 * The cut is made at the first separator followed by a digit, which is where
 * every mod's version starts in practice.
 */
function filenameBase(filename: string): string {
  return filename
    .replace(/\.disabled$/i, '')
    .replace(/\.jar$/i, '')
    .replace(/[-_+ ]v?\d.*$/i, '')
}

function alreadyPresent(
  slug: string,
  mods: ReturnType<typeof listInstalledMods>
): string | null {
  const wanted = normalise(slug)
  for (const mod of mods) {
    // Strongest evidence: we installed it ourselves and recorded where from.
    if (mod.provider?.projectId === slug) return mod.filename
    // Then the name parsed out of the jar's own metadata.
    if (normalise(mod.name) === wanted) return mod.filename
    // Finally the filename, compared exactly against its de-versioned base.
    // A prefix match would be wrong here: "sodium-extra" starts with "sodium"
    // but is a different mod, and skipping it would silently deny the mod that
    // was actually asked for.
    if (normalise(filenameBase(mod.filename)) === wanted) return mod.filename
  }
  return null
}

/**
 * Install the configured default mods into an instance.
 *
 * Deliberately conservative about duplicates: two copies of the same mod is a
 * hard crash on launch, while a skipped mod is a line in a toast. When the
 * evidence is ambiguous it skips and says so, rather than risking the former.
 */
export async function applyDefaultMods(
  instanceId: string,
  onProgress?: (label: string) => void
): Promise<SeedResult> {
  const result: SeedResult = { installed: [], skipped: [] }
  const settings = getSettings()
  const inst = readInstance(instanceId)
  if (!inst) return result

  // Vanilla has no loader, so there is nowhere for a mod to go.
  if (inst.loader === 'vanilla') return result

  const existing = listInstalledMods(instanceId)

  for (const slug of settings.newInstance.modrinthSlugs) {
    const duplicate = alreadyPresent(slug, existing)
    if (duplicate) {
      result.skipped.push({ name: slug, reason: `already in the pack as ${duplicate}` })
      continue
    }

    onProgress?.(`Installing ${slug}`)
    try {
      const versions = await projectVersions('modrinth', slug, inst.mcVersion, inst.loader)
      const best = versions.find((v) => v.channel === 'release') ?? versions[0]
      if (!best) {
        result.skipped.push({ name: slug, reason: `no build for ${inst.mcVersion} / ${inst.loader}` })
        continue
      }
      await installContent(instanceId, 'mod', 'modrinth', slug, best)
      result.installed.push(slug)
    } catch (err) {
      result.skipped.push({ name: slug, reason: err instanceof Error ? err.message : String(err) })
    }
  }

  const modsDir = join(gameDir(instanceId), 'mods')
  for (const jar of settings.newInstance.localJars) {
    const filename = jar.split(/[\\/]/).pop()
    if (!filename) continue

    if (!existsSync(jar)) {
      result.skipped.push({ name: filename, reason: 'file no longer exists' })
      continue
    }
    const duplicate = alreadyPresent(filename.replace(/\.jar$/i, ''), existing)
    if (duplicate) {
      result.skipped.push({ name: filename, reason: `already in the pack as ${duplicate}` })
      continue
    }

    onProgress?.(`Copying ${filename}`)
    try {
      mkdirSync(modsDir, { recursive: true })
      copyFileSync(jar, join(modsDir, filename))
      result.installed.push(filename)
    } catch (err) {
      result.skipped.push({ name: filename, reason: err instanceof Error ? err.message : String(err) })
    }
  }

  return result
}

/** Whether defaults should be applied for this situation. */
export function shouldSeed(kind: 'instance' | 'pack', override?: boolean): boolean {
  const settings = getSettings()
  if (override !== undefined) return override
  if (!settings.newInstance.installDefaults) return false
  return kind === 'instance' || settings.newInstance.applyToPacks
}
