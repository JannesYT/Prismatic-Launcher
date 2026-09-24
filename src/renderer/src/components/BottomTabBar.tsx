import { motion } from 'framer-motion'
import { Boxes, Compass, ListChecks, Newspaper, Settings as SettingsIcon, UserRound } from 'lucide-react'
import type { TabId } from '../state/store'

export interface TabDef {
  id: TabId
  label: string
  icon: React.JSX.Element
  /** Search-role tabs are pinned to the trailing end, as the system does. */
  role?: 'search'
}

export const TABS: TabDef[] = [
  { id: 'instances', label: 'Instances', icon: <Boxes size={19} strokeWidth={2} /> },
  { id: 'news', label: 'News', icon: <Newspaper size={19} strokeWidth={2} /> },
  { id: 'discover', label: 'Discover', icon: <Compass size={19} strokeWidth={2} />, role: 'search' },
  { id: 'accounts', label: 'Accounts', icon: <UserRound size={19} strokeWidth={2} /> },
  { id: 'tasks', label: 'Tasks', icon: <ListChecks size={19} strokeWidth={2} /> },
  { id: 'settings', label: 'Settings', icon: <SettingsIcon size={19} strokeWidth={2} /> }
]

/**
 * The bottom tab bar.
 *
 * Three behaviours from the Liquid Glass guidance:
 *  1. It floats in the navigation layer above the content, rather than sitting
 *     in a chrome strip, so content shows through and gets refracted.
 *  2. The selection indicator is a shared `layoutId`, which makes framer-motion
 *     morph one pill into the next instead of fading two pills.
 *  3. It minimizes on scroll down and expands on scroll up
 *     (`tabBarMinimizeBehavior(.onScrollDown)`), controlled from settings.
 *
 * The search-role tab is ordered to the trailing end, which is what the system
 * does with `Tab(role: .search)`.
 */
export function BottomTabBar({
  tab,
  onSelect,
  minimized,
  labels,
  badges
}: {
  tab: TabId
  onSelect(next: TabId): void
  minimized: boolean
  labels: 'always' | 'selected' | 'never'
  badges?: Partial<Record<TabId, number>>
}): React.JSX.Element {
  const ordered = [...TABS].sort((a, b) => Number(a.role === 'search') - Number(b.role === 'search'))

  return (
    <div className="tabbar-wrap" data-minimized={minimized}>
      <nav className="glass glass--lensed tabbar" data-labels={labels} aria-label="Main">
        {ordered.map((def, index) => {
          const active = def.id === tab
          const badge = badges?.[def.id]
          // A fixed spacer separates the search cluster from the rest, the way
          // ToolbarSpacer(.fixed) groups toolbar items.
          const needsSpacer = index > 0 && def.role === 'search'
          return (
            <span key={def.id} style={{ display: 'contents' }}>
              {needsSpacer && <span className="glass-spacer" aria-hidden="true" />}
              <button
                type="button"
                className="tab"
                data-active={active}
                aria-current={active ? 'page' : undefined}
                /* Every icon carries a label even when the text is hidden. */
                aria-label={def.label}
                onClick={() => onSelect(def.id)}
              >
                {active && (
                  <motion.span
                    layoutId="tab-pill"
                    className="tab__pill"
                    transition={{ type: 'spring', stiffness: 480, damping: 36, mass: 0.9 }}
                  />
                )}
                <span className="tab__icon">{def.icon}</span>
                <span className="tab__label">{def.label}</span>
                {badge ? <span className="tab__badge">{badge > 99 ? '99+' : badge}</span> : null}
              </button>
            </span>
          )
        })}
      </nav>
    </div>
  )
}
