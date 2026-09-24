import { useCallback, useEffect, useState } from 'react'
import { Download, Compass, ExternalLink, Loader2, Plus, ArrowDownToLine } from 'lucide-react'
import { GlassButton } from '../components/Glass'
import { Badge, EmptyState, Panel, SearchInput, Segmented } from '../components/Controls'
import { Sheet } from '../components/Sheet'
import { useStore } from '../state/store'
import { call } from '../lib/ipc'
import { formatBytes, formatCount, formatRelative } from '../lib/appearance'
import type { ContentKind, Instance, ProjectHit, ProjectVersion } from '../../../shared/types'

const KINDS: { value: ContentKind; label: string }[] = [
  { value: 'modpack', label: 'Modpacks' },
  { value: 'mod', label: 'Mods' },
  { value: 'resourcepack', label: 'Resource Packs' },
  { value: 'shader', label: 'Shaders' }
]

/** Browse Modrinth and CurseForge, and install into an instance or as a new one. */
export function DiscoverView(): React.JSX.Element {
  const toast = useStore((s) => s.toast)
  const instances = useStore((s) => s.instances)
  const refresh = useStore((s) => s.refreshInstances)

  const [kind, setKind] = useState<ContentKind>('modpack')
  const [platform, setPlatform] = useState<'modrinth' | 'curseforge'>('modrinth')
  const [query, setQuery] = useState('')
  const [gameVersion, setGameVersion] = useState('')
  const [loaderFilter, setLoaderFilter] = useState('')
  const [sort, setSort] = useState<'relevance' | 'downloads' | 'follows' | 'updated'>('downloads')
  const [hits, setHits] = useState<ProjectHit[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [versions, setVersions] = useState<string[]>([])
  const [installTarget, setInstallTarget] = useState<ProjectHit | null>(null)

  useEffect(() => {
    void call<{ id: string; type: string }[]>('versions:list')
      .then((list) => setVersions(list.filter((v) => v.type === 'release').map((v) => v.id)))
      .catch(() => {})
  }, [])

  const run = useCallback(() => {
    setLoading(true)
    setError(null)
    void call<{ hits: ProjectHit[]; total: number }>('content:search', {
      query,
      kind,
      platform,
      gameVersion: gameVersion || undefined,
      loader: loaderFilter || undefined,
      sort,
      limit: 30
    })
      .then((res) => {
        setHits(res.hits)
        setTotal(res.total)
      })
      .catch((err) => {
        setError(String(err).replace(/^Error:\s*/, ''))
        setHits([])
      })
      .finally(() => setLoading(false))
  }, [query, kind, platform, gameVersion, loaderFilter, sort])

  // Debounce so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(run, query ? 350 : 0)
    return () => clearTimeout(timer)
  }, [run, query])

  return (
    <div className="view">
      <div className="view__header">
        <div>
          <h1 className="view__title">Discover</h1>
          <p className="view__subtitle">
            {total > 0 ? `${formatCount(total)} results on ${platform === 'modrinth' ? 'Modrinth' : 'CurseForge'}` : 'Modpacks, mods, resource packs and shaders'}
          </p>
        </div>
        <div className="view__actions">
          <SearchInput value={query} onChange={setQuery} placeholder="Search projects" />
        </div>
      </div>

      <div className="glass panel" style={{ padding: 'var(--sp-3)' }}>
        <div className="hstack hstack--wrap">
          <Segmented value={kind} onChange={setKind} options={KINDS} layoutId="discover-kind" />
          <span className="glass-spacer" style={{ height: 24 }} />
          <Segmented
            value={platform}
            onChange={setPlatform}
            options={[
              { value: 'modrinth', label: 'Modrinth' },
              { value: 'curseforge', label: 'CurseForge' }
            ]}
            layoutId="discover-platform"
          />
          <span className="spacer" />
          <select className="select" style={{ width: 150 }} value={gameVersion} onChange={(e) => setGameVersion(e.target.value)}>
            <option value="">Any version</option>
            {versions.slice(0, 40).map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          {kind !== 'resourcepack' && (
            <select className="select" style={{ width: 130 }} value={loaderFilter} onChange={(e) => setLoaderFilter(e.target.value)}>
              <option value="">Any loader</option>
              <option value="fabric">Fabric</option>
              <option value="neoforge">NeoForge</option>
              <option value="forge">Forge</option>
              <option value="quilt">Quilt</option>
            </select>
          )}
          <select className="select" style={{ width: 140 }} value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
            <option value="downloads">Most downloads</option>
            <option value="follows">Most followers</option>
            <option value="updated">Recently updated</option>
            <option value="relevance">Relevance</option>
          </select>
        </div>
      </div>

      {error ? (
        <EmptyState
          icon={<Compass size={28} />}
          title="Search failed"
          text={error}
          action={
            <GlassButton variant="glass" onClick={run}>
              Try again
            </GlassButton>
          }
        />
      ) : loading && hits.length === 0 ? (
        <div className="empty">
          <Loader2 size={26} className="spin" />
          <p className="empty__text">Searching…</p>
        </div>
      ) : hits.length === 0 ? (
        <EmptyState icon={<Compass size={28} />} title="Nothing found" text="Try a different search, or loosen the version and loader filters." />
      ) : (
        <Panel>
          {hits.map((hit) => (
            <div className="hit" key={`${hit.platform}-${hit.id}`}>
              {hit.iconUrl ? (
                <img className="hit__icon" src={hit.iconUrl} alt="" loading="lazy" />
              ) : (
                <div className="hit__icon" style={{ display: 'grid', placeItems: 'center', fontSize: 20 }}>
                  {'\u{1F4E6}'}
                </div>
              )}
              <div className="hit__body">
                <div className="hit__title">
                  {hit.title}
                  {hit.loaders.slice(0, 3).map((l) => (
                    <Badge key={l} tone={l as 'fabric'}>
                      {l}
                    </Badge>
                  ))}
                </div>
                <div className="hit__desc">{hit.description}</div>
                <div className="hit__stats">
                  <span>
                    <ArrowDownToLine size={11} style={{ verticalAlign: -1 }} /> {formatCount(hit.downloads)}
                  </span>
                  <span>by {hit.author}</span>
                  <span>Updated {formatRelative(new Date(hit.updated).getTime())}</span>
                  {hit.gameVersions.length > 0 && <span>{hit.gameVersions.slice(0, 3).join(', ')}</span>}
                </div>
              </div>
              <div className="hit__actions">
                <GlassButton
                  variant="prominent"
                  size="sm"
                  onClick={() => {
                    if (kind === 'modpack') {
                      void call<{
                        instance: Instance
                        installed: string[]
                        skipped: { name: string; reason: string }[]
                      }>('packs:installModrinth', hit.id, null, hit.title)
                        .then((result) => {
                          void refresh()
                          const extra = result.installed.length ? ` + ${result.installed.join(', ')}` : ''
                          toast('success', `Installed ${result.instance.name}${extra}`)
                          if (result.skipped.length) {
                            toast(
                              'info',
                              'Some default mods were skipped',
                              result.skipped.map((s) => `${s.name}: ${s.reason}`).join('\n')
                            )
                          }
                        })
                        .catch((err) => toast('error', 'Install failed', String(err).replace(/^Error:\s*/, '')))
                    } else {
                      setInstallTarget(hit)
                    }
                  }}
                >
                  {kind === 'modpack' ? <Plus size={12} /> : <Download size={12} />}
                  {kind === 'modpack' ? 'Install' : 'Add to…'}
                </GlassButton>
                <GlassButton
                  variant="quiet"
                  size="sm"
                  iconOnly
                  aria-label="Open project page"
                  onClick={() =>
                    void call(
                      'shell:openExternal',
                      hit.platform === 'modrinth'
                        ? `https://modrinth.com/project/${hit.slug}`
                        : `https://www.curseforge.com/minecraft/mc-mods/${hit.slug}`
                    )
                  }
                >
                  <ExternalLink size={13} />
                </GlassButton>
              </div>
            </div>
          ))}
        </Panel>
      )}

      <InstallToInstanceSheet
        hit={installTarget}
        kind={kind}
        instances={instances}
        onClose={() => setInstallTarget(null)}
      />
    </div>
  )
}

/** Pick an instance and a version, then install. */
function InstallToInstanceSheet({
  hit,
  kind,
  instances,
  onClose
}: {
  hit: ProjectHit | null
  kind: ContentKind
  instances: Instance[]
  onClose(): void
}): React.JSX.Element {
  const toast = useStore((s) => s.toast)
  const [instanceId, setInstanceId] = useState('')
  const [versions, setVersions] = useState<ProjectVersion[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)

  const instance = instances.find((i) => i.id === instanceId)

  useEffect(() => {
    if (!hit) return
    setInstanceId(instances[0]?.id ?? '')
  }, [hit, instances])

  useEffect(() => {
    if (!hit || !instance) return
    setLoading(true)
    void call<ProjectVersion[]>(
      'content:versions',
      hit.platform,
      hit.id,
      instance.mcVersion,
      kind === 'mod' ? instance.loader : undefined
    )
      .then(setVersions)
      .catch(() => setVersions([]))
      .finally(() => setLoading(false))
  }, [hit, instance, kind])

  const install = (version: ProjectVersion): void => {
    if (!hit || !instance) return
    setBusy(true)
    void call('content:install', instance.id, kind, hit.platform, hit.id, version, instance.mcVersion, instance.loader)
      .then(() => {
        toast('success', `Added ${hit.title}`, `Installed into ${instance.name}`)
        onClose()
      })
      .catch((err) => toast('error', 'Install failed', String(err).replace(/^Error:\s*/, '')))
      .finally(() => setBusy(false))
  }

  return (
    <Sheet open={hit !== null} title={`Add ${hit?.title ?? ''}`} onClose={onClose}>
      <div className="stack">
        <div className="field">
          <span className="field__label">Install into</span>
          <select className="select" value={instanceId} onChange={(e) => setInstanceId(e.target.value)}>
            {instances.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} — {i.mcVersion} {i.loader !== 'vanilla' ? i.loader : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className="field__label">Version</span>
          {loading ? (
            <div className="hstack muted" style={{ padding: 'var(--sp-3)' }}>
              <Loader2 size={14} className="spin" /> Loading compatible versions…
            </div>
          ) : versions.length === 0 ? (
            <p className="panel__hint" style={{ padding: 'var(--sp-3) 0' }}>
              No version of this project supports Minecraft {instance?.mcVersion}
              {kind === 'mod' && instance?.loader !== 'vanilla' ? ` with ${instance?.loader}` : ''}.
            </p>
          ) : (
            <div className="stack" style={{ gap: 2, marginTop: 8 }}>
              {versions.slice(0, 24).map((v) => (
                <div className="row" key={v.id}>
                  <span className="row__text">
                    <span className="row__label">{v.name}</span>
                    <span className="row__desc">
                      {v.versionNumber} · {formatRelative(new Date(v.datePublished).getTime())} ·{' '}
                      {formatBytes(v.files[0]?.size ?? 0)}
                    </span>
                  </span>
                  <span className="row__control">
                    {v.channel !== 'release' && <Badge tone="warn">{v.channel}</Badge>}
                    <GlassButton variant="prominent" size="sm" disabled={busy} onClick={() => install(v)}>
                      <Download size={12} /> Install
                    </GlassButton>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Sheet>
  )
}
