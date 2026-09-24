import { useEffect, useState } from 'react'
import { Play, Store, Info } from 'lucide-react'
import { GlassButton } from '../components/Glass'
import { Badge } from '../components/Controls'
import { useStore } from '../state/store'
import { call } from '../lib/ipc'
import { formatRelative } from '../lib/appearance'

interface BedrockInstall {
  id: 'retail' | 'preview'
  name: string
  packageFamilyName: string
  version: string
}

/**
 * Bedrock Edition, shown alongside the Java instances.
 *
 * Deliberately a single tile rather than an instance: Bedrock is a Store app,
 * so there are no versions to manage, no mods to install and no settings to
 * pass. Presenting it as an instance would promise all of that.
 */
export function BedrockTile(): React.JSX.Element | null {
  const settings = useStore((s) => s.settings)
  const toast = useStore((s) => s.toast)

  const [supported, setSupported] = useState<boolean | null>(null)
  const [installs, setInstalls] = useState<BedrockInstall[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void call<boolean>('bedrock:supported')
      .then((ok) => {
        setSupported(ok)
        if (ok) void call<BedrockInstall[]>('bedrock:detect').then(setInstalls).catch(() => {})
      })
      .catch(() => setSupported(false))
  }, [])

  // Hidden entirely when turned off, or on a platform where Bedrock cannot run.
  if (!settings?.bedrock.show) return null
  if (supported === false || supported === null) return null

  const installed = installs.length > 0
  const preview = installs.find((i) => i.id === 'preview')
  const retail = installs.find((i) => i.id === 'retail')
  const chosen = settings.bedrock.preferPreview ? (preview ?? retail) : (retail ?? preview)

  const launch = (): void => {
    setBusy(true)
    void call<BedrockInstall>('bedrock:launch', settings.bedrock.preferPreview)
      .then((started) => toast('success', `Starting ${started.name}`))
      .catch((err) => toast('error', 'Could not start Bedrock', String(err).replace(/^Error:\s*/, '')))
      .finally(() => setBusy(false))
  }

  return (
    <section className="group">
      <div className="group__header" style={{ cursor: 'default' }}>
        Bedrock Edition
      </div>

      <div className="glass panel" style={{ padding: 'var(--sp-3)' }}>
        <div className="hstack" style={{ gap: 'var(--sp-3)' }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 'var(--r-md)',
              display: 'grid',
              placeItems: 'center',
              fontSize: 26,
              background: 'var(--fill)',
              flex: 'none'
            }}
          >
            {'\u{1F9F1}'}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="hstack" style={{ gap: 'var(--sp-2)' }}>
              <span style={{ fontWeight: 620 }}>{chosen?.name ?? 'Minecraft for Windows'}</span>
              {chosen?.version && <Badge>{chosen.version}</Badge>}
              {preview && retail && (
                <Badge tone="accent">{settings.bedrock.preferPreview ? 'Preview' : 'Retail'}</Badge>
              )}
            </div>
            <div className="row__desc">
              {installed ? (
                <>
                  Launches the Store app.{' '}
                  {settings.bedrock.lastPlayed
                    ? `Last started ${formatRelative(settings.bedrock.lastPlayed)}.`
                    : 'Version, mods and settings are managed inside the game itself.'}
                </>
              ) : (
                'Not installed. Prismatic can start Bedrock, but cannot install it for you.'
              )}
            </div>
          </div>

          <div className="row__control">
            {installed ? (
              <GlassButton variant="prominent" onClick={launch} disabled={busy}>
                <Play size={14} /> Play
              </GlassButton>
            ) : (
              <GlassButton variant="glass" onClick={() => void call('bedrock:store')}>
                <Store size={14} /> Get it
              </GlassButton>
            )}
          </div>
        </div>

        {installed && (
          <p className="panel__hint" style={{ padding: 'var(--sp-3) 0 0', display: 'flex', gap: 6 }}>
            <Info size={12} style={{ flex: 'none', marginTop: 2 }} />
            <span>
              Bedrock is a Microsoft Store app, so it takes no launch settings and signs in through its own Xbox
              flow. Your Java accounts and per-instance options do not apply to it.
            </span>
          </p>
        )}
      </div>
    </section>
  )
}
