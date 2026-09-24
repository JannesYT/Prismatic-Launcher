import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Play,
  Square,
  FolderOpen,
  Package,
  Globe2,
  Image,
  ScrollText,
  Coffee,
  StickyNote,
  Server,
  Trash2,
  Power,
  RefreshCw,
  Search,
  Palette,
  ArrowUpCircle,
  Plus,
  Upload
} from 'lucide-react'
import { AddModsSheet } from './AddModsSheet'
import { IconPicker, InstanceIcon } from '../components/InstanceIcon'
import { GlassButton } from '../components/Glass'
import { Badge, EmptyState, Field, GlassSwitch, Panel, Row, Segmented, SearchInput } from '../components/Controls'
import { SliderRow } from '../components/GlassSlider'
import { useStore } from '../state/store'
import { call } from '../lib/ipc'
import { formatBytes, formatDuration, formatRelative } from '../lib/appearance'
import type { InstalledMod, Instance, LogLine, ProjectVersion, WorldSave } from '../../../shared/types'

type Pane = 'overview' | 'mods' | 'packs' | 'worlds' | 'servers' | 'screenshots' | 'log' | 'java' | 'notes'

const PANES: { id: Pane; label: string; icon: React.JSX.Element }[] = [
  { id: 'overview', label: 'Overview', icon: <Package size={16} /> },
  { id: 'mods', label: 'Mods', icon: <Package size={16} /> },
  { id: 'packs', label: 'Resources', icon: <Palette size={16} /> },
  { id: 'worlds', label: 'Worlds', icon: <Globe2 size={16} /> },
  { id: 'servers', label: 'Servers', icon: <Server size={16} /> },
  { id: 'screenshots', label: 'Screenshots', icon: <Image size={16} /> },
  { id: 'log', label: 'Log', icon: <ScrollText size={16} /> },
  { id: 'java', label: 'Java and Memory', icon: <Coffee size={16} /> },
  { id: 'notes', label: 'Notes', icon: <StickyNote size={16} /> }
]

export function InstanceDetail({ id }: { id: string }): React.JSX.Element {
  const instances = useStore((s) => s.instances)
  const running = useStore((s) => s.running)
  const openDetail = useStore((s) => s.openInstanceDetail)
  const launch = useStore((s) => s.launch)
  const kill = useStore((s) => s.kill)
  const showLog = useStore((s) => s.settings?.minecraft.showLogAfterLaunch ?? true)

  const instance = instances.find((i) => i.id === id)
  const isRunning = running.some((r) => r.instanceId === id)
  const [pane, setPane] = useState<Pane>('overview')

  // Jump to the log when a launch starts, if that preference is on.
  useEffect(() => {
    if (isRunning && showLog) setPane('log')
  }, [isRunning, showLog])

  if (!instance) {
    return (
      <div className="view">
        <EmptyState
          icon={<Package size={28} />}
          title="Instance not found"
          text="It may have been deleted or renamed."
          action={
            <GlassButton variant="glass" onClick={() => openDetail(null)}>
              Back to instances
            </GlassButton>
          }
        />
      </div>
    )
  }

  const filteredPanes = PANES.filter((p) => p.id !== 'mods' || instance.loader !== 'vanilla')

  return (
    <div className="view">
      <div className="view__header">
        <GlassButton variant="quiet" iconOnly onClick={() => openDetail(null)} aria-label="Back">
          <ArrowLeft size={18} />
        </GlassButton>
        <InstanceIcon icon={instance.icon} size={40} className="instance-row__icon" />
        <div style={{ minWidth: 0 }}>
          <h1 className="view__title truncate">{instance.name}</h1>
          <p className="view__subtitle">
            Minecraft {instance.mcVersion}
            {instance.loader !== 'vanilla' && ` · ${instance.loader} ${instance.loaderVersion ?? ''}`}
            {instance.group && ` · ${instance.group}`}
          </p>
        </div>
        <div className="view__actions">
          <GlassButton variant="glass" iconOnly onClick={() => void call('instances:reveal', id)} aria-label="Open folder">
            <FolderOpen size={16} />
          </GlassButton>
          {isRunning ? (
            <GlassButton variant="danger" size="lg" onClick={() => void kill(id)}>
              <Square size={16} /> Stop
            </GlassButton>
          ) : (
            <GlassButton variant="prominent" size="lg" onClick={() => void launch(id)}>
              <Play size={17} /> Play
            </GlassButton>
          )}
        </div>
      </div>

      <div className="detail">
        <nav className="glass sidelist">
          {filteredPanes.map((p) => (
            <button key={p.id} className="sidelist__item" data-active={pane === p.id} onClick={() => setPane(p.id)}>
              {p.icon}
              {p.label}
            </button>
          ))}
        </nav>

        <div style={{ minWidth: 0 }}>
          {pane === 'overview' && <Overview instance={instance} />}
          {pane === 'mods' && <ModsPane instance={instance} />}
          {pane === 'packs' && <PacksPane instance={instance} />}
          {pane === 'worlds' && <WorldsPane instance={instance} />}
          {pane === 'servers' && <ServersPane instance={instance} />}
          {pane === 'screenshots' && <ScreenshotsPane instance={instance} />}
          {pane === 'log' && <LogPane instance={instance} />}
          {pane === 'java' && <JavaPane instance={instance} />}
          {pane === 'notes' && <NotesPane instance={instance} />}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function Overview({ instance }: { instance: Instance }): React.JSX.Element {
  const [size, setSize] = useState<number | null>(null)
  const refresh = useStore((s) => s.refreshInstances)
  const toast = useStore((s) => s.toast)

  useEffect(() => {
    void call<number>('instances:size', instance.id).then(setSize).catch(() => {})
  }, [instance.id])

  return (
    <>
      <Panel title="Overview">
        <div style={{ padding: 'var(--sp-3)' }}>
          <dl className="kv">
            <dt>Minecraft</dt>
            <dd>{instance.mcVersion}</dd>
            <dt>Mod loader</dt>
            <dd>
              {instance.loader === 'vanilla' ? (
                'None'
              ) : (
                <Badge tone={instance.loader}>
                  {instance.loader} {instance.loaderVersion}
                </Badge>
              )}
            </dd>
            <dt>Total play time</dt>
            <dd>{instance.totalPlaySeconds > 0 ? formatDuration(instance.totalPlaySeconds) : 'Never played'}</dd>
            <dt>Last played</dt>
            <dd>{formatRelative(instance.lastPlayed)}</dd>
            <dt>Created</dt>
            <dd>{new Date(instance.created).toLocaleDateString()}</dd>
            <dt>Disk usage</dt>
            <dd>{size === null ? 'Calculating…' : formatBytes(size)}</dd>
            {instance.pack && (
              <>
                <dt>Modpack</dt>
                <dd>
                  {instance.pack.name} ({instance.pack.platform})
                </dd>
              </>
            )}
          </dl>
        </div>
      </Panel>

      <Panel title="Icon" hint="Pick a glyph, or drop in your own image.">
        <div style={{ padding: 'var(--sp-3)' }}>
          <IconPicker
            value={instance.icon}
            onChange={(icon) => {
              void call('instances:update', instance.id, { icon }).then(() => refresh())
            }}
          />
        </div>
      </Panel>

      <Panel title="Rename and Group">
        <div className="stack" style={{ padding: 'var(--sp-3)', gap: 'var(--sp-3)' }}>
          <Field label="Name">
            <input
              className="input"
              defaultValue={instance.name}
              onBlur={(e) => {
                if (e.target.value.trim() && e.target.value !== instance.name) {
                  void call('instances:update', instance.id, { name: e.target.value.trim() })
                    .then(() => refresh())
                    .then(() => toast('success', 'Renamed'))
                }
              }}
            />
          </Field>
          <Field label="Group" hint="Instances with the same group name are collected together in the list.">
            <input
              className="input"
              defaultValue={instance.group ?? ''}
              placeholder="Ungrouped"
              onBlur={(e) => {
                void call('instances:update', instance.id, { group: e.target.value.trim() || null }).then(() => refresh())
              }}
            />
          </Field>
        </div>
      </Panel>

      <Panel title="Quick Play" hint="Join a world or server straight after launch. Needs Minecraft 1.20 or newer.">
        <Row label="Target type">
          <Segmented
            value={instance.overrides.quickPlay?.type ?? 'multiplayer'}
            onChange={(type) =>
              void call('instances:update', instance.id, {
                overrides: { quickPlay: { type, target: instance.overrides.quickPlay?.target ?? '' } }
              }).then(() => refresh())
            }
            options={[
              { value: 'multiplayer', label: 'Server' },
              { value: 'singleplayer', label: 'World' }
            ]}
            layoutId={`quickplay-${instance.id}`}
          />
        </Row>
        <Row label="Address or world folder">
          <input
            className="input mono"
            style={{ width: 240 }}
            defaultValue={instance.overrides.quickPlay?.target ?? ''}
            placeholder="mc.hypixel.net"
            onBlur={(e) =>
              void call('instances:update', instance.id, {
                overrides: {
                  quickPlay: e.target.value.trim()
                    ? { type: instance.overrides.quickPlay?.type ?? 'multiplayer', target: e.target.value.trim() }
                    : null
                }
              }).then(() => refresh())
            }
          />
        </Row>
      </Panel>
    </>
  )
}

// ---------------------------------------------------------------------------

function ModsPane({ instance }: { instance: Instance }): React.JSX.Element {
  const toast = useStore((s) => s.toast)
  const [mods, setMods] = useState<InstalledMod[]>([])
  const [query, setQuery] = useState('')
  const [updates, setUpdates] = useState<Record<string, ProjectVersion | null>>({})
  const [checking, setChecking] = useState(false)
  const [adding, setAdding] = useState(false)
  const [dropOver, setDropOver] = useState(false)

  const load = (): void => {
    void call<InstalledMod[]>('mods:list', instance.id).then(setMods).catch(() => {})
  }
  useEffect(load, [instance.id])

  const visible = useMemo(
    () => mods.filter((m) => !query || m.name.toLowerCase().includes(query.toLowerCase()) || m.filename.includes(query)),
    [mods, query]
  )
  const updatable = Object.values(updates).filter(Boolean).length

  const checkUpdates = (): void => {
    setChecking(true)
    void call<Record<string, ProjectVersion | null>>('mods:checkUpdates', instance.id, instance.mcVersion, instance.loader)
      .then((res) => {
        setUpdates(res)
        const count = Object.values(res).filter(Boolean).length
        toast(count > 0 ? 'info' : 'success', count > 0 ? `${count} update${count === 1 ? '' : 's'} available` : 'Everything is up to date')
      })
      .catch((err) => toast('error', 'Update check failed', String(err).replace(/^Error:\s*/, '')))
      .finally(() => setChecking(false))
  }

  /** Jars dropped straight onto the mods list. */
  const onDropFiles = (files: FileList): void => {
    const paths = Array.from(files)
      .map((f) => (f as File & { path?: string }).path)
      .filter((p): p is string => typeof p === 'string' && p.toLowerCase().endsWith('.jar'))

    if (paths.length === 0) {
      toast('error', 'No mod jars in that drop', 'Only .jar files can be installed this way.')
      return
    }
    void call<InstalledMod[]>('mods:addFiles', instance.id, paths)
      .then((next) => {
        setMods(next)
        toast('success', `Added ${paths.length} mod${paths.length === 1 ? '' : 's'}`)
      })
      .catch((err) => toast('error', 'Could not add those mods', String(err).replace(/^Error:\s*/, '')))
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDropOver(true)
      }}
      onDragLeave={() => setDropOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDropOver(false)
        if (e.dataTransfer.files.length) onDropFiles(e.dataTransfer.files)
      }}
      style={{
        outline: dropOver ? '2px dashed var(--accent)' : 'none',
        outlineOffset: 4,
        borderRadius: 'var(--r-xl)',
        transition: 'outline-color var(--dur-fast) var(--ease-out)'
      }}
    >
    <Panel
      title={`Mods (${mods.length})`}
      hint={
        mods.length === 0
          ? undefined
          : 'Disabling a mod renames its file with a .disabled suffix, so nothing is lost. You can also drag jars onto this list.'
      }
      actions={
        <div className="hstack">
          <SearchInput value={query} onChange={setQuery} placeholder="Filter mods" />
          <GlassButton variant="prominent" size="sm" onClick={() => setAdding(true)}>
            <Plus size={13} /> Add mods
          </GlassButton>
          <GlassButton
            variant="glass"
            size="sm"
            onClick={() =>
              void call<InstalledMod[]>('mods:addFiles', instance.id)
                .then(setMods)
                .catch((err) => toast('error', 'Could not add those mods', String(err)))
            }
          >
            <Upload size={13} /> From file
          </GlassButton>
          <GlassButton variant="glass" size="sm" onClick={checkUpdates} disabled={checking}>
            <RefreshCw size={13} className={checking ? 'spin' : undefined} /> Check updates
          </GlassButton>
          <GlassButton variant="quiet" size="sm" iconOnly aria-label="Open mods folder" onClick={() => void call('instances:reveal', instance.id, 'mods')}>
            <FolderOpen size={14} />
          </GlassButton>
        </div>
      }
    >
      {updatable > 0 && (
        <Row label={`${updatable} mod${updatable === 1 ? '' : 's'} can be updated`} desc="Updates are downloaded and the old jar is removed only after the new one lands.">
          <GlassButton
            variant="prominent"
            size="sm"
            onClick={() => {
              const jobs = Object.entries(updates)
                .filter(([, v]) => v)
                .map(([filename, version]) => call('mods:update', instance.id, filename, version))
              void Promise.allSettled(jobs).then(() => {
                load()
                setUpdates({})
                toast('success', 'Mods updated')
              })
            }}
          >
            <ArrowUpCircle size={13} /> Update all
          </GlassButton>
        </Row>
      )}

      {mods.length === 0 ? (
        <EmptyState
          icon={<Package size={26} />}
          title="No mods installed"
          text={`Search Modrinth and CurseForge for Minecraft ${instance.mcVersion} on ${instance.loader}, or drag jar files straight onto this list.`}
          action={
            <div className="hstack">
              <GlassButton variant="prominent" onClick={() => setAdding(true)}>
                <Plus size={14} /> Add mods
              </GlassButton>
              <GlassButton variant="glass" onClick={() => void call('instances:reveal', instance.id, 'mods')}>
                <FolderOpen size={14} /> Open folder
              </GlassButton>
            </div>
          }
        />
      ) : (
        visible.map((mod) => (
          <div className="row" key={mod.filename}>
            <span className="row__text">
              <span className="row__label" style={{ opacity: mod.enabled ? 1 : 0.5 }}>
                {mod.name} {mod.version && <span className="muted">{mod.version}</span>}
              </span>
              <span className="row__desc truncate">
                {mod.description || mod.filename}
                {mod.authors.length > 0 && ` — ${mod.authors.join(', ')}`}
              </span>
            </span>
            <span className="row__control">
              {updates[mod.filename] && <Badge tone="accent">Update</Badge>}
              {!mod.provider && <Badge>Local</Badge>}
              <span className="muted" style={{ fontSize: 'var(--fs-caption)', minWidth: 58, textAlign: 'right' }}>
                {formatBytes(mod.size)}
              </span>
              <GlassSwitch
                checked={mod.enabled}
                label={`Enable ${mod.name}`}
                onChange={() => void call<InstalledMod[]>('mods:toggle', instance.id, mod.filename).then(setMods)}
              />
              <GlassButton
                variant="danger"
                size="sm"
                iconOnly
                aria-label={`Delete ${mod.name}`}
                onClick={() =>
                  void call<boolean>('dialog:confirm', 'Delete mod', `Delete ${mod.name}?`).then((ok) => {
                    if (ok) void call<InstalledMod[]>('mods:delete', instance.id, mod.filename).then(setMods)
                  })
                }
              >
                <Trash2 size={13} />
              </GlassButton>
            </span>
          </div>
        ))
      )}
    </Panel>

    <AddModsSheet
      open={adding}
      instance={instance}
      onClose={() => {
        setAdding(false)
        load()
      }}
    />
    </div>
  )
}

// ---------------------------------------------------------------------------

function PacksPane({ instance }: { instance: Instance }): React.JSX.Element {
  const [kind, setKind] = useState<'resourcepacks' | 'shaderpacks'>('resourcepacks')
  const [files, setFiles] = useState<{ name: string; sizeBytes: number; enabled: boolean }[]>([])

  const load = (): void => {
    void call<typeof files>('packfiles:list', instance.id, kind).then(setFiles).catch(() => {})
  }
  useEffect(load, [instance.id, kind])

  return (
    <Panel
      title={kind === 'resourcepacks' ? 'Resource Packs' : 'Shader Packs'}
      actions={
        <div className="hstack">
          <Segmented
            value={kind}
            onChange={setKind}
            options={[
              { value: 'resourcepacks', label: 'Resource packs' },
              { value: 'shaderpacks', label: 'Shaders' }
            ]}
            layoutId="packs-kind"
          />
          <GlassButton variant="quiet" size="sm" iconOnly aria-label="Open folder" onClick={() => void call('instances:reveal', instance.id, kind)}>
            <FolderOpen size={14} />
          </GlassButton>
        </div>
      }
    >
      {files.length === 0 ? (
        <EmptyState
          icon={<Palette size={26} />}
          title={`No ${kind === 'resourcepacks' ? 'resource packs' : 'shader packs'}`}
          text="Install some from the Discover tab, or copy zip files into the folder."
        />
      ) : (
        files.map((file) => (
          <div className="row" key={file.name}>
            <span className="row__text">
              <span className="row__label" style={{ opacity: file.enabled ? 1 : 0.5 }}>
                {file.name.replace(/\.disabled$/, '')}
              </span>
              <span className="row__desc">{formatBytes(file.sizeBytes)}</span>
            </span>
            <span className="row__control">
              <GlassSwitch
                checked={file.enabled}
                label={`Enable ${file.name}`}
                onChange={() => void call<typeof files>('packfiles:toggle', instance.id, kind, file.name).then(setFiles)}
              />
              <GlassButton
                variant="danger"
                size="sm"
                iconOnly
                aria-label={`Delete ${file.name}`}
                onClick={() => void call<typeof files>('packfiles:delete', instance.id, kind, file.name).then(setFiles)}
              >
                <Trash2 size={13} />
              </GlassButton>
            </span>
          </div>
        ))
      )}
    </Panel>
  )
}

// ---------------------------------------------------------------------------

function WorldsPane({ instance }: { instance: Instance }): React.JSX.Element {
  const [worlds, setWorlds] = useState<WorldSave[]>([])
  const launch = useStore((s) => s.launch)

  useEffect(() => {
    void call<WorldSave[]>('worlds:list', instance.id).then(setWorlds).catch(() => {})
  }, [instance.id])

  return (
    <Panel
      title={`Worlds (${worlds.length})`}
      actions={
        <GlassButton variant="quiet" size="sm" iconOnly aria-label="Open saves folder" onClick={() => void call('instances:reveal', instance.id, 'saves')}>
          <FolderOpen size={14} />
        </GlassButton>
      }
    >
      {worlds.length === 0 ? (
        <EmptyState icon={<Globe2 size={26} />} title="No worlds yet" text="Worlds you create in this instance show up here, with their size on disk." />
      ) : (
        worlds.map((world) => (
          <div className="row" key={world.folder}>
            <span className="row__text">
              <span className="row__label">{world.name}</span>
              <span className="row__desc">
                {formatBytes(world.sizeBytes)} · Last opened {formatRelative(world.lastPlayed)}
              </span>
            </span>
            <span className="row__control">
              {world.hardcore && <Badge tone="bad">Hardcore</Badge>}
              <GlassButton variant="glass" size="sm" onClick={() => void launch(instance.id)}>
                <Play size={12} /> Play
              </GlassButton>
              <GlassButton
                variant="danger"
                size="sm"
                iconOnly
                aria-label={`Delete ${world.name}`}
                onClick={() =>
                  void call<boolean>(
                    'dialog:confirm',
                    'Delete world',
                    `Delete "${world.name}"? This cannot be undone.`
                  ).then((ok) => {
                    if (ok) void call<WorldSave[]>('worlds:delete', instance.id, world.folder).then(setWorlds)
                  })
                }
              >
                <Trash2 size={13} />
              </GlassButton>
            </span>
          </div>
        ))
      )}
    </Panel>
  )
}

function ServersPane({ instance }: { instance: Instance }): React.JSX.Element {
  const [servers, setServers] = useState<{ name: string; ip: string }[]>([])
  const launch = useStore((s) => s.launch)

  useEffect(() => {
    void call<typeof servers>('servers:list', instance.id).then(setServers).catch(() => {})
  }, [instance.id])

  return (
    <Panel title={`Servers (${servers.length})`} hint="Read from this instance's servers.dat. Play joins the server directly on launch.">
      {servers.length === 0 ? (
        <EmptyState icon={<Server size={26} />} title="No servers saved" text="Servers you add inside the game appear here." />
      ) : (
        servers.map((server) => (
          <div className="row" key={server.ip}>
            <span className="row__text">
              <span className="row__label">{server.name}</span>
              <span className="row__desc mono">{server.ip}</span>
            </span>
            <span className="row__control">
              <GlassButton variant="prominent" size="sm" onClick={() => void launch(instance.id, server.ip)}>
                <Power size={12} /> Join
              </GlassButton>
            </span>
          </div>
        ))
      )}
    </Panel>
  )
}

function ScreenshotsPane({ instance }: { instance: Instance }): React.JSX.Element {
  const [shots, setShots] = useState<{ file: string; name: string; takenAt: number; sizeBytes: number }[]>([])

  useEffect(() => {
    void call<typeof shots>('screenshots:list', instance.id).then(setShots).catch(() => {})
  }, [instance.id])

  return (
    <Panel
      title={`Screenshots (${shots.length})`}
      actions={
        <GlassButton variant="quiet" size="sm" iconOnly aria-label="Open screenshots folder" onClick={() => void call('instances:reveal', instance.id, 'screenshots')}>
          <FolderOpen size={14} />
        </GlassButton>
      }
    >
      {shots.length === 0 ? (
        <EmptyState icon={<Image size={26} />} title="No screenshots" text="Press F2 in game. Anything you capture shows up here." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 'var(--sp-3)', padding: 'var(--sp-3)' }}>
          {shots.map((shot) => (
            <button
              key={shot.file}
              onClick={() => void call('shell:openPath', shot.file)}
              style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}
            >
              <img
                src={`prismatic-file:///${encodeURIComponent(shot.file)}`}
                alt={shot.name}
                loading="lazy"
                style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', borderRadius: 'var(--r-md)', background: 'var(--fill)' }}
              />
              <div className="row__desc truncate" style={{ marginTop: 4 }}>
                {shot.name}
              </div>
            </button>
          ))}
        </div>
      )}
    </Panel>
  )
}

// ---------------------------------------------------------------------------

function LogPane({ instance }: { instance: Instance }): React.JSX.Element {
  const liveLines = useStore((s) => s.logs[instance.id] ?? [])
  const clearLogs = useStore((s) => s.clearLogs)
  const toast = useStore((s) => s.toast)
  const [fileText, setFileText] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)
  const [minLevel, setMinLevel] = useState<'all' | 'warn'>('all')
  const [query, setQuery] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  // When nothing is running, show what's on disk instead of an empty pane.
  useEffect(() => {
    if (liveLines.length > 0) return
    void call<string>('logs:read', instance.id).then(setFileText).catch(() => {})
  }, [instance.id, liveLines.length])

  const lines: LogLine[] = useMemo(() => {
    if (liveLines.length > 0) return liveLines
    return fileText
      .split(/\r?\n/)
      .filter(Boolean)
      .map((text, i) => {
        const match = /\[([^\]]*?)\/(TRACE|DEBUG|INFO|WARN|ERROR|FATAL)\]/.exec(text)
        return {
          instanceId: instance.id,
          seq: i,
          level: (match?.[2] as LogLine['level']) ?? 'INFO',
          thread: match?.[1] ?? '',
          text,
          at: 0
        }
      })
  }, [liveLines, fileText, instance.id])

  const visible = useMemo(
    () =>
      lines.filter((line) => {
        if (minLevel === 'warn' && !['WARN', 'ERROR', 'FATAL'].includes(line.level)) return false
        if (query && !line.text.toLowerCase().includes(query.toLowerCase())) return false
        return true
      }),
    [lines, minLevel, query]
  )

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [visible.length, autoScroll])

  return (
    <div className="glass panel" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 240px)', minHeight: 360 }}>
      <div className="panel__header">
        <h2 className="panel__title">Log</h2>
        <span className="spacer" />
        <div className="hstack">
          <div className="search" style={{ maxWidth: 200 }}>
            <Search size={14} className="search__icon" />
            <input className="input" style={{ height: 30 }} value={query} placeholder="Find" onChange={(e) => setQuery(e.target.value)} />
          </div>
          <Segmented
            value={minLevel}
            onChange={setMinLevel}
            options={[
              { value: 'all', label: 'All' },
              { value: 'warn', label: 'Warnings and errors' }
            ]}
            layoutId="log-level"
          />
          <label className="hstack" style={{ gap: 6, fontSize: 'var(--fs-caption)', color: 'var(--ink-3)' }}>
            <GlassSwitch checked={autoScroll} onChange={setAutoScroll} label="Follow the log" />
            Follow
          </label>
          <GlassButton
            variant="quiet"
            size="sm"
            onClick={() => {
              void call('clipboard:write', visible.map((l) => l.text).join('\n'))
              toast('info', 'Log copied to the clipboard')
            }}
          >
            Copy
          </GlassButton>
          <GlassButton variant="quiet" size="sm" onClick={() => clearLogs(instance.id)}>
            Clear
          </GlassButton>
        </div>
      </div>

      <div className="logview">
        {visible.length === 0 ? (
          <span className="muted">No log output yet. Press Play and it streams here live.</span>
        ) : (
          visible.map((line) => (
            <div className="logline" key={`${line.seq}-${line.at}`} data-level={line.level}>
              <span className="logline__level">{line.level}</span>
              <span style={{ flex: 1 }}>{line.text}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function JavaPane({ instance }: { instance: Instance }): React.JSX.Element {
  const globals = useStore((s) => s.settings)
  const refresh = useStore((s) => s.refreshInstances)
  const o = instance.overrides

  const update = (patch: Partial<Instance['overrides']>): void => {
    void call('instances:update', instance.id, { overrides: patch }).then(() => refresh())
  }

  if (!globals) return <div />

  const memory = o.memory ?? globals.java.memory

  return (
    <>
      <Panel
        title="Memory"
        hint="Overriding memory here affects only this instance. Large modpacks genuinely need more; vanilla almost never does."
      >
        <Row label="Override the global memory settings">
          <GlassSwitch
            checked={o.memory !== null}
            label="Override memory"
            onChange={(on) => update({ memory: on ? { ...globals.java.memory } : null })}
          />
        </Row>
        <Row label="Maximum memory">
          <div style={{ width: 280 }}>
            <SliderRow
              value={memory.max}
              min={1024}
              max={32768}
              step={256}
              disabled={o.memory === null}
              onChange={(max) => update({ memory: { ...memory, max } })}
              format={(v) => formatBytes(v * 1024 * 1024)}
              label="Maximum memory"
            />
          </div>
        </Row>
        <Row label="Minimum memory">
          <div style={{ width: 280 }}>
            <SliderRow
              value={memory.min}
              min={256}
              max={8192}
              step={256}
              disabled={o.memory === null}
              onChange={(min) => update({ memory: { ...memory, min } })}
              format={(v) => formatBytes(v * 1024 * 1024)}
              label="Minimum memory"
            />
          </div>
        </Row>
      </Panel>

      <Panel title="Java Runtime">
        <Row label="Override the Java path" desc={o.javaPath ?? 'Using the automatically selected runtime'}>
          <GlassSwitch
            checked={o.javaPath !== null}
            label="Override the Java path"
            onChange={(on) => {
              if (!on) return update({ javaPath: null })
              void call<string | null>('dialog:pickFile', [{ name: 'Java', extensions: ['exe', ''] }]).then((file) => {
                if (file) update({ javaPath: file })
              })
            }}
          />
        </Row>
        <Row label="Override JVM arguments">
          <GlassSwitch
            checked={o.jvmArgs !== null}
            label="Override JVM arguments"
            onChange={(on) => update({ jvmArgs: on ? globals.java.jvmArgs : null })}
          />
        </Row>
        {o.jvmArgs !== null && (
          <div style={{ padding: 'var(--sp-3)' }}>
            <textarea
              className="textarea mono"
              defaultValue={o.jvmArgs}
              spellCheck={false}
              onBlur={(e) => update({ jvmArgs: e.target.value })}
            />
          </div>
        )}
      </Panel>

      <Panel title="Window">
        <Row label="Override the window size">
          <GlassSwitch
            checked={o.window !== null}
            label="Override the window size"
            onChange={(on) => update({ window: on ? { ...globals.minecraft.window } : null })}
          />
        </Row>
        {o.window && (
          <>
            <Row label="Width">
              <input
                className="input"
                style={{ width: 110 }}
                type="number"
                value={o.window.width}
                onChange={(e) => update({ window: { ...o.window!, width: Number(e.target.value) } })}
              />
            </Row>
            <Row label="Height">
              <input
                className="input"
                style={{ width: 110 }}
                type="number"
                value={o.window.height}
                onChange={(e) => update({ window: { ...o.window!, height: Number(e.target.value) } })}
              />
            </Row>
            <Row label="Fullscreen">
              <GlassSwitch
                checked={o.window.fullscreen}
                label="Fullscreen"
                onChange={(fullscreen) => update({ window: { ...o.window!, fullscreen } })}
              />
            </Row>
          </>
        )}
      </Panel>

      <Panel title="Custom Commands">
        <Row label="Override the global commands">
          <GlassSwitch
            checked={o.commands !== null}
            label="Override the global commands"
            onChange={(on) => update({ commands: on ? { ...globals.commands } : null })}
          />
        </Row>
        {o.commands && (
          <div className="stack" style={{ padding: 'var(--sp-3)', gap: 'var(--sp-3)' }}>
            <Field label="Pre-launch">
              <input className="input mono" defaultValue={o.commands.pre} onBlur={(e) => update({ commands: { ...o.commands!, pre: e.target.value } })} />
            </Field>
            <Field label="Wrapper">
              <input className="input mono" defaultValue={o.commands.wrapper} onBlur={(e) => update({ commands: { ...o.commands!, wrapper: e.target.value } })} />
            </Field>
            <Field label="Post-exit">
              <input className="input mono" defaultValue={o.commands.post} onBlur={(e) => update({ commands: { ...o.commands!, post: e.target.value } })} />
            </Field>
          </div>
        )}
      </Panel>
    </>
  )
}

function NotesPane({ instance }: { instance: Instance }): React.JSX.Element {
  const refresh = useStore((s) => s.refreshInstances)
  const toast = useStore((s) => s.toast)

  return (
    <Panel title="Notes" hint="Anything you want to remember about this instance: which mods you removed, a server address, a to-do list.">
      <div style={{ padding: 'var(--sp-3)' }}>
        <textarea
          className="textarea"
          style={{ minHeight: 280 }}
          defaultValue={instance.notes}
          placeholder="Write anything…"
          onBlur={(e) => {
            void call('instances:writeNotes', instance.id, e.target.value).then(() => {
              void refresh()
              toast('success', 'Notes saved')
            })
          }}
        />
      </div>
    </Panel>
  )
}
