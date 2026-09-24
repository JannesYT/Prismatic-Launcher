import { useCallback, useEffect, useRef, useState } from 'react'

interface Props {
  value: number
  min?: number
  max?: number
  step?: number
  onChange(value: number): void
  /** Called once when the drag ends — use it to persist instead of on every frame. */
  onCommit?(value: number): void
  format?(value: number): string
  label?: string
  disabled?: boolean
}

/**
 * The slider Apple calls out by name: "the knob transforms into Liquid Glass
 * during interaction."
 *
 * The material of the knob comes entirely from CSS (`.slider__knob` under each
 * `data-glass` style), so this component never knows which style is active.
 * That is deliberate: it guarantees the interaction — grab, swell, track
 * thickening, value bubble, keyboard steps — behaves identically whether the
 * knob is Liquid Glass, a flat tint, or opaque.
 */
export function GlassSlider({
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  onCommit,
  format,
  label,
  disabled = false
}: Props): React.JSX.Element {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  // Keep the latest value in a ref so the pointerup handler commits the right one.
  const latest = useRef(value)
  latest.current = value

  const clamp = useCallback(
    (raw: number) => {
      const stepped = Math.round(raw / step) * step
      const bounded = Math.min(max, Math.max(min, stepped))
      // Avoid float dust like 0.30000000000000004 on fractional steps.
      const decimals = (String(step).split('.')[1] ?? '').length
      return Number(bounded.toFixed(decimals))
    },
    [min, max, step]
  )

  const valueFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current
      if (!el) return value
      const rect = el.getBoundingClientRect()
      const ratio = rect.width === 0 ? 0 : (clientX - rect.left) / rect.width
      return clamp(min + ratio * (max - min))
    },
    [clamp, min, max, value]
  )

  const beginDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (disabled) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(true)
    onChange(valueFromClientX(event.clientX))
  }

  const moveDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!dragging || disabled) return
    onChange(valueFromClientX(event.clientX))
  }

  const endDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!dragging) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    setDragging(false)
    onCommit?.(latest.current)
  }

  // Keyboard control, which also has to work at every glass style.
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (disabled) return
    const big = (max - min) / 10
    const map: Record<string, number> = {
      ArrowRight: step,
      ArrowUp: step,
      ArrowLeft: -step,
      ArrowDown: -step,
      PageUp: big,
      PageDown: -big
    }
    if (event.key in map) {
      event.preventDefault()
      const next = clamp(value + map[event.key])
      onChange(next)
      onCommit?.(next)
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      onChange(min)
      onCommit?.(min)
    }
    if (event.key === 'End') {
      event.preventDefault()
      onChange(max)
      onCommit?.(max)
    }
  }

  // A drag that ends outside the window should still release.
  useEffect(() => {
    if (!dragging) return
    const stop = (): void => {
      setDragging(false)
      onCommit?.(latest.current)
    }
    window.addEventListener('blur', stop)
    return () => window.removeEventListener('blur', stop)
  }, [dragging, onCommit])

  const percent = max === min ? 0 : ((value - min) / (max - min)) * 100
  const display = format ? format(value) : String(value)

  return (
    <div
      ref={trackRef}
      className="slider"
      data-dragging={dragging}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={display}
      aria-disabled={disabled}
      onPointerDown={beginDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      style={{ opacity: disabled ? 0.45 : 1 }}
    >
      <div className="slider__track">
        <div className="slider__fill" style={{ width: `${percent}%` }} />
      </div>
      <div className="slider__value" style={{ left: `${percent}%` }}>
        {display}
      </div>
      <div className="slider__knob" style={{ left: `${percent}%` }} />
    </div>
  )
}

/** Slider with a label and a live read-out, for settings rows. */
export function SliderRow(props: Props & { suffix?: string }): React.JSX.Element {
  const { suffix, format, ...rest } = props
  const text = format ? format(props.value) : `${props.value}${suffix ?? ''}`
  return (
    <div className="slider-row">
      <GlassSlider {...rest} format={format ?? ((v) => `${v}${suffix ?? ''}`)} />
      <span className="slider-row__value">{text}</span>
    </div>
  )
}
