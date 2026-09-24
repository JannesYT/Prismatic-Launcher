import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import type { Task } from '../../shared/types'

/** Emits 'update' with the full task list whenever anything changes. */
export const taskBus = new EventEmitter()

const tasks = new Map<string, Task>()
const controllers = new Map<string, AbortController>()

function publish(): void {
  taskBus.emit('update', list())
}

export function list(): Task[] {
  return [...tasks.values()].sort((a, b) => b.startedAt - a.startedAt).slice(0, 100)
}

export interface TaskHandle {
  id: string
  signal: AbortSignal
  update(patch: Partial<Pick<Task, 'label' | 'detail' | 'progress' | 'bytesDone' | 'bytesTotal'>>): void
}

/**
 * Run an async job while tracking it as a cancellable task. Errors are recorded
 * on the task and rethrown so callers can still react.
 */
export async function track<T>(label: string, job: (handle: TaskHandle) => Promise<T>): Promise<T> {
  const id = randomUUID()
  const controller = new AbortController()
  controllers.set(id, controller)

  tasks.set(id, {
    id,
    label,
    detail: '',
    progress: null,
    status: 'running',
    startedAt: Date.now()
  })
  publish()

  let lastPublish = 0
  const handle: TaskHandle = {
    id,
    signal: controller.signal,
    update(patch) {
      const current = tasks.get(id)
      if (!current) return
      tasks.set(id, { ...current, ...patch })
      // Throttle: download progress can fire hundreds of times a second.
      const now = Date.now()
      if (now - lastPublish > 100) {
        lastPublish = now
        publish()
      }
    }
  }

  try {
    const result = await job(handle)
    const current = tasks.get(id)
    if (current) tasks.set(id, { ...current, status: 'done', progress: 1, detail: '' })
    publish()
    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const current = tasks.get(id)
    const cancelled = controller.signal.aborted || /cancelled/i.test(message)
    if (current) {
      tasks.set(id, {
        ...current,
        status: cancelled ? 'cancelled' : 'failed',
        error: message
      })
    }
    publish()
    throw err
  } finally {
    controllers.delete(id)
  }
}

export function cancel(id: string): boolean {
  const controller = controllers.get(id)
  if (!controller) return false
  controller.abort()
  const current = tasks.get(id)
  if (current) tasks.set(id, { ...current, status: 'cancelled' })
  publish()
  return true
}

export function clearFinished(): Task[] {
  for (const [id, task] of tasks) {
    if (task.status !== 'running') tasks.delete(id)
  }
  publish()
  return list()
}
