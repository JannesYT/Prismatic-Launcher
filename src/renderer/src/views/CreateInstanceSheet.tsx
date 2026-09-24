import { useEffect, useMemo, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { Sheet } from '../components/Sheet'
import { IconPicker } from '../components/InstanceIcon'
import { GlassButton } from '../components/Glass'
import { Badge, Field, GlassSwitch, SearchInput, Segmented } from '../components/Controls'
import { call } from '../lib/ipc'
import { useStore } from '../state/store'
import type { Instance, LoaderId, LoaderVersion, McVersionSummary } from '../../../shared/types'

const LOADERS: { value: LoaderId; label: string }[] = [
  { value: 'vanilla', label: 'Vanilla' },
  { value: 'fabric', label: 'Fabric' },
  { value: 'neoforge', label: 'NeoForge' },
  { value: 'forge', label: 'Forge' },
  { value: 'quilt', label: 'Quilt' }
]


export function CreateInstanceSheet({ open, onClose }: { open: boolean; onClose(): void }): React.JSX.Element {
  const refresh = useStore((s) => s.refreshInstances)
  const toast = useStore((s) => s.toast)
  const openDetail = useStore((s) => s.openInstanceDetail)
  const settings = useStore((s) => s.settings)

  const defaults = [
    ...(settings?.newInstance.modrinthSlugs ?? []),
    ...(settings?.newInstance.localJars ?? []).map((p) => p.split(/[\\/]/).pop() ?? p)
  ]

  const [name, setName] = useState('')
  const [nameEdited, setNameEdited] = useState(false)
  const [icon, setIcon] = useState('grass')
  const [group, setGroup] = useState('')
  const [loader, setLoader] = useState<LoaderId>('vanilla')
  const [mcVersion, setMcVersion] = useState('')
  const [loaderVersion, setLoaderVersion] = useState('')
  const [withDefaults, setWithDefaults] = useState(true)
  const [showSnapshots, setShowSnapshots] = useState(false)
  const [showOld, setShowOld] = useState(false)
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState(false)

  const [versions, setVersions] = useState<McVersionSummary[]>([])
  const [loaderVersions, setLoaderVersions] = useState<LoaderVersion[]>([])
  const [loadingLoader, setLoadingLoader] = useState(false)
  const [groups, setGroups] = useState<string[]>([])

  useEffect(() => {
    if (!open) return
    void call<McVersionSummary[]>('versions:list')
      .then((list) => {
        setVersions(list)
        const latest = list.find((v) => v.type === 'release')
        if (latest && !mcVersion) setMcVersion(latest.id)
      })
      .catch((err) => toast('error', 'Could not load the version list', String(err)))
    void call<string[]>('instances:groups').then(setGroups).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Loader versions depend on both the loader and the Minecraft version.
  useEffect(() => {
    if (loader === 'vanilla' || !mcVersion) {
      setLoaderVersions([])
      setLoaderVersion('')
      return
    }
    let cancelled = false
    setLoadingLoader(true)
    void call<LoaderVersion[]>('loaders:versions', loader, mcVersion)
      .then((list) => {
        if (cancelled) return
        setLoaderVersions(list)
        setLoaderVersion(list.find((v) => v.recommended)?.version ?? list[0]?.version ?? '')
      })
      .catch(() => {
        if (!cancelled) setLoaderVersions([])
      })
      .finally(() => {
        if (!cancelled) setLoadingLoader(false)
      })
    return () => {
      cancelled = true
    }
  }, [loader, mcVersion])

  // Suggest a name until the user types their own.
  useEffect(() => {
    if (nameEdited || !mcVersion) return
    const label = loader === 'vanilla' ? '' : ` ${LOADERS.find((l) => l.value === loader)?.label ?? ''}`
    setName(`${mcVersion}${label}`)
  }, [mcVersion, loader, nameEdited])

  const visibleVersions = useMemo(() => {
    return versions.filter((v) => {
      if (v.type === 'snapshot' && !showSnapshots) return false
      if ((v.type === 'old_beta' || v.type === 'old_alpha') && !showOld) return false
      if (filter && !v.id.includes(filter)) return false
      return true
    })
  }, [versions, showSnapshots, showOld, filter])

  const create = async (): Promise<void> => {
    if (!name.trim() || !mcVersion) return
    setBusy(true)
    try {
      const result = await call<{
        instance: Instance
        installed: string[]
        skipped: { name: string; reason: string }[]
      }>(
        'instances:create',
        {
          name: name.trim(),
          mcVersion,
          loader,
          loaderVersion: loader === 'vanilla' ? null : loaderVersion || null,
          icon,
          group: group.trim() || null
        },
        withDefaults
      )
      await refresh()

      const extra = result.installed.length ? ` with ${result.installed.join(', ')}` : ''
      toast('success', `Created ${result.instance.name}${extra}`, 'Files download the first time you press Play.')
      // Skipped mods are reported separately rather than buried: the instance
      // exists, but it is not the one that was asked for.
      if (result.skipped.length) {
        toast(
          'error',
          `${result.skipped.length} mod${result.skipped.length === 1 ? '' : 's'} could not be installed`,
          result.skipped.map((s) => `${s.name}: ${s.reason}`).join('\n')
        )
      }

      onClose()
      openDetail(result.instance.id)
      reset()
    } catch (err) {
      toast('error', 'Could not create the instance', String(err).replace(/^Error:\s*/, ''))
    } finally {
      setBusy(false)
    }
  }

  const reset = (): void => {
    setName('')
    setNameEdited(false)
    setGroup('')
    setFilter('')
    setLoader('vanilla')
  }

  const loaderUnavailable = loader !== 'vanilla' && !loadingLoader && loaderVersions.length === 0

  return (
    <Sheet
      open={open}
      title="New Instance"
      onClose={onClose}
      tall
      footer={
        <>
          <GlassButton variant="quiet" onClick={onClose}>
            Cancel
          </GlassButton>
          <GlassButton
            variant="prominent"
            disabled={busy || !name.trim() || !mcVersion || loaderUnavailable}
            onClick={() => void create()}
          >
            {busy ? <Loader2 size={15} className="spin" /> : <Check size={15} />}
            Create
          </GlassButton>
        </>
      }
    >
      <div className="stack" style={{ gap: 'var(--sp-4)' }}>
        <div className="hstack" style={{ alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <Field label="Name">
              <input
                className="input"
                value={name}
                placeholder="My instance"
                onChange={(e) => {
                  setName(e.target.value)
                  setNameEdited(true)
                }}
              />
            </Field>
          </div>
          <div style={{ width: 170 }}>
            <Field label="Group">
              <input
                className="input"
                value={group}
                placeholder="Optional"
                list="instance-groups"
                onChange={(e) => setGroup(e.target.value)}
              />
              <datalist id="instance-groups">
                {groups.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </Field>
          </div>
        </div>

        <div>
          <span className="field__label">Icon</span>
          <div style={{ marginTop: 8 }}>
            <IconPicker value={icon} onChange={setIcon} />
          </div>
        </div>

        <div>
          <span className="field__label">Mod Loader</span>
          <div style={{ marginTop: 8 }}>
            <Segmented value={loader} onChange={setLoader} options={LOADERS} layoutId="create-loader" />
          </div>
        </div>

        <div>
          <div className="hstack" style={{ marginBottom: 8 }}>
            <span className="field__label" style={{ flex: 'none' }}>
              Minecraft Version
            </span>
            <span className="spacer" />
            <SearchInput value={filter} onChange={setFilter} placeholder="Filter" />
          </div>
          <div className="hstack" style={{ marginBottom: 8, gap: 'var(--sp-4)' }}>
            <label className="hstack" style={{ gap: 8, fontSize: 'var(--fs-caption)', color: 'var(--ink-3)' }}>
              <GlassSwitch checked={showSnapshots} onChange={setShowSnapshots} label="Show snapshots" />
              Snapshots
            </label>
            <label className="hstack" style={{ gap: 8, fontSize: 'var(--fs-caption)', color: 'var(--ink-3)' }}>
              <GlassSwitch checked={showOld} onChange={setShowOld} label="Show old versions" />
              Historical
            </label>
          </div>

          <div
            className="glass glass--allow-nested"
            style={{ maxHeight: 250, overflowY: 'auto', padding: 4, borderRadius: 'var(--r-lg)' }}
          >
            {visibleVersions.length === 0 ? (
              <p className="panel__hint" style={{ padding: 'var(--sp-3)' }}>
                No versions match. Loading the manifest can take a moment on first run.
              </p>
            ) : (
              visibleVersions.slice(0, 300).map((v) => (
                <button
                  key={v.id}
                  className="row row--button"
                  style={{ minHeight: 40, padding: '8px 12px' }}
                  onClick={() => setMcVersion(v.id)}
                >
                  <span className="row__text">
                    <span className="row__label" style={{ fontWeight: mcVersion === v.id ? 700 : 500 }}>
                      {v.id}
                    </span>
                  </span>
                  <span className="row__control">
                    {v.type !== 'release' && <Badge>{v.type.replace('old_', '')}</Badge>}
                    {mcVersion === v.id && <Check size={15} color="var(--accent)" />}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        {loader !== 'vanilla' && (
          <div className="row" style={{ padding: 0 }}>
            <span className="row__text">
              <span className="row__label">Install my default mods</span>
              <span className="row__desc">
                {defaults.length
                  ? defaults.join(', ')
                  : 'Nothing configured yet — set this up in Settings → New Instances.'}
              </span>
            </span>
            <span className="row__control">
              <GlassSwitch
                checked={withDefaults && defaults.length > 0}
                disabled={defaults.length === 0}
                onChange={setWithDefaults}
                label="Install my default mods"
              />
            </span>
          </div>
        )}

        {loader !== 'vanilla' && (
          <Field
            label={`${LOADERS.find((l) => l.value === loader)?.label} Version`}
            hint={
              loaderUnavailable
                ? `No ${loader} builds exist for Minecraft ${mcVersion}. Pick a different version or loader.`
                : undefined
            }
          >
            {loadingLoader ? (
              <div className="hstack muted" style={{ fontSize: 'var(--fs-caption)', height: 38 }}>
                <Loader2 size={14} className="spin" /> Loading builds…
              </div>
            ) : (
              <select className="select" value={loaderVersion} onChange={(e) => setLoaderVersion(e.target.value)}>
                {loaderVersions.map((v) => (
                  <option key={v.version} value={v.version}>
                    {v.version}
                    {v.recommended ? ' — recommended' : ''}
                    {!v.stable ? ' (beta)' : ''}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
      </div>
    </Sheet>
  )
}
