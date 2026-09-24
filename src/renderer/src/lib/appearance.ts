import type { Settings, ThemeColors } from '../../../shared/types'
import { BUILT_IN_THEMES, findTheme } from '../../../shared/themes'

/** The colours currently in force: a preset, or the hand-edited set. */
export function activeTheme(settings: Settings): ThemeColors {
  const a = settings.appearance
  if (a.themePreset === 'custom' && a.customTheme) return a.customTheme
  return findTheme(a.themePreset, a.userPresets)?.colors ?? BUILT_IN_THEMES[0].colors
}

/**
 * Push appearance settings into the document as data attributes and CSS custom
 * properties. This is the only place that knows how a setting maps to a token,
 * which is what lets the glass style change with no component re-render.
 */
export function applyAppearance(settings: Settings, platform: string): void {
  const a = settings.appearance
  const root = document.documentElement

  // Reduce Transparency wins over the chosen style, the way the OS setting does.
  const effectiveStyle = a.reduceTransparency ? 'solid' : a.glassStyle

  root.dataset.glass = effectiveStyle
  root.dataset.glassVariant = a.glassVariant
  root.dataset.theme = a.theme
  root.dataset.reduceTransparency = String(a.reduceTransparency)
  root.dataset.reduceMotion = String(a.reduceMotion)
  root.dataset.contrast = a.increaseContrast ? 'high' : 'normal'
  root.dataset.platform = platform
  // Marks that the user has made an explicit motion choice, so the OS
  // prefers-reduced-motion media query stops overriding it.
  root.dataset.motionOverride = String(a.motionScale !== 1 || a.reduceMotion)

  // --- Theme -------------------------------------------------------------
  const theme = activeTheme(settings)
  // A theme may pin light or dark; 'auto' defers to the user's theme choice,
  // which in turn may defer to the OS.
  root.dataset.theme = theme.scheme === 'auto' ? a.theme : theme.scheme

  // --- Layout ------------------------------------------------------------
  root.dataset.layout = a.layout
  root.dataset.density = a.density

  const style = root.style
  style.setProperty('--bg', theme.bg)
  style.setProperty('--bg-tint-a', theme.tintA)
  style.setProperty('--bg-tint-b', theme.tintB)
  style.setProperty('--bg-tint-c', theme.tintC)
  style.setProperty('--ink', theme.ink)
  style.setProperty('--ink-2', theme.ink2)
  style.setProperty('--ink-3', theme.ink3)
  style.setProperty('--line', theme.line)
  // The compact rail's width is fixed, not user-set. Decided here rather than
  // in CSS: this property is written inline, and an inline value always beats
  // a stylesheet rule, so a CSS override for the compact layout would silently
  // never apply.
  style.setProperty('--rail-w', a.layout === 'compact' ? '68px' : `${a.railWidth}px`)
  style.setProperty('--card-w', `${a.cardSize}px`)

  // The wallpaper is served through the custom protocol, which only resolves
  // paths inside the launcher's own data directory.
  style.setProperty(
    '--bg-image',
    a.backgroundImage ? `url("prismatic-file:///${encodeURIComponent(a.backgroundImage)}")` : 'none'
  )
  style.setProperty('--bg-image-opacity', String(a.backgroundOpacity / 100))
  style.setProperty('--bg-image-blur', `${a.backgroundBlur}px`)

  // The accent still wins over the theme's, so a preset can be adopted without
  // losing a colour the user deliberately picked.
  style.setProperty('--accent', a.accent)
  const { r, g, b } = hexToRgb(a.accent)
  style.setProperty('--accent-r', String(r))
  style.setProperty('--accent-g', String(g))
  style.setProperty('--accent-b', String(b))
  // Pick black or white text for accent-filled controls by luminance.
  style.setProperty('--accent-ink', luminance(r, g, b) > 0.58 ? '#101318' : '#ffffff')

  style.setProperty('--glass-blur-scale', (a.blur / 100).toFixed(3))
  style.setProperty('--glass-lens-scale', (a.lensing / 100).toFixed(3))
  style.setProperty('--glass-specular-scale', (a.specular / 100).toFixed(3))
  style.setProperty('--motion', a.reduceMotion ? '0.001' : String(a.motionScale))
  style.setProperty('--font-scale', String(a.fontScale))
  style.setProperty('--r-xl', `${a.cornerRadius}px`)
  style.setProperty('--r-lg', `${Math.round(a.cornerRadius * 0.77)}px`)
  style.setProperty('--r-md', `${Math.round(a.cornerRadius * 0.54)}px`)
  style.setProperty('--r-sm', `${Math.round(a.cornerRadius * 0.38)}px`)
}

/** The displacement scale handed to the SVG lens filter. */
export function lensScale(settings: Settings): number {
  if (settings.appearance.glassStyle !== 'liquid' || settings.appearance.reduceTransparency) return 0
  return Math.round((settings.appearance.lensing / 100) * 120)
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '')
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean
  const n = Number.parseInt(full.slice(0, 6) || '5b8cff', 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function luminance(r: number, g: number, b: number): number {
  const channel = (c: number): number => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export const ACCENTS = [
  { name: 'Prism Blue', value: '#5B8CFF' },
  { name: 'Grass', value: '#4CAF50' },
  { name: 'Redstone', value: '#E03B3B' },
  { name: 'Amethyst', value: '#9B6BFF' },
  { name: 'Copper', value: '#E08B4C' },
  { name: 'Diamond', value: '#3FD8D0' },
  { name: 'Gold', value: '#E0B23C' },
  { name: 'Nether', value: '#D4478F' }
]

// --- Small formatters used across views ------------------------------------

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exp = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / 1024 ** exp
  return `${value.toFixed(value < 10 && exp > 0 ? 1 : 0)} ${units[exp]}`
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`
  return String(n)
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.round((seconds % 3600) / 60)
  if (hours === 0) return `${minutes}m`
  return `${hours}h ${minutes}m`
}

export function formatRelative(timestamp: number | null): string {
  if (!timestamp) return 'Never'
  const seconds = (Date.now() - timestamp) / 1000
  if (seconds < 90) return 'Just now'
  const minutes = seconds / 60
  if (minutes < 60) return `${Math.round(minutes)} min ago`
  const hours = minutes / 60
  if (hours < 24) return `${Math.round(hours)}h ago`
  const days = hours / 24
  if (days < 30) return `${Math.round(days)}d ago`
  return new Date(timestamp).toLocaleDateString()
}
