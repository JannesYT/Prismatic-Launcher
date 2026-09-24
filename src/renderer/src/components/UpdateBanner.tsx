import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Download, X, Sparkles } from 'lucide-react'
import { GlassButton } from './Glass'
import { Markdown } from '../lib/markdown'
import { useStore } from '../state/store'
import { call } from '../lib/ipc'

export interface UpdateInfo {
  currentVersion: string
  latestVersion: string
  updateAvailable: boolean
  notes: string
  url: string
  downloadUrl: string | null
  publishedAt: string | null
  checkedAt: number
}

/**
 * Tells the user a newer version exists.
 *
 * Shown once per version: dismissing records the version, so the same update
 * never nags twice, but the next one still gets through.
 */
export function UpdateBanner(): React.JSX.Element | null {
  const settings = useStore((s) => s.settings)
  const patch = useStore((s) => s.patchSettings)
  const [info, setInfo] = useState<UpdateInfo | null>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!settings?.updates.checkOnStartup) return
    if (settings.updates.source === 'none') return
    // A failed check is silent on startup: the user did not ask, so an error
    // toast would be noise about something they cannot act on.
    void call<UpdateInfo>('updates:check')
      .then((result) => {
        if (result?.updateAvailable) setInfo(result)
      })
      .catch(() => {})
    // Intentionally runs once; re-checking on every settings change would spam
    // the API while someone types a repository name.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!info || !settings) return null
  if (settings.updates.dismissedVersion === info.latestVersion) return null

  const dismiss = (): void => {
    void patch({ updates: { dismissedVersion: info.latestVersion } })
    setInfo(null)
  }

  return (
    <AnimatePresence>
      <motion.div
        className="glass"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
        style={{
          margin: '0 auto var(--sp-4)',
          maxWidth: 'var(--content-max)',
          padding: 'var(--sp-3) var(--sp-4)',
          borderRadius: 'var(--r-lg)'
        }}
      >
        <div className="hstack" style={{ gap: 'var(--sp-3)' }}>
          <Sparkles size={18} style={{ color: 'var(--accent)', flex: 'none' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 620, fontSize: 'var(--fs-label)' }}>
              Prismatic {info.latestVersion} is available
            </div>
            <div className="row__desc">
              You have {info.currentVersion}.{' '}
              {info.notes && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    color: 'var(--accent)',
                    cursor: 'pointer',
                    font: 'inherit'
                  }}
                >
                  {expanded ? 'Hide' : "What's new"}
                </button>
              )}
            </div>
          </div>
          <div className="row__control">
            <GlassButton variant="prominent" size="sm" onClick={() => void call('updates:download', info)}>
              <Download size={13} /> Download
            </GlassButton>
            <GlassButton variant="quiet" size="sm" iconOnly aria-label="Dismiss" onClick={dismiss}>
              <X size={14} />
            </GlassButton>
          </div>
        </div>

        {expanded && info.notes && (
          <div style={{ marginTop: 'var(--sp-3)', paddingTop: 'var(--sp-3)', boxShadow: 'inset 0 1px 0 var(--line)' }}>
            <Markdown source={info.notes} />
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
