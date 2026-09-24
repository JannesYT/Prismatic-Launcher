import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * A scroll container that provides the two behaviours bars depend on:
 *
 *  - The scroll edge effect: a blurred, masked strip pinned to the top and
 *    bottom that obscures content passing under the title bar and tab bar, so
 *    those controls stay legible over arbitrary content.
 *  - Direction reporting, which drives the tab bar's minimize-on-scroll-down.
 */
export function Scroller({
  children,
  onDirection,
  className = ''
}: {
  children: ReactNode
  onDirection?(direction: 'up' | 'down'): void
  className?: string
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const lastY = useRef(0)
  const [atTop, setAtTop] = useState(true)
  const [atBottom, setAtBottom] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    let frame = 0
    const onScroll = (): void => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const y = el.scrollTop
        setAtTop(y <= 2)
        setAtBottom(y + el.clientHeight >= el.scrollHeight - 2)

        // A small threshold stops the bar flickering on trackpad jitter.
        const delta = y - lastY.current
        if (Math.abs(delta) > 6) {
          onDirection?.(delta > 0 ? 'down' : 'up')
          lastY.current = y
        }
      })
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => {
      el.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [onDirection])

  return (
    <>
      {/* Scroll edge effects live outside the scrolling element so they stay put. */}
      <div className="scroll-edge scroll-edge--top" data-visible={!atTop} aria-hidden="true" />
      <div className="scroll-edge scroll-edge--bottom" data-visible={!atBottom} aria-hidden="true" />
      <div ref={ref} className={`scroller ${className}`.trim()}>
        {children}
      </div>
    </>
  )
}
