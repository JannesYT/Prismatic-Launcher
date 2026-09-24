import { spawn, exec, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { paths, gameDir } from './paths'
import { getSettings } from './settings'
import {
  installVersion,
  planVersion,
  resolveVersion,
  extractNatives,
  materialiseLegacyAssets,
  requiredJavaMajor,
  ruleMatches,
  type VersionJson
} from './mojang'
import { detectJava, pickJava, probeJava, provisionJava } from './java'
import { installLoader, loaderInstalled } from './loaders'
import { ensureToken } from './auth'
import { readInstance, launchVersionId, recordPlaySession } from './instances'
import type { Instance, LogLine } from '../../shared/types'

const CP_SEP = process.platform === 'win32' ? ';' : ':'

export interface RunningGame {
  instanceId: string
  pid: number
  startedAt: number
  exitCode: number | null
}

interface Session {
  child: ChildProcess
  instanceId: string
  startedAt: number
  seq: number
  buffer: string
}

/** Emits: 'log' (LogLine), 'state' (RunningGame[]), 'progress' ({label, detail, fraction}) */
export const launcher = new EventEmitter()

const sessions = new Map<string, Session>()

export function runningGames(): RunningGame[] {
  return [...sessions.values()].map((s) => ({
    instanceId: s.instanceId,
    pid: s.child.pid ?? -1,
    startedAt: s.startedAt,
    exitCode: null
  }))
}

function emitLog(instanceId: string, level: LogLine['level'], text: string, session?: Session): void {
  const line: LogLine = {
    instanceId,
    seq: session ? session.seq++ : 0,
    level,
    thread: '',
    text,
    at: Date.now()
  }
  launcher.emit('log', line)
}

/** Split raw stdout into lines and guess a level from Minecraft's text format. */
function ingest(session: Session, chunk: string, fallback: LogLine['level']): void {
  session.buffer += chunk
  const lines = session.buffer.split(/\r?\n/)
  session.buffer = lines.pop() ?? ''
  for (const raw of lines) {
    if (!raw.trim()) continue
    const match = /\[[^\]]*\]\s*\[([^\]]*?)\/(TRACE|DEBUG|INFO|WARN|ERROR|FATAL)\]/.exec(raw)
    let level: LogLine['level'] = fallback
    let thread = ''
    if (match) {
      thread = match[1]
      level = match[2] as LogLine['level']
    } else if (/\bWARN(ING)?\b/.test(raw)) level = 'WARN'
    else if (/\b(ERROR|Exception|SEVERE)\b/.test(raw) || raw.startsWith('\tat ')) level = 'ERROR'

    launcher.emit('log', {
      instanceId: session.instanceId,
      seq: session.seq++,
      level,
      thread,
      text: raw,
      at: Date.now()
    } satisfies LogLine)
  }
}

/** Resolve an effective value from instance overrides, falling back to globals. */
function effective(inst: Instance) {
  const s = getSettings()
  return {
    memory: inst.overrides.memory ?? s.java.memory,
    javaPath: inst.overrides.javaPath ?? s.java.path,
    jvmArgs: inst.overrides.jvmArgs ?? s.java.jvmArgs,
    window: inst.overrides.window ?? s.minecraft.window,
    commands: inst.overrides.commands ?? s.commands,
    env: { ...s.env, ...(inst.overrides.env ?? {}) },
    quickPlay: inst.overrides.quickPlay,
    showLog: inst.overrides.showLogAfterLaunch ?? s.minecraft.showLogAfterLaunch,
    closeLauncher: inst.overrides.closeLauncherOnLaunch ?? s.minecraft.closeLauncherOnLaunch
  }
}

/** Expand `${placeholder}` tokens in Mojang's argument templates. */
function substitute(template: string, vars: Record<string, string>): string {
  return template.replace(/\$\{([\w.]+)\}/g, (_, key: string) => vars[key] ?? `\${${key}}`)
}

function flattenArgs(
  entries: (string | { rules: import('./mojang').Rule[]; value: string | string[] })[] | undefined,
  features: Record<string, boolean>,
  vars: Record<string, string>
): string[] {
  const out: string[] = []
  for (const entry of entries ?? []) {
    if (typeof entry === 'string') {
      out.push(substitute(entry, vars))
      continue
    }
    if (!ruleMatches(entry.rules, features)) continue
    const values = Array.isArray(entry.value) ? entry.value : [entry.value]
    for (const v of values) out.push(substitute(v, vars))
  }
  return out
}

export interface LaunchOptions {
  instanceId: string
  accountId?: string
  /** Launch without checking/downloading files — for a quick relaunch. */
  offline?: boolean
  /** Join a server directly. */
  server?: string
}

function progress(label: string, detail: string, fraction: number | null): void {
  launcher.emit('progress', { label, detail, fraction })
}

export async function launch(opts: LaunchOptions): Promise<RunningGame> {
  const inst = readInstance(opts.instanceId)
  if (!inst) throw new Error(`No such instance: ${opts.instanceId}`)
  if (sessions.has(inst.id)) throw new Error(`${inst.name} is already running`)

  const settings = getSettings()
  const eff = effective(inst)
  const dir = gameDir(inst.id)
  mkdirSync(dir, { recursive: true })

  emitLog(inst.id, 'LAUNCHER', `Preparing ${inst.name} (Minecraft ${inst.mcVersion}, ${inst.loader})`)

  // 1. Account -------------------------------------------------------------
  progress('Authenticating', 'Refreshing session', null)
  const session = await ensureToken(opts.accountId)
  emitLog(inst.id, 'LAUNCHER', `Playing as ${session.username} (${session.type})`)

  // 2. Java ----------------------------------------------------------------
  progress('Checking Java', '', null)
  const vanillaInfo = await resolveVersion(inst.mcVersion)
  const needMajor = requiredJavaMajor(vanillaInfo)

  let javaBinary: string
  if (eff.javaPath) {
    javaBinary = eff.javaPath
  } else {
    const installs = await detectJava()
    const chosen = pickJava(installs, needMajor)
    if (chosen) {
      javaBinary = chosen.path
      emitLog(inst.id, 'LAUNCHER', `Using Java ${chosen.version} (${chosen.vendor}) at ${chosen.path}`)
    } else if (settings.java.autoDownload) {
      emitLog(inst.id, 'LAUNCHER', `No Java ${needMajor} found; downloading one`)
      const provisioned = await provisionJava(needMajor, (msg, frac) => progress('Java runtime', msg, frac))
      javaBinary = provisioned.path
    } else {
      throw new Error(
        `Minecraft ${inst.mcVersion} needs Java ${needMajor}, which isn't installed. ` +
          `Enable automatic Java downloads in Settings, or set a Java path manually.`
      )
    }
  }

  if (!settings.java.skipCompatChecks) {
    const probe = await probeJava(javaBinary)
    if (!probe) throw new Error(`${javaBinary} is not a working Java runtime`)
    if (probe.major < needMajor) {
      throw new Error(
        `Minecraft ${inst.mcVersion} requires Java ${needMajor} but ${javaBinary} is Java ${probe.major}. ` +
          `Change it in the instance's Java settings, or disable compatibility checks.`
      )
    }
    if (probe.arch === 'x86') {
      emitLog(inst.id, 'WARN', '32-bit Java detected — memory above ~1.5 GB will fail to allocate.')
    }
  }

  // 3. Loader --------------------------------------------------------------
  let versionId = launchVersionId(inst)
  if (inst.loader !== 'vanilla' && inst.loaderVersion && !loaderInstalled(versionId)) {
    progress('Installing loader', `${inst.loader} ${inst.loaderVersion}`, null)
    const result = await installLoader(inst.loader, inst.mcVersion, inst.loaderVersion, javaBinary, (msg, frac) =>
      progress('Installing loader', msg, frac)
    )
    versionId = result.versionId
  }

  // 4. Game files ----------------------------------------------------------
  let plan: Awaited<ReturnType<typeof installVersion>>
  if (opts.offline) {
    plan = await planVersion(versionId)
  } else {
    plan = await installVersion(versionId, (p) =>
      progress(p.phase, `${p.done}/${p.total}`, p.total ? p.done / p.total : null)
    )
  }

  // 5. Natives -------------------------------------------------------------
  const nativesDir = join(paths.natives, versionId)
  progress('Unpacking natives', '', null)
  extractNatives(plan.nativeJars, nativesDir)

  // 6. Legacy assets -------------------------------------------------------
  if (plan.legacyAssets) {
    progress('Preparing legacy assets', '', null)
    materialiseLegacyAssets(plan.assetsIndexId, join(dir, 'resources'))
  }

  // 7. Build the command line ---------------------------------------------
  const version = plan.version
  const classpath = [...plan.classpath, plan.clientJar].filter((p) => existsSync(p))
  const features: Record<string, boolean> = {
    is_demo_user: false,
    has_custom_resolution: true,
    has_quick_plays_support: Boolean(eff.quickPlay || opts.server),
    is_quick_play_singleplayer: eff.quickPlay?.type === 'singleplayer',
    is_quick_play_multiplayer: Boolean(opts.server) || eff.quickPlay?.type === 'multiplayer',
    is_quick_play_realms: eff.quickPlay?.type === 'realms'
  }

  const vars: Record<string, string> = {
    auth_player_name: session.username,
    version_name: version.id,
    game_directory: dir,
    assets_root: plan.assetsRoot,
    game_assets: join(dir, 'resources'),
    assets_index_name: plan.assetsIndexId,
    auth_uuid: session.uuid.replace(/-/g, ''),
    auth_access_token: session.accessToken,
    auth_session: `token:${session.accessToken}:${session.uuid.replace(/-/g, '')}`,
    auth_xuid: session.xuid,
    clientid: '',
    user_type: session.type === 'msa' ? 'msa' : 'legacy',
    version_type: version.type ?? 'release',
    user_properties: '{}',
    natives_directory: nativesDir,
    launcher_name: 'prismatic',
    launcher_version: '0.1.0',
    classpath: classpath.join(CP_SEP),
    classpath_separator: CP_SEP,
    library_directory: paths.libraries,
    resolution_width: String(eff.window.width),
    resolution_height: String(eff.window.height),
    quickPlayPath: join(dir, 'quickPlay.json'),
    quickPlaySingleplayer: eff.quickPlay?.type === 'singleplayer' ? eff.quickPlay.target : '',
    quickPlayMultiplayer: opts.server ?? (eff.quickPlay?.type === 'multiplayer' ? eff.quickPlay.target : ''),
    quickPlayRealms: eff.quickPlay?.type === 'realms' ? eff.quickPlay.target : ''
  }

  const jvmArgs: string[] = []
  jvmArgs.push(`-Xms${eff.memory.min}M`, `-Xmx${eff.memory.max}M`)
  if (eff.jvmArgs.trim()) jvmArgs.push(...tokenize(eff.jvmArgs));

  // Mojang's own JVM args (module path, natives, macOS -XstartOnFirstThread...)
  if (version.arguments?.jvm?.length) {
    jvmArgs.push(...flattenArgs(version.arguments.jvm, features, vars))
  } else {
    // Pre-1.13 versions have no jvm arg block.
    jvmArgs.push(`-Djava.library.path=${nativesDir}`, '-cp', vars.classpath)
  }
  if (version.logging?.client) {
    const configFile = join(paths.assets, 'log_configs', version.logging.client.file.id)
    if (existsSync(configFile)) {
      jvmArgs.push(substitute(version.logging.client.argument, { path: configFile }))
    }
  }
  if (settings.minecraft.useNativeGLFW) jvmArgs.push('-Dorg.lwjgl.glfw.libname=glfw')
  if (settings.minecraft.useNativeOpenAL) jvmArgs.push('-Dorg.lwjgl.openal.libname=openal')

  const gameArgs = version.minecraftArguments
    ? tokenize(substitute(version.minecraftArguments, vars))
    : flattenArgs(version.arguments?.game, features, vars)

  if (eff.window.fullscreen) gameArgs.push('--fullscreen')
  if (opts.server && !gameArgs.includes('--quickPlayMultiplayer')) {
    const [host, port] = opts.server.split(':')
    gameArgs.push('--server', host)
    if (port) gameArgs.push('--port', port)
  }

  const fullArgs = [...jvmArgs, version.mainClass, ...gameArgs]

  // 8. Pre-launch command --------------------------------------------------
  if (eff.commands.pre.trim()) {
    emitLog(inst.id, 'LAUNCHER', `Pre-launch: ${eff.commands.pre}`)
    await runHook(substitute(eff.commands.pre, vars), dir, eff.env)
  }

  // 9. Spawn ---------------------------------------------------------------
  let command = javaBinary
  let args = fullArgs
  if (eff.commands.wrapper.trim()) {
    const wrapper = tokenize(substitute(eff.commands.wrapper, vars))
    command = wrapper[0]
    args = [...wrapper.slice(1), javaBinary, ...fullArgs]
  }

  emitLog(inst.id, 'LAUNCHER', `Launching: ${command} ${args.length} args, mainClass ${version.mainClass}`)
  progress('Launching', inst.name, 1)

  const child = spawn(command, args, {
    cwd: dir,
    env: { ...process.env, ...eff.env },
    windowsHide: false
  })

  const gameSession: Session = { child, instanceId: inst.id, startedAt: Date.now(), seq: 1, buffer: '' }
  sessions.set(inst.id, gameSession)
  launcher.emit('state', runningGames())

  child.stdout?.setEncoding('utf8')
  child.stderr?.setEncoding('utf8')
  child.stdout?.on('data', (c: string) => ingest(gameSession, c, 'INFO'))
  child.stderr?.on('data', (c: string) => ingest(gameSession, c, 'ERROR'))

  child.on('error', (err) => {
    emitLog(inst.id, 'FATAL', `Failed to start Java: ${err.message}`, gameSession)
    sessions.delete(inst.id)
    launcher.emit('state', runningGames())
  })

  child.on('exit', async (code, signal) => {
    const seconds = (Date.now() - gameSession.startedAt) / 1000
    if (gameSession.buffer.trim()) ingest(gameSession, '\n', 'INFO')
    emitLog(
      inst.id,
      code === 0 ? 'LAUNCHER' : 'ERROR',
      `Game exited with code ${code}${signal ? ` (signal ${signal})` : ''} after ${Math.round(seconds)}s`,
      gameSession
    )
    if (code !== 0 && code !== null) {
      emitLog(inst.id, 'LAUNCHER', explainExitCode(code), gameSession)
    }
    sessions.delete(inst.id)
    recordPlaySession(inst.id, seconds)
    launcher.emit('state', runningGames())
    launcher.emit('exit', { instanceId: inst.id, code })

    if (eff.commands.post.trim()) {
      await runHook(substitute(eff.commands.post, vars), dir, eff.env).catch(() => {})
    }
  })

  return { instanceId: inst.id, pid: child.pid ?? -1, startedAt: gameSession.startedAt, exitCode: null }
}

/** Split a command string on whitespace, honouring double quotes. */
function tokenize(input: string): string[] {
  const out: string[] = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(input))) out.push(m[1] ?? m[2] ?? m[3])
  return out
}

function runHook(command: string, cwd: string, env: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    exec(command, { cwd, env: { ...process.env, ...env }, windowsHide: true }, (err) =>
      err ? reject(err) : resolve()
    )
  })
}

function explainExitCode(code: number): string {
  if (code === 1) return 'Exit code 1 usually means a crash — check the log above for the first ERROR line.'
  if (code === 3221225477 || code === -1073741819) return 'Access violation (0xC0000005) — usually a broken graphics driver or a native mod.'
  if (code === 137) return 'Killed by the OS (SIGKILL) — most often the out-of-memory killer. Lower the max memory.'
  if (code === 134) return 'Aborted — a JVM crash. Look for hs_err_pid*.log in the instance folder.'
  return `Exit code ${code}.`
}

export function killGame(instanceId: string): boolean {
  const session = sessions.get(instanceId)
  if (!session) return false
  emitLog(instanceId, 'LAUNCHER', 'Killing the game process', session)
  if (process.platform === 'win32' && session.child.pid) {
    // A JVM launched via a wrapper can leave orphans; taskkill the tree.
    exec(`taskkill /pid ${session.child.pid} /T /F`)
  } else {
    session.child.kill('SIGTERM')
    setTimeout(() => session.child.kill('SIGKILL'), 4000)
  }
  return true
}
