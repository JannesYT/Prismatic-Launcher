import { motion } from 'framer-motion'
import { Search } from 'lucide-react'
import type { ReactNode } from 'react'

/** Toggle. Same travel spring in every glass style; only the knob material changes. */
export function GlassSwitch({
  checked,
  onChange,
  label,
  disabled = false
}: {
  checked: boolean
  onChange(next: boolean): void
  label?: string
  disabled?: boolean
}): React.JSX.Element {
  return (
    <button
      type="button"
      className="switch"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      data-on={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{ opacity: disabled ? 0.45 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
    >
      <span className="switch__knob" />
    </button>
  )
}

export interface SegmentOption<T extends string> {
  value: T
  label: string
  icon?: ReactNode
}

/**
 * Segmented control. The thumb is a shared `layoutId`, so framer-motion morphs
 * it between segments instead of cross-fading — the fluid movement Apple
 * describes for controls that "come to life when a person interacts with them".
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  layoutId
}: {
  value: T
  /* NoInfer keeps T pinned to `value`'s type. Without it, a setState passed as
     onChange drags SetStateAction<T> into inference and T widens to string. */
  options: readonly SegmentOption<NoInfer<T>>[]
  onChange(next: NoInfer<T>): void
  layoutId?: string
}): React.JSX.Element {
  const id = layoutId ?? `segmented-${options.map((o) => o.value).join('-')}`
  return (
    <div className="segmented" role="tablist">
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            className="segmented__item"
            data-active={active}
            onClick={() => onChange(option.value)}
          >
            {active && (
              <motion.span
                layoutId={id}
                className="segmented__thumb"
                transition={{ type: 'spring', stiffness: 520, damping: 38, mass: 0.8 }}
              />
            )}
            {option.icon}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export function Field({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: ReactNode
}): React.JSX.Element {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {hint && <span className="panel__hint">{hint}</span>}
    </label>
  )
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search'
}: {
  value: string
  onChange(next: string): void
  placeholder?: string
}): React.JSX.Element {
  return (
    <div className="search">
      <Search size={15} className="search__icon" />
      <input
        className="input"
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

/** A settings row: label, description, and a control on the trailing edge. */
export function Row({
  label,
  desc,
  children,
  onClick
}: {
  label: ReactNode
  desc?: ReactNode
  children?: ReactNode
  onClick?(): void
}): React.JSX.Element {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag className={`row${onClick ? ' row--button' : ''}`} onClick={onClick} type={onClick ? 'button' : undefined}>
      <span className="row__text">
        <span className="row__label">{label}</span>
        {desc && <span className="row__desc">{desc}</span>}
      </span>
      {children && <span className="row__control">{children}</span>}
    </Tag>
  )
}

export function Panel({
  title,
  hint,
  actions,
  children
}: {
  title?: string
  hint?: string
  actions?: ReactNode
  children: ReactNode
}): React.JSX.Element {
  return (
    <div className="glass panel">
      {(title || actions) && (
        <div className="panel__header">
          <div style={{ minWidth: 0, flex: 1 }}>
            {/* Title-style capitalisation, per the refreshed list metrics. */}
            {title && <h2 className="panel__title">{title}</h2>}
            {hint && <p className="panel__hint">{hint}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </div>
  )
}

export type BadgeTone =
  | 'accent'
  | 'ok'
  | 'warn'
  | 'bad'
  /* Every LoaderId doubles as a tone, so a loader can be passed straight through. */
  | 'fabric'
  | 'quilt'
  | 'forge'
  | 'neoforge'
  | 'vanilla'
  | 'liteloader'

export function Badge({ children, tone }: { children: ReactNode; tone?: BadgeTone }): React.JSX.Element {
  return <span className={`badge${tone ? ` badge--${tone}` : ''}`}>{children}</span>
}

export function ProgressBar({ value }: { value: number | null }): React.JSX.Element {
  return (
    <div className="bar">
      <div
        className="bar__fill"
        data-indeterminate={value === null}
        style={{ width: value === null ? undefined : `${Math.round(value * 100)}%` }}
      />
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  text,
  action
}: {
  icon: ReactNode
  title: string
  text: string
  action?: ReactNode
}): React.JSX.Element {
  return (
    <div className="empty">
      <div className="empty__icon">{icon}</div>
      <h3 className="empty__title">{title}</h3>
      <p className="empty__text">{text}</p>
      {action}
    </div>
  )
}
