import { create } from 'zustand'
import { call, on } from '../lib/ipc'
import type { Account, Instance, LogLine, Settings, Task } from '../../../shared/types'

export type TabId = 'instances' | 'news' | 'discover' | 'accounts' | 'tasks' | 'settings'

export interface Toast {
  id: string
  kind: 'info' | 'success' | 'error'
  title: string
  detail?: string
}

interface RunningGame {
  instanceId: string
  pid: number
  startedAt: number
  exitCode: number | null
}

interface AppState {
  ready: boolean
  tab: TabId
  /** When set, the instance detail view replaces the instance grid. */
  openInstance: string | null
  settings: Settings | null
  instances: Instance[]
  accounts: Account[]
  tasks: Task[]
  running: RunningGame[]
  /** Live log lines per instance, capped so a long session can't eat memory. */
  logs: Record<string, LogLine[]>
  toasts: Toast[]
  launchProgress: { label: string; detail: string; fraction: number | null } | null

  init(): Promise<void>
  setTab(tab: TabId): void
  openInstanceDetail(id: string | null): void
  patchSettings(patch: DeepPartial<Settings>): Promise<void>
  refreshInstances(): Promise<void>
  refreshAccounts(): Promise<void>
  refreshTasks(): Promise<void>
  launch(id: string, server?: string): Promise<void>
  kill(id: string): Promise<void>
  toast(kind: Toast['kind'], title: string, detail?: string): void
  dismissToast(id: string): void
  clearLogs(instanceId: string): void
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]
}

const LOG_CAP = 5000

export const useStore = create<AppState>((set, get) => ({
  ready: false,
  tab: 'instances',
  openInstance: null,
  settings: null,
  instances: [],
  accounts: [],
  tasks: [],
  running: [],
  logs: {},
  toasts: [],
  launchProgress: null,

  async init() {
    try {
      const [settings, instances, accounts, tasks, running] = await Promise.all([
        call<Settings>('settings:get'),
        call<Instance[]>('instances:list'),
        call<Account[]>('accounts:list'),
        call<Task[]>('tasks:list'),
        call<RunningGame[]>('game:running')
      ])
      set({ settings, instances, accounts, tasks, running, ready: true })
    } catch (err) {
      set({ ready: true })
      get().toast('error', 'Could not load launcher data', String(err))
    }

    // --- Push channels ---------------------------------------------------
    on('tasks:update', (tasks: never) => set({ tasks: tasks as unknown as Task[] }))
    on('game:state', (state: never) => set({ running: state as unknown as RunningGame[] }))
    on('launch:progress', (p: never) =>
      set({ launchProgress: p as unknown as AppState['launchProgress'] })
    )

    on('log:line', (payload: never) => {
      const line = payload as unknown as LogLine
      set((s) => {
        const existing = s.logs[line.instanceId] ?? []
        const next = existing.length >= LOG_CAP ? existing.slice(-LOG_CAP + 1) : existing
        return { logs: { ...s.logs, [line.instanceId]: [...next, line] } }
      })
    })

    on('game:exit', (payload: never) => {
      const { instanceId, code } = payload as unknown as { instanceId: string; code: number | null }
      const name = get().instances.find((i) => i.id === instanceId)?.name ?? instanceId
      set({ launchProgress: null })
      void get().refreshInstances()
      if (code === 0 || code === null) get().toast('info', `${name} closed`)
      else get().toast('error', `${name} crashed`, `Exit code ${code}. Open the instance's Log tab for details.`)
    })

    on('accounts:msaDone', (payload: never) => {
      const result = payload as unknown as { ok: boolean; accounts?: Account[]; account?: Account; error?: string }
      if (result.ok && result.accounts) {
        set({ accounts: result.accounts })
        get().toast('success', `Signed in as ${result.account?.username ?? 'your account'}`)
      } else {
        get().toast('error', 'Microsoft sign-in failed', result.error)
      }
    })

    on('theme:update', () => {
      // Re-apply, since 'system' theme derives its palette from the OS.
      const settings = get().settings
      if (settings) set({ settings: { ...settings } })
    })
  },

  setTab(tab) {
    set({ tab, openInstance: tab === 'instances' ? get().openInstance : null })
  },

  openInstanceDetail(id) {
    set({ openInstance: id, tab: 'instances' })
  },

  async patchSettings(patch) {
    // Optimistic: the UI should respond to a slider instantly, not after a round trip.
    const current = get().settings
    if (current) set({ settings: mergeLocal(current, patch) })
    try {
      const saved = await call<Settings>('settings:save', patch)
      set({ settings: saved })
    } catch (err) {
      get().toast('error', 'Could not save settings', String(err))
      if (current) set({ settings: current })
    }
  },

  async refreshInstances() {
    try {
      set({ instances: await call<Instance[]>('instances:list') })
    } catch (err) {
      get().toast('error', 'Could not list instances', String(err))
    }
  },

  async refreshAccounts() {
    try {
      set({ accounts: await call<Account[]>('accounts:list') })
    } catch (err) {
      get().toast('error', 'Could not list accounts', String(err))
    }
  },

  async refreshTasks() {
    try {
      set({ tasks: await call<Task[]>('tasks:list') })
    } catch {
      /* the push channel will catch up */
    }
  },

  async launch(id, server) {
    const inst = get().instances.find((i) => i.id === id)
    const active = get().accounts.find((a) => a.active)
    if (!active) {
      get().toast('error', 'No account selected', 'Add a Microsoft or offline account first.')
      set({ tab: 'accounts' })
      return
    }
    try {
      get().toast('info', `Starting ${inst?.name ?? id}`)
      await call('game:launch', id, active.id, server)
      const settings = get().settings
      if (settings?.minecraft.showLogAfterLaunch) get().openInstanceDetail(id)
    } catch (err) {
      set({ launchProgress: null })
      get().toast('error', `Could not launch ${inst?.name ?? id}`, String(err).replace(/^Error:\s*/, ''))
    }
  },

  async kill(id) {
    try {
      await call('game:kill', id)
    } catch (err) {
      get().toast('error', 'Could not stop the game', String(err))
    }
  },

  toast(kind, title, detail) {
    const id = Math.random().toString(36).slice(2)
    set((s) => ({ toasts: [...s.toasts, { id, kind, title, detail }] }))
    // Errors stay until dismissed; everything else fades.
    if (kind !== 'error') {
      setTimeout(() => get().dismissToast(id), 4200)
    }
  },

  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },

  clearLogs(instanceId) {
    set((s) => ({ logs: { ...s.logs, [instanceId]: [] } }))
  }
}))

function mergeLocal<T>(base: T, patch: unknown): T {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return patch as T
  if (base === null || typeof base !== 'object') return patch as T
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    out[k] = k in out ? mergeLocal((base as Record<string, unknown>)[k], v) : v
  }
  return out as T
}
