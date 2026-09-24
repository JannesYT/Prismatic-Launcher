import { motion } from 'framer-motion'
import { TABS } from './BottomTabBar'
import type { TabId } from '../state/store'

/**
 * Navigation as a rail, used by the sidebar, compact and top-tabs layouts.
 *
 * Shares the selection-pill `layoutId` family with the bottom tab bar, so the
 * highlight animates the same way whichever layout is in use — switching
 * layout changes where navigation sits, never how it behaves.
 */
export function NavRail({
  tab,
  onSelect,
  badges,
  compact
}: {
  tab: TabId
  onSelect(next: TabId): void
  badges?: Partial<Record<TabId, number>>
  compact?: boolean
}): React.JSX.Element {
  // Search-role tabs go to the end, matching the bottom bar's ordering.
  const ordered = [...TABS].sort((a, b) => Number(a.role === 'search') - Number(b.role === 'search'))

  return (
    <nav className="glass rail" aria-label="Main">
      {ordered.map((def) => {
        const active = def.id === tab
        const badge = badges?.[def.id]
        return (
          <button
            key={def.id}
            type="button"
            className="rail__item"
            data-active={active}
            aria-current={active ? 'page' : undefined}
            aria-label={def.label}
            title={compact ? def.label : undefined}
            onClick={() => onSelect(def.id)}
          >
            {active && (
              <motion.span
                layoutId="nav-pill"
                className="rail__pill"
                transition={{ type: 'spring', stiffness: 480, damping: 36, mass: 0.9 }}
              />
            )}
            <span className="rail__icon">{def.icon}</span>
            <span className="rail__label">{def.label}</span>
            {badge ? <span className="rail__badge">{badge > 99 ? '99+' : badge}</span> : null}
          </button>
        )
      })}
    </nav>
  )
}
