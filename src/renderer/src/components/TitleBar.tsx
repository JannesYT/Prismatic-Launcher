import { useEffect, useState } from 'react'
import { Minus, Square, Copy, X } from 'lucide-react'
import { call, isElectron, on } from '../lib/ipc'
import { useStore } from '../state/store'
import { ProgressBar } from './Controls'

/** Frameless-window title bar: drag region, live launch progress, window controls. */
export function TitleBar(): React.JSX.Element {
  const [maximized, setMaximized] = useState(false)
  const launchProgress = useStore((s) => s.launchProgress)
  const running = useStore((s) => s.running)
  const instances = useStore((s) => s.instances)

  useEffect(() => {
    return on('window:state', (payload: never) => {
      setMaximized((payload as unknown as { maximized: boolean }).maximized)
    })
  }, [])

  const runningNames = running
    .map((r) => instances.find((i) => i.id === r.instanceId)?.name ?? r.instanceId)
    .join(', ')

  return (
    <header className="titlebar">
      <span className="titlebar__brand">
        <span className="titlebar__mark" />
        Prismatic
      </span>

      {launchProgress ? (
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 'var(--fs-caption)',
            color: 'var(--ink-3)',
            minWidth: 260,
            maxWidth: 420,
            flex: 1
          }}
        >
          <span className="truncate" style={{ flex: 'none', maxWidth: 200 }}>
            {launchProgress.label}
            {launchProgress.detail ? ` — ${launchProgress.detail}` : ''}
          </span>
          <span style={{ flex: 1 }}>
            <ProgressBar value={launchProgress.fraction} />
          </span>
        </span>
      ) : runningNames ? (
        <span style={{ fontSize: 'var(--fs-caption)', color: 'var(--ink-3)' }} className="truncate">
          Running: {runningNames}
        </span>
      ) : null}

      <span className="titlebar__spacer" />

      {isElectron && (
        <div className="titlebar__controls">
          <button className="win-btn" onClick={() => void call('window:minimize')} aria-label="Minimize">
            <Minus size={15} />
          </button>
          <button
            className="win-btn"
            onClick={() => {
              void call<boolean>('window:maximize').then(setMaximized)
            }}
            aria-label={maximized ? 'Restore' : 'Maximize'}
          >
            {maximized ? <Copy size={13} /> : <Square size={13} />}
          </button>
          <button
            className="win-btn win-btn--close"
            onClick={() => void call('window:close')}
            aria-label="Close"
          >
            <X size={15} />
          </button>
        </div>
      )}
    </header>
  )
}
