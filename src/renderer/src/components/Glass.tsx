import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react'

/**
 * The SVG filter that produces Liquid Glass lensing.
 *
 * feTurbulence generates a smooth noise field; feDisplacementMap uses its red
 * and green channels to push the backdrop's pixels around. That bending of
 * whatever sits behind the surface is what reads as refraction through glass —
 * a plain blur alone reads as frosted plastic.
 *
 * Rendered once, near the root, and referenced by `backdrop-filter: url(#...)`.
 */
export function GlassFilters({ scale }: { scale: number }): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      style={{ position: 'fixed', width: 0, height: 0, pointerEvents: 'none' }}
    >
      <defs>
        <filter id="prismatic-lens" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.008 0.012"
            numOctaves={2}
            seed={11}
            result="noise"
          />
          <feGaussianBlur in="noise" stdDeviation="2.4" result="softNoise" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="softNoise"
            scale={scale}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  )
}

type GlassProps = HTMLAttributes<HTMLDivElement> & {
  /** Border radius; children should subtract their inset to stay concentric. */
  radius?: number | string
  /** Apply the refraction filter. Only honoured in the liquid style. */
  lensed?: boolean
  /** Opt out of the nesting guard when a nested surface really is wanted. */
  allowNested?: boolean
  children?: ReactNode
}

export const Glass = forwardRef<HTMLDivElement, GlassProps>(function Glass(
  { radius, lensed = false, allowNested = false, className = '', style, children, ...rest },
  ref
) {
  return (
    <div
      ref={ref}
      className={[
        'glass',
        lensed ? 'glass--lensed' : '',
        allowNested ? 'glass--allow-nested' : '',
        className
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        ...(radius !== undefined
          ? ({ '--r': typeof radius === 'number' ? `${radius}px` : radius } as React.CSSProperties)
          : {}),
        ...style
      }}
      {...rest}
    >
      {children}
    </div>
  )
})

type GlassButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'plain' | 'glass' | 'prominent' | 'danger' | 'quiet'
  size?: 'sm' | 'md' | 'lg'
  iconOnly?: boolean
}

/**
 * Buttons mirror Apple's `.glass` and `.glassProminent` styles: prefer these
 * over hand-rolling a glass background on a custom control.
 */
export const GlassButton = forwardRef<HTMLButtonElement, GlassButtonProps>(function GlassButton(
  { variant = 'plain', size = 'md', iconOnly = false, className = '', children, ...rest },
  ref
) {
  const classes = ['btn']
  if (size === 'sm') classes.push('btn--sm')
  if (size === 'lg') classes.push('btn--lg')
  if (iconOnly) classes.push('btn--icon')
  if (variant === 'glass') classes.push('glass', 'glass--interactive')
  if (variant === 'prominent') classes.push('btn--accent')
  if (variant === 'danger') classes.push('btn--danger')
  if (variant === 'quiet') classes.push('btn--quiet')
  if (className) classes.push(className)

  return (
    <button ref={ref} type="button" className={classes.join(' ')} {...rest}>
      {children}
    </button>
  )
})
