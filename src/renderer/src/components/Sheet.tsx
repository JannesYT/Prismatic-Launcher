import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { GlassButton } from './Glass'

/**
 * A half sheet: inset from the window edge so content peeks through beneath it,
 * with an increased corner radius. When `tall` it becomes more opaque, matching
 * the system behaviour where a sheet expanded to full height turns more solid to
 * keep focus on the task.
 */
export function Sheet({
  open,
  title,
  onClose,
  footer,
  tall = false,
  children
}: {
  open: boolean
  title: string
  onClose(): void
  footer?: ReactNode
  tall?: boolean
  children: ReactNode
}): React.JSX.Element {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="sheet-scrim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose()
          }}
        >
          <motion.div
            className={`glass glass--allow-nested sheet${tall ? ' sheet--tall' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            /* Rises from the bottom edge with a slight overshoot, then settles. */
            initial={{ y: 40, scale: 0.97, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 30, scale: 0.98, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34, mass: 0.9 }}
          >
            <div className="sheet__handle" />
            <div className="sheet__header">
              <h2 className="sheet__title">{title}</h2>
              <span className="spacer" />
              <GlassButton variant="quiet" size="sm" iconOnly onClick={onClose} aria-label="Close">
                <X size={16} />
              </GlassButton>
            </div>
            <div className="sheet__body">{children}</div>
            {footer && <div className="sheet__footer">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
