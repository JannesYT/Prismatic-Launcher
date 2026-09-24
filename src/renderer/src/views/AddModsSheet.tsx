import { useCallback, useEffect, useState } from 'react'
import { ArrowDownToLine, Check, Download, ExternalLink, Loader2, Package } from 'lucide-react'
import { Sheet } from '../components/Sheet'
import { GlassButton } from '../components/Glass'
import { Badge, EmptyState, SearchInput, Segmented } from '../components/Controls'
import { useStore } from '../state/store'
import { call } from '../lib/ipc'
import { formatCount, formatRelative } from '../lib/appearance'
import type { ContentKind, Instance, ProjectHit, ProjectVersion } from '../../../shared/types'

/**
 * Add content from inside an instance.
 *
 * Unlike the Discover tab, the search is pre-scoped to this instance's
 * Minecraft version and loader and cannot be widened. That is the point: every
 * result shown is installable here, so there is no way to pick a build that
 * will not load.
 */
export function AddModsSheet({
  open,
  instance,
  onClose
}: {
  open: boolean
  instance: Instance
  onClose(): void
}): React.JSX.Element {
  const toast = useStore((s) => s.toast)

  const [kind, setKind] = useState<ContentKind>('mod')
  const [platform, setPlatform] = useState<'modrinth' | 'curseforge'>('modrinth')
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<ProjectHit[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [installing, setInstalling] = useState<string | null>(null)
  const [installed, setInstalled] = useState<Set<string>>(new Set())

  const run = useCallback(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    void call<{ hits: ProjectHit[]; total: number }>('content:search', {
      query,
      kind,
      platform,
      gameVersion: instance.mcVersion,
      // Resource packs are loader-agnostic, so constraining them would hide
      // perfectly valid results.
      loader: kind === 'resourcepack' || kind === 'shader' ? undefined : instance.loader,
      sort: query ? 'relevance' : 'downloads',
      limit: 40
    })
      .then((res) => setHits(res.hits))
      .catch((err) => {
        setError(String(err).replace(/^Error:\s*/, ''))
        setHits([])
      })
      .finally(() => setLoading(false))
  }, [open, query, kind, platform, instance.mcVersion, instance.loader])

  useEffect(() => {
    const timer = setTimeout(run, query ? 350 : 0)
    return () => clearTimeout(timer)
  }, [run, query])

  // Start from a clean slate each time the sheet opens.
  useEffect(() => {
    if (open) {
      setQuery('')
      setInstalled(new Set())
    }
  }, [open])

  const install = (hit: ProjectHit): void => {
    setInstalling(hit.id)
    void call<ProjectVersion[]>(
      'content:versions',
      hit.platform,
      hit.id,
      instance.mcVersion,
      kind === 'mod' ? instance.loader : undefined
    )
      .then((versions) => {
        const best = versions.find((v) => v.channel === 'release') ?? versions[0]
        if (!best) throw new Error(`No build for ${instance.mcVersion} / ${instance.loader}`)
        return call('content:install', instance.id, kind, hit.platform, hit.id, best, instance.mcVersion, instance.loader)
      })
      .then(() => {
        setInstalled((prev) => new Set(prev).add(hit.id))
        toast('success', `Added ${hit.title}`, `Installed into ${instance.name}`)
      })
      .catch((err) => toast('error', `Could not add ${hit.title}`, String(err).replace(/^Error:\s*/, '')))
      .finally(() => setInstalling(null))
  }

  const kinds: { value: ContentKind; label: string }[] = [
    { value: 'mod', label: 'Mods' },
    { value: 'resourcepack', label: 'Resource packs' },
    { value: 'shader', label: 'Shaders' }
  ]

  return (
    <Sheet
      open={open}
      title={`Add to ${instance.name}`}
      onClose={onClose}
      tall
      footer={
        <GlassButton variant="quiet" onClick={onClose}>
          Done
        </GlassButton>
      }
    >
      <div className="stack" style={{ gap: 'var(--sp-3)' }}>
        <div className="hstack hstack--wrap">
          <Segmented value={kind} onChange={setKind} options={kinds} layoutId="add-kind" />
          <span className="spacer" />
          <Segmented
            value={platform}
            onChange={setPlatform}
            options={[
              { value: 'modrinth', label: 'Modrinth' },
              { value: 'curseforge', label: 'CurseForge' }
            ]}
            layoutId="add-platform"
          />
        </div>

        <SearchInput value={query} onChange={setQuery} placeholder={`Search ${kind === 'mod' ? 'mods' : kind + 's'}`} />

        {/* Stating the constraint up front explains why results are narrower
            here than in Discover. */}
        <p className="panel__hint" style={{ margin: 0 }}>
          Showing only what works with <strong>Minecraft {instance.mcVersion}</strong>
          {kind === 'mod' && instance.loader !== 'vanilla' && (
            <>
              {' '}
              on <strong>{instance.loader}</strong>
            </>
          )}
          .
        </p>

        {error ? (
          <EmptyState
            icon={<Package size={26} />}
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
            <Loader2 size={24} className="spin" />
            <p className="empty__text">Searching…</p>
          </div>
        ) : hits.length === 0 ? (
          <EmptyState
            icon={<Package size={26} />}
            title="Nothing found"
            text={`No ${kind}s match for Minecraft ${instance.mcVersion}${kind === 'mod' && instance.loader !== 'vanilla' ? ` on ${instance.loader}` : ''}.`}
          />
        ) : (
          <div className="stack" style={{ gap: 2 }}>
            {hits.map((hit) => {
              const done = installed.has(hit.id)
              return (
                <div className="hit" key={`${hit.platform}-${hit.id}`}>
                  {hit.iconUrl ? (
                    <img className="hit__icon" src={hit.iconUrl} alt="" loading="lazy" />
                  ) : (
                    <div className="hit__icon" style={{ display: 'grid', placeItems: 'center', fontSize: 20 }}>
                      {'\u{1F4E6}'}
                    </div>
                  )}
                  <div className="hit__body">
                    <div className="hit__title">{hit.title}</div>
                    <div className="hit__desc">{hit.description}</div>
                    <div className="hit__stats">
                      <span>
                        <ArrowDownToLine size={11} style={{ verticalAlign: -1 }} /> {formatCount(hit.downloads)}
                      </span>
                      <span>by {hit.author}</span>
                      <span>Updated {formatRelative(new Date(hit.updated).getTime())}</span>
                    </div>
                  </div>
                  <div className="hit__actions">
                    <GlassButton
                      variant={done ? 'glass' : 'prominent'}
                      size="sm"
                      disabled={done || installing === hit.id}
                      onClick={() => install(hit)}
                    >
                      {done ? (
                        <>
                          <Check size={12} /> Added
                        </>
                      ) : installing === hit.id ? (
                        <>
                          <Loader2 size={12} className="spin" /> Adding
                        </>
                      ) : (
                        <>
                          <Download size={12} /> Add
                        </>
                      )}
                    </GlassButton>
                    <GlassButton
                      variant="quiet"
                      size="sm"
                      iconOnly
                      aria-label={`Open ${hit.title} in your browser`}
                      onClick={() =>
                        void call(
                          'shell:openExternal',
                          hit.platform === 'modrinth'
                            ? `https://modrinth.com/mod/${hit.slug}`
                            : `https://www.curseforge.com/minecraft/mc-mods/${hit.slug}`
                        )
                      }
                    >
                      <ExternalLink size={13} />
                    </GlassButton>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Sheet>
  )
}
