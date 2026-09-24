import { useEffect, useState } from 'react'
import { Upload, Trash2 } from 'lucide-react'
import { GlassButton } from './Glass'
import { call } from '../lib/ipc'
import { useStore } from '../state/store'

/** The built-in glyph set, used when an instance has no custom image. */
export const BUILT_IN_ICONS: Record<string, string> = {
  grass: '\u{1F33F}',
  package: '\u{1F4E6}',
  gear: '⚙️',
  zap: '⚡',
  sword: '⚔️',
  sparkles: '✨',
  flask: '\u{1F9EA}',
  skull: '\u{1F480}',
  diamond: '\u{1F48E}',
  fire: '\u{1F525}',
  compass: '\u{1F9ED}',
  rocket: '\u{1F680}',
  anvil: '\u{1F528}',
  map: '\u{1F5FA}️',
  chest: '\u{1F9F0}',
  potion: '\u{1F9EB}',
  crown: '\u{1F451}',
  ghost: '\u{1F47B}'
}

export interface StoredIcon {
  key: string
  path: string
  sizeBytes: number
  addedAt: number
}

/** Custom icons live outside the bundle, so they load via the safe protocol. */
export function iconUrl(path: string): string {
  return `prismatic-file:///${encodeURIComponent(path)}`
}

/**
 * Renders whichever kind of icon an instance has: a stored image, or a glyph.
 * Everywhere an instance is drawn uses this, so adding a kind of icon does not
 * mean finding every list that shows one.
 */
export function InstanceIcon({
  icon,
  size = 64,
  className = ''
}: {
  icon: string
  size?: number
  className?: string
}): React.JSX.Element {
  const [resolved, setResolved] = useState<string | null>(null)
  const isCustom = icon.startsWith('file:')

  useEffect(() => {
    if (!isCustom) {
      setResolved(null)
      return
    }
    let cancelled = false
    void call<string | null>('icons:resolve', icon)
      .then((path) => {
        if (!cancelled) setResolved(path)
      })
      .catch(() => {
        if (!cancelled) setResolved(null)
      })
    return () => {
      cancelled = true
    }
  }, [icon, isCustom])

  if (isCustom && resolved) {
    return (
      <div className={`${className} card__icon--image`.trim()} style={{ width: size, height: size }}>
        <img src={iconUrl(resolved)} alt="" width={size} height={size} />
      </div>
    )
  }

  // A deleted custom icon falls back to the default glyph rather than a broken
  // image, so the instance stays usable.
  return (
    <div className={className} style={{ width: size, height: size, fontSize: Math.round(size * 0.5) }}>
      {BUILT_IN_ICONS[icon] ?? BUILT_IN_ICONS.grass}
    </div>
  )
}

/**
 * Icon chooser: built-in glyphs, previously imported images, and a drop target
 * for a new one.
 */
export function IconPicker({
  value,
  onChange
}: {
  value: string
  onChange(next: string): void
}): React.JSX.Element {
  const toast = useStore((s) => s.toast)
  const [custom, setCustom] = useState<StoredIcon[]>([])
  const [dragOver, setDragOver] = useState(false)

  const reload = (): void => {
    // Never trust the channel to return an array: a handler that fails, or a
    // build where it does not exist yet, would otherwise take the whole app
    // down on the first .map().
    void call<StoredIcon[] | null>('icons:list')
      .then((list) => setCustom(Array.isArray(list) ? list : []))
      .catch(() => setCustom([]))
  }
  useEffect(reload, [])

  const importViaDialog = (): void => {
    void call<StoredIcon | null>('icons:import')
      .then((icon) => {
        if (!icon) return
        reload()
        onChange(icon.key)
      })
      .catch((err) => toast('error', 'Could not use that image', String(err).replace(/^Error:\s*/, '')))
  }

  const importDropped = (files: FileList): void => {
    // Electron exposes the real path on dropped files; without it there is
    // nothing the main process can copy.
    const paths = Array.from(files)
      .map((f) => (f as File & { path?: string }).path)
      .filter((p): p is string => Boolean(p))

    if (paths.length === 0) {
      toast('error', 'Could not read that file', 'Try the Upload button instead.')
      return
    }
    void call<StoredIcon>('icons:importPath', paths[0])
      .then((icon) => {
        reload()
        onChange(icon.key)
      })
      .catch((err) => toast('error', 'Could not use that image', String(err).replace(/^Error:\s*/, '')))
  }

  return (
    <div className="stack" style={{ gap: 'var(--sp-3)' }}>
      <div className="icon-grid">
        {Object.entries(BUILT_IN_ICONS).map(([key, glyph]) => (
          <button
            key={key}
            type="button"
            className="icon-choice"
            data-active={value === key}
            aria-label={key}
            aria-pressed={value === key}
            onClick={() => onChange(key)}
          >
            {glyph}
          </button>
        ))}

        {custom.map((icon) => (
          <button
            key={icon.key}
            type="button"
            className="icon-choice"
            data-active={value === icon.key}
            aria-label="Custom icon"
            aria-pressed={value === icon.key}
            onClick={() => onChange(icon.key)}
            onContextMenu={(e) => {
              e.preventDefault()
              void call('icons:delete', icon.key).then(() => {
                reload()
                if (value === icon.key) onChange('grass')
              })
            }}
            title="Right-click to remove"
          >
            <img src={iconUrl(icon.path)} alt="" />
          </button>
        ))}
      </div>

      <div
        className="icon-drop"
        data-over={dragOver}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          if (e.dataTransfer.files.length) importDropped(e.dataTransfer.files)
        }}
      >
        Drop an image here, or{' '}
        <GlassButton variant="quiet" size="sm" onClick={importViaDialog}>
          <Upload size={12} /> choose a file
        </GlassButton>
        <div style={{ marginTop: 4, opacity: 0.7 }}>PNG, JPG, GIF, WebP or ICO, up to 8 MB</div>
      </div>

      {custom.length > 0 && (
        <p className="panel__hint" style={{ margin: 0 }}>
          <Trash2 size={11} style={{ verticalAlign: -1 }} /> Right-click a custom icon to remove it.
        </p>
      )}
    </div>
  )
}
