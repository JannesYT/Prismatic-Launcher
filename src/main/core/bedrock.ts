import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { shell } from 'electron'
import { getSettings, saveSettings } from './settings'

const run = promisify(execFile)

/**
 * Minecraft: Bedrock Edition.
 *
 * Bedrock on Windows is a Store (MSIX) app, which constrains what a launcher
 * can do with it far more than Java Edition:
 *
 *  - It cannot be given command-line arguments, so no per-instance settings,
 *    no memory tuning, no server auto-join.
 *  - It signs in through its own Xbox flow; an account chosen here cannot be
 *    handed to it.
 *  - Version switching means de-registering and re-registering MSIX packages
 *    under Developer Mode, which dedicated Bedrock launchers do and which is
 *    both out of scope here and easy to get badly wrong.
 *  - Mods (behaviour and resource packs) install into the app's own data
 *    folder, which is protected.
 *
 * So this module does the part that is genuinely useful and safe: find out
 * whether Bedrock is installed, and start it.
 */

export interface BedrockInstall {
  id: 'retail' | 'preview'
  name: string
  packageFamilyName: string
  version: string
}

const KNOWN: { id: BedrockInstall['id']; name: string; packageName: string; pfn: string }[] = [
  {
    id: 'retail',
    name: 'Minecraft for Windows',
    packageName: 'Microsoft.MinecraftUWP',
    pfn: 'Microsoft.MinecraftUWP_8wekyb3d8bbwe'
  },
  {
    id: 'preview',
    name: 'Minecraft Preview',
    packageName: 'Microsoft.MinecraftWindowsBeta',
    pfn: 'Microsoft.MinecraftWindowsBeta_8wekyb3d8bbwe'
  }
]

export function isSupported(): boolean {
  // Bedrock as a Store app exists only on Windows. macOS and Linux have no
  // equivalent to launch.
  return process.platform === 'win32'
}

/**
 * Ask Windows which Bedrock packages are registered for the current user.
 *
 * Get-AppxPackage is the supported way to query this; there is no stable
 * registry key to read instead.
 */
export async function detect(): Promise<BedrockInstall[]> {
  if (!isSupported()) return []

  const names = KNOWN.map((k) => k.packageName).join("','")
  const script =
    `$ErrorActionPreference='SilentlyContinue';` +
    `Get-AppxPackage -Name @('${names}') | ` +
    `Select-Object Name,PackageFamilyName,Version | ConvertTo-Json -Compress`

  try {
    const { stdout } = await run(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { timeout: 20_000, windowsHide: true }
    )

    const text = stdout.trim()
    if (!text) return []

    // ConvertTo-Json emits an object for one result and an array for several.
    const parsed = JSON.parse(text) as
      | { Name: string; PackageFamilyName: string; Version: string }
      | { Name: string; PackageFamilyName: string; Version: string }[]
    const rows = Array.isArray(parsed) ? parsed : [parsed]

    return rows
      .map((row) => {
        const known = KNOWN.find((k) => k.packageName === row.Name)
        if (!known) return null
        return {
          id: known.id,
          name: known.name,
          packageFamilyName: row.PackageFamilyName || known.pfn,
          version: row.Version ?? ''
        } satisfies BedrockInstall
      })
      .filter((x): x is BedrockInstall => x !== null)
  } catch {
    // A locked-down PowerShell policy or a missing appx module should read as
    // "not available" rather than breaking the instance list.
    return []
  }
}

/**
 * Start Bedrock.
 *
 * Launching goes through the AppsFolder shell path rather than the
 * `minecraft://` protocol: the protocol handler is also claimed by other
 * things and can be redirected, while the package family name addresses
 * exactly the app that was detected.
 */
export async function launch(preferPreview?: boolean): Promise<BedrockInstall> {
  if (!isSupported()) {
    throw new Error('Minecraft: Bedrock Edition is a Windows Store app, so it can only be launched on Windows.')
  }

  const installs = await detect()
  if (installs.length === 0) {
    throw new Error(
      'Minecraft: Bedrock Edition is not installed. Install it from the Microsoft Store, then try again.'
    )
  }

  const wantPreview = preferPreview ?? getSettings().bedrock.preferPreview
  const chosen =
    (wantPreview ? installs.find((i) => i.id === 'preview') : installs.find((i) => i.id === 'retail')) ??
    installs[0]

  const target = `shell:AppsFolder\\${chosen.packageFamilyName}!App`
  const result = await shell.openPath(target)
  if (result) {
    // openPath returns a non-empty string on failure.
    throw new Error(`Windows could not start ${chosen.name}: ${result}`)
  }

  const settings = getSettings()
  saveSettings({ bedrock: { ...settings.bedrock, lastPlayed: Date.now() } })
  return chosen
}

/** Open Bedrock's Store page, for when it is not installed. */
export async function openStorePage(): Promise<void> {
  await shell.openExternal('ms-windows-store://pdp/?productid=9NBLGGH2JHXJ')
}
