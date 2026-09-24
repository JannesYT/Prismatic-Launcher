import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, CheckCircle2, Info, X, Loader2 } from 'lucide-react'
import { TitleBar } from './components/TitleBar'
import { BottomTabBar } from './components/BottomTabBar'
import { NavRail } from './components/NavRail'
import { ErrorBoundary } from './components/ErrorBoundary'
import { UpdateBanner } from './components/UpdateBanner'
import { Scroller } from './components/Scroller'
import { GlassFilters, GlassButton } from './components/Glass'
import { InstancesView } from './views/InstancesView'
import { NewsView } from './views/NewsView'
import { InstanceDetail } from './views/InstanceDetail'
import { DiscoverView } from './views/DiscoverView'
import { AccountsView } from './views/AccountsView'
import { TasksView } from './views/TasksView'
import { SettingsView } from './views/SettingsView'
import { useStore, type TabId } from './state/store'
import { applyAppearance, lensScale } from './lib/appearance'
import { call } from './lib/ipc'

export default function App(): React.JSX.Element {
  const ready = useStore((s) => s.ready)
  const init = useStore((s) => s.init)
  const settings = useStore((s) => s.settings)
  const tab = useStore((s) => s.tab)
  const setTab = useStore((s) => s.setTab)
  const openInstance = useStore((s) => s.openInstance)
  const tasks = useStore((s) => s.tasks)

  const [minimized, setMinimized] = useState(false)
  const [platform, setPlatform] = useState('win32')
  const layout = settings?.appearance.layout ?? 'bottomTabs'

  useEffect(() => {
    void init()
    void call<{ platform: string }>('app:info')
      .then((info) => setPlatform(info.platform))
      .catch(() => {})
  }, [init])

  // Appearance settings flow into CSS custom properties and data attributes.
  useEffect(() => {
    if (settings) applyAppearance(settings, platform)
  }, [settings, platform])

  // Tab bar minimize behaviour, driven by the scroll direction.
  const onDirection = useCallback(
    (direction: 'up' | 'down') => {
      // Only the floating bar can minimize; a rail has nothing to get out of
      // the way of.
      if (layout !== 'bottomTabs' || settings?.appearance.tabBarMinimize !== 'onScrollDown') {
        setMinimized(false)
        return
      }
      setMinimized(direction === 'down')
    },
    [settings?.appearance.tabBarMinimize, layout]
  )

  useEffect(() => {
    if (settings?.appearance.tabBarMinimize === 'never') setMinimized(false)
  }, [settings?.appearance.tabBarMinimize])

  // Keyboard shortcuts: Ctrl/Cmd+1..5 switch tabs, Escape leaves a detail view.
  useEffect(() => {
    const order: TabId[] = ['instances', 'news', 'discover', 'accounts', 'tasks', 'settings']
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '6') {
        e.preventDefault()
        setTab(order[Number(e.key) - 1])
      }
      if (e.key === 'Escape' && openInstance) {
        useStore.getState().openInstanceDetail(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setTab, openInstance])

  const runningTasks = tasks.filter((t) => t.status === 'running').length

  if (!ready || !settings) {
    return (
      <>
        <div className="app-backdrop" />
        <div className="app" style={{ placeItems: 'center', display: 'grid' }}>
          <Loader2 size={26} className="spin" style={{ color: 'var(--accent)' }} />
        </div>
      </>
    )
  }

  return (
    <>
      <div className="app-backdrop" />
      {settings.appearance.backgroundImage && <div className="app-wallpaper" />}
      <GlassFilters scale={lensScale(settings)} />

      <div className="app">
        <TitleBar />

        {/* Rail layouts put navigation outside the scroll area; the floating
            layout keeps it overlapping the content instead. */}
        {layout !== 'bottomTabs' && (
          <NavRail
            tab={tab}
            onSelect={setTab}
            badges={{ tasks: runningTasks }}
            compact={layout === 'compact'}
          />
        )}

        <main className="main">
          <Scroller onDirection={onDirection}>
            {/* Above the views rather than inside one, so it is visible
                wherever the user happens to be. */}
            <div className="view" style={{ paddingBottom: 0 }}>
              <UpdateBanner />
            </div>
            {/* The incoming view fades up into place.
                Deliberately NOT wrapped in <AnimatePresence mode="wait">: that
                holds the new view back until the outgoing one reports its exit
                animation finished, so a single dropped callback leaves the app
                showing the previous tab forever. Navigation must never depend on
                an animation completing. Changing the key swaps the view
                immediately and the new one animates in on its own. */}
              <motion.div
                key={openInstance ? `detail-${openInstance}` : tab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: settings.appearance.reduceMotion ? 0 : 0.2, ease: [0.22, 0.61, 0.36, 1] }}
              >
                {/* Keyed to the view, so the boundary resets itself when the
                    user navigates away from whatever broke. */}
                <ErrorBoundary
                  key={openInstance ? `detail-${openInstance}` : tab}
                  label={openInstance ? 'This instance' : `The ${tab} tab`}
                >
                {openInstance ? (
                  <InstanceDetail id={openInstance} />
                ) : tab === 'instances' ? (
                  <InstancesView />
                ) : tab === 'news' ? (
                  <NewsView />
                ) : tab === 'discover' ? (
                  <DiscoverView />
                ) : tab === 'accounts' ? (
                  <AccountsView />
                ) : tab === 'tasks' ? (
                  <TasksView />
                ) : (
                  <SettingsView />
                )}
                </ErrorBoundary>
              </motion.div>
          </Scroller>

          {layout === 'bottomTabs' && (
            <BottomTabBar
              tab={tab}
              onSelect={setTab}
              minimized={minimized}
              labels={settings.appearance.tabBarLabels}
              badges={{ tasks: runningTasks }}
            />
          )}
        </main>
      </div>

      <Toasts />
    </>
  )
}

function Toasts(): React.JSX.Element {
  const toasts = useStore((s) => s.toasts)
  const dismiss = useStore((s) => s.dismissToast)

  return (
    <div className="toast-stack" aria-live="polite">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            className="glass toast"
            data-kind={toast.kind}
            initial={{ opacity: 0, x: 24, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 24, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 460, damping: 34 }}
          >
            <span className="toast__icon">
              {toast.kind === 'error' ? (
                <AlertCircle size={16} />
              ) : toast.kind === 'success' ? (
                <CheckCircle2 size={16} />
              ) : (
                <Info size={16} />
              )}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ fontWeight: 620 }}>{toast.title}</strong>
              {toast.detail && (
                <span
                  style={{
                    display: 'block',
                    color: 'var(--ink-3)',
                    marginTop: 2,
                    fontSize: 'var(--fs-caption)',
                    // Backend messages use blank lines to separate cause from
                    // remedy; collapsing them would run it all together.
                    whiteSpace: 'pre-line'
                  }}
                >
                  {toast.detail}
                </span>
              )}
            </span>
            <GlassButton variant="quiet" size="sm" iconOnly aria-label="Dismiss" onClick={() => dismiss(toast.id)}>
              <X size={13} />
            </GlassButton>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
