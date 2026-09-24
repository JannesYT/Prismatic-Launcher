import { CheckCircle2, ListChecks, Loader2, XCircle, X, Trash2, Ban } from 'lucide-react'
import { GlassButton } from '../components/Glass'
import { Badge, EmptyState, Panel, ProgressBar } from '../components/Controls'
import { useStore } from '../state/store'
import { call } from '../lib/ipc'
import { formatBytes, formatDuration } from '../lib/appearance'

export function TasksView(): React.JSX.Element {
  const tasks = useStore((s) => s.tasks)
  const refresh = useStore((s) => s.refreshTasks)

  const running = tasks.filter((t) => t.status === 'running')
  const finished = tasks.filter((t) => t.status !== 'running')

  return (
    <div className="view">
      <div className="view__header">
        <div>
          <h1 className="view__title">Tasks</h1>
          <p className="view__subtitle">
            {running.length > 0 ? `${running.length} in progress` : 'Downloads, installs and sign-ins appear here'}
          </p>
        </div>
        {finished.length > 0 && (
          <div className="view__actions">
            <GlassButton variant="quiet" onClick={() => void call('tasks:clear').then(() => refresh())}>
              <Trash2 size={14} /> Clear finished
            </GlassButton>
          </div>
        )}
      </div>

      {tasks.length === 0 ? (
        <EmptyState
          icon={<ListChecks size={30} />}
          title="Nothing running"
          text="When you launch an instance, install a mod or import a pack, its progress shows up here and you can cancel it."
        />
      ) : (
        <>
          {running.length > 0 && (
            <Panel title="In Progress">
              {running.map((task) => (
                <div className="row" key={task.id}>
                  <Loader2 size={17} className="spin" style={{ flex: 'none', color: 'var(--accent)' }} />
                  <span className="row__text">
                    <span className="row__label">{task.label}</span>
                    {task.detail && <span className="row__desc">{task.detail}</span>}
                    <span style={{ display: 'block', marginTop: 8, maxWidth: 480 }}>
                      <ProgressBar value={task.progress} />
                    </span>
                    {task.bytesTotal ? (
                      <span className="row__desc">
                        {formatBytes(task.bytesDone ?? 0)} of {formatBytes(task.bytesTotal)}
                      </span>
                    ) : null}
                  </span>
                  <span className="row__control">
                    <span className="muted" style={{ fontSize: 'var(--fs-caption)' }}>
                      {formatDuration((Date.now() - task.startedAt) / 1000)}
                    </span>
                    <GlassButton
                      variant="quiet"
                      size="sm"
                      iconOnly
                      aria-label="Cancel task"
                      onClick={() => void call('tasks:cancel', task.id).then(() => refresh())}
                    >
                      <X size={14} />
                    </GlassButton>
                  </span>
                </div>
              ))}
            </Panel>
          )}

          {finished.length > 0 && (
            <Panel title="History">
              {finished.map((task) => (
                <div className="row" key={task.id}>
                  <span style={{ flex: 'none' }}>
                    {task.status === 'done' ? (
                      <CheckCircle2 size={17} color="var(--ok)" />
                    ) : task.status === 'cancelled' ? (
                      <Ban size={17} color="var(--ink-4)" />
                    ) : (
                      <XCircle size={17} color="var(--bad)" />
                    )}
                  </span>
                  <span className="row__text">
                    <span className="row__label">{task.label}</span>
                    {task.error && (
                      <span className="row__desc" style={{ color: 'var(--bad)' }}>
                        {task.error}
                      </span>
                    )}
                  </span>
                  <span className="row__control">
                    <Badge tone={task.status === 'done' ? 'ok' : task.status === 'cancelled' ? undefined : 'bad'}>
                      {task.status}
                    </Badge>
                  </span>
                </div>
              ))}
            </Panel>
          )}
        </>
      )}
    </div>
  )
}
