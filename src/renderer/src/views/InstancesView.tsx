import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ChevronDown,
  Boxes,
  Plus,
  Download,
  Star,
  Play,
  Square,
  FolderOpen,
  Copy,
  Trash2,
  Settings2,
  Share2
} from 'lucide-react'
import { GlassButton } from '../components/Glass'
import { Badge, EmptyState, SearchInput, Segmented } from '../components/Controls'
import { Sheet } from '../components/Sheet'
import { useStore } from '../state/store'
import { call } from '../lib/ipc'
import { formatDuration, formatRelative } from '../lib/appearance'
import type { Instance } from '../../../shared/types'
import { CreateInstanceSheet } from './CreateInstanceSheet'
import { InstanceIcon } from '../components/InstanceIcon'
import { BedrockTile } from './BedrockTile'


export function InstancesView(): React.JSX.Element {
  const instances = useStore((s) => s.instances)
  const running = useStore((s) => s.running)
  const settings = useStore((s) => s.settings)
  const openDetail = useStore((s) => s.openInstanceDetail)
  const launch = useStore((s) => s.launch)
  const kill = useStore((s) => s.kill)
  const refresh = useStore((s) => s.refreshInstances)
  const toast = useStore((s) => s.toast)
  const patchSettings = useStore((s) => s.patchSettings)

  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [menuFor, setMenuFor] = useState<Instance | null>(null)

  const sortBy = settings?.general.sortBy ?? 'lastPlayed'
  const collapsed = settings?.general.groupCollapsed ?? []

  const groups = useMemo(() => {
    const filtered = instances.filter((i) => {
      if (!query.trim()) return true
      const q = query.toLowerCase()
      return (
        i.name.toLowerCase().includes(q) ||
        i.mcVersion.includes(q) ||
        i.loader.includes(q) ||
        (i.group ?? '').toLowerCase().includes(q)
      )
    })

    const sorted = [...filtered].sort((a, b) => {
      if (a.favourite !== b.favourite) return a.favourite ? -1 : 1
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name)
        case 'created':
          return b.created - a.created
        case 'playtime':
          return b.totalPlaySeconds - a.totalPlaySeconds
        default:
          return (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0)
      }
    })

    const map = new Map<string, Instance[]>()
    for (const inst of sorted) {
      const key = inst.group ?? ''
      const list = map.get(key) ?? []
      list.push(inst)
      map.set(key, list)
    }
    // Ungrouped instances come first, then named groups alphabetically.
    return [...map.entries()].sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)))
  }, [instances, query, sortBy])

  const toggleGroup = (name: string): void => {
    const next = collapsed.includes(name) ? collapsed.filter((g) => g !== name) : [...collapsed, name]
    void patchSettings({ general: { groupCollapsed: next } })
  }

  const isRunning = (id: string): boolean => running.some((r) => r.instanceId === id)

  return (
    <div className="view">
      <div className="view__header">
        <div>
          <h1 className="view__title">Instances</h1>
          <p className="view__subtitle">
            {instances.length} {instances.length === 1 ? 'instance' : 'instances'}
            {running.length > 0 && ` · ${running.length} running`}
          </p>
        </div>
        <div className="view__actions">
          <SearchInput value={query} onChange={setQuery} placeholder="Filter instances" />
          <Segmented
            value={sortBy}
            onChange={(v) => void patchSettings({ general: { sortBy: v } })}
            options={[
              { value: 'lastPlayed', label: 'Recent' },
              { value: 'name', label: 'Name' },
              { value: 'playtime', label: 'Played' }
            ]}
          />
          <GlassButton
            variant="glass"
            onClick={() => {
              void call<{
                instance: Instance
                installed: string[]
                skipped: { name: string; reason: string }[]
              } | null>('packs:importFile')
                .then((result) => {
                  if (!result) return
                  void refresh()
                  const extra = result.installed.length ? ` + ${result.installed.join(', ')}` : ''
                  toast('success', `Imported ${result.instance.name}${extra}`)
                  if (result.skipped.length) {
                    toast(
                      'info',
                      'Some default mods were skipped',
                      result.skipped.map((s) => `${s.name}: ${s.reason}`).join('\n')
                    )
                  }
                })
                .catch((err) => toast('error', 'Import failed', String(err)))
            }}
          >
            <Download size={15} /> Import
          </GlassButton>
          <GlassButton variant="prominent" onClick={() => setCreating(true)}>
            <Plus size={16} /> New
          </GlassButton>
        </div>
      </div>

      {instances.length === 0 ? (
        <EmptyState
          icon={<Boxes size={30} />}
          title="No instances yet"
          text="An instance is one self-contained copy of Minecraft: its own version, mods, worlds and settings. Create one, or import a modpack you already have."
          action={
            <div className="hstack">
              <GlassButton variant="prominent" onClick={() => setCreating(true)}>
                <Plus size={16} /> Create an instance
              </GlassButton>
              <GlassButton variant="glass" onClick={() => void call('packs:importFile').then(() => refresh())}>
                <Download size={15} /> Import a pack
              </GlassButton>
            </div>
          }
        />
      ) : (
        groups.map(([groupName, list]) => {
          const isCollapsed = collapsed.includes(groupName)
          return (
            <section className="group" key={groupName || '__ungrouped'}>
              {groupName !== '' && (
                <button
                  className="group__header"
                  data-collapsed={isCollapsed}
                  onClick={() => toggleGroup(groupName)}
                >
                  <ChevronDown size={15} className="group__chevron" />
                  {groupName}
                  <span className="group__count">{list.length}</span>
                </button>
              )}
              <AnimatePresence initial={false}>
                {!isCollapsed && (
                  <motion.div
                    className="grid"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
                    style={{ overflow: 'hidden' }}
                  >
                    {list.map((inst) => (
                      <InstanceCard
                        key={inst.id}
                        instance={inst}
                        running={isRunning(inst.id)}
                        onOpen={() => openDetail(inst.id)}
                        onLaunch={() => void launch(inst.id)}
                        onKill={() => void kill(inst.id)}
                        onMenu={() => setMenuFor(inst)}
                      />
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </section>
          )
        })
      )}

      <BedrockTile />

      <CreateInstanceSheet open={creating} onClose={() => setCreating(false)} />

      <Sheet
        open={menuFor !== null}
        title={menuFor?.name ?? ''}
        onClose={() => setMenuFor(null)}
        footer={
          <GlassButton variant="quiet" onClick={() => setMenuFor(null)}>
            Done
          </GlassButton>
        }
      >
        {menuFor && <InstanceActions instance={menuFor} onDone={() => setMenuFor(null)} />}
      </Sheet>
    </div>
  )
}

function InstanceCard({
  instance,
  running,
  onOpen,
  onLaunch,
  onKill,
  onMenu
}: {
  instance: Instance
  running: boolean
  onOpen(): void
  onLaunch(): void
  onKill(): void
  onMenu(): void
}): React.JSX.Element {
  const [hover, setHover] = useState(false)

  return (
    <div
      className="card"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        onMenu()
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {running && <span className="card__running" title="Running" />}
      {instance.favourite && <Star size={13} className="card__fav" fill="currentColor" />}

      <InstanceIcon icon={instance.icon} size={64} className="card__icon" />
      <div className="card__name">{instance.name}</div>
      <div className="card__meta">
        <span>{instance.mcVersion}</span>
        <Badge tone={instance.loader}>{instance.loader === 'vanilla' ? 'Vanilla' : instance.loader}</Badge>
      </div>
      <div className="card__meta" style={{ fontSize: 10.5, color: 'var(--ink-4)' }}>
        {instance.totalPlaySeconds > 0 ? formatDuration(instance.totalPlaySeconds) : 'Not played'}
        {' · '}
        {formatRelative(instance.lastPlayed)}
      </div>

      {/* Hover actions rise out of the card rather than being always visible. */}
      <AnimatePresence>
        {hover && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.16 }}
            style={{ display: 'flex', gap: 6, marginTop: 2 }}
            onClick={(e) => e.stopPropagation()}
          >
            {running ? (
              <GlassButton variant="danger" size="sm" onClick={onKill}>
                <Square size={12} /> Stop
              </GlassButton>
            ) : (
              <GlassButton variant="prominent" size="sm" onClick={onLaunch}>
                <Play size={12} /> Play
              </GlassButton>
            )}
            <GlassButton variant="quiet" size="sm" iconOnly onClick={onMenu} aria-label="More actions">
              <Settings2 size={13} />
            </GlassButton>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function InstanceActions({ instance, onDone }: { instance: Instance; onDone(): void }): React.JSX.Element {
  const refresh = useStore((s) => s.refreshInstances)
  const toast = useStore((s) => s.toast)
  const openDetail = useStore((s) => s.openInstanceDetail)

  const act = async (fn: () => Promise<unknown>, success: string): Promise<void> => {
    try {
      await fn()
      await refresh()
      toast('success', success)
    } catch (err) {
      toast('error', 'Action failed', String(err).replace(/^Error:\s*/, ''))
    }
  }

  const items: { icon: React.JSX.Element; label: string; desc: string; onClick(): void; danger?: boolean }[] = [
    {
      icon: <Settings2 size={16} />,
      label: 'Edit instance',
      desc: 'Version, mods, Java, worlds and logs',
      onClick: () => {
        openDetail(instance.id)
        onDone()
      }
    },
    {
      icon: <Star size={16} />,
      label: instance.favourite ? 'Remove from favourites' : 'Add to favourites',
      desc: 'Favourites are pinned to the top of the list',
      onClick: () =>
        void act(
          () => call('instances:update', instance.id, { favourite: !instance.favourite }),
          instance.favourite ? 'Removed from favourites' : 'Added to favourites'
        )
    },
    {
      icon: <FolderOpen size={16} />,
      label: 'Open instance folder',
      desc: 'Shows the folder in your file manager',
      onClick: () => void call('instances:reveal', instance.id)
    },
    {
      icon: <Copy size={16} />,
      label: 'Duplicate',
      desc: 'Copies mods, config and worlds into a new instance',
      onClick: () => void act(() => call('instances:duplicate', instance.id, `${instance.name} copy`), 'Instance duplicated')
    },
    {
      icon: <Share2 size={16} />,
      label: 'Export as instance zip',
      desc: 'A MultiMC/Prism-compatible zip you can share',
      onClick: () => void act(() => call('packs:export', instance.id, 'multimc', true), 'Instance exported')
    },
    {
      icon: <Share2 size={16} />,
      label: 'Export as .mrpack',
      desc: 'A Modrinth pack that links mods instead of bundling them',
      onClick: () => void act(() => call('packs:export', instance.id, 'mrpack', false), 'Pack exported')
    },
    {
      icon: <Trash2 size={16} />,
      label: 'Delete instance',
      desc: 'Permanently removes the folder, including worlds',
      danger: true,
      onClick: () => {
        void call<boolean>(
          'dialog:confirm',
          'Delete instance',
          `Delete "${instance.name}"? Its worlds, mods and settings are removed permanently.`
        ).then((confirmed) => {
          if (confirmed) {
            void act(() => call('instances:delete', instance.id), 'Instance deleted').then(onDone)
          }
        })
      }
    }
  ]

  return (
    <div className="stack" style={{ gap: 2 }}>
      {items.map((item) => (
        <button
          key={item.label}
          className="row row--button"
          onClick={item.onClick}
          style={item.danger ? { color: 'var(--bad)' } : undefined}
        >
          <span style={{ flex: 'none', display: 'grid', placeItems: 'center' }}>{item.icon}</span>
          <span className="row__text">
            <span className="row__label">{item.label}</span>
            <span className="row__desc">{item.desc}</span>
          </span>
        </button>
      ))}
    </div>
  )
}
