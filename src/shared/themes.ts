import type { ThemeColors, ThemePreset } from './types'

/**
 * Built-in themes.
 *
 * Shared between main and renderer so the defaults written into a fresh config
 * and the ones offered in the picker can never drift apart.
 *
 * The three tint fields matter more than they look: Liquid Glass refracts what
 * is behind it, so a theme with a flat background makes every glass surface
 * read as grey plastic. Each preset places three soft colour fields for the
 * material to pick up.
 */
export const BUILT_IN_THEMES: ThemePreset[] = [
  {
    id: 'prismatic',
    name: 'Prismatic',
    description: 'The default: cool blue with magenta and teal fields',
    builtIn: true,
    colors: {
      scheme: 'auto',
      bg: '#0a0c11',
      tintA: 'rgba(72, 116, 255, 0.24)',
      tintB: 'rgba(198, 70, 160, 0.18)',
      tintC: 'rgba(32, 168, 150, 0.14)',
      ink: '#f1f3f8',
      ink2: '#c3c9d6',
      ink3: '#8f97a8',
      line: 'rgba(255, 255, 255, 0.11)',
      accent: '#5B8CFF'
    }
  },
  {
    id: 'midnight',
    name: 'Midnight',
    description: 'Near-black with a single cold highlight',
    builtIn: true,
    colors: {
      scheme: 'dark',
      bg: '#05070b',
      tintA: 'rgba(40, 80, 180, 0.22)',
      tintB: 'rgba(20, 40, 90, 0.18)',
      tintC: 'rgba(10, 60, 80, 0.12)',
      ink: '#eef1f6',
      ink2: '#b6bdcb',
      ink3: '#7d8697',
      line: 'rgba(255, 255, 255, 0.09)',
      accent: '#4C7DFF'
    }
  },
  {
    id: 'grove',
    name: 'Grove',
    description: 'Minecraft greens and earth, for the obvious reason',
    builtIn: true,
    colors: {
      scheme: 'dark',
      bg: '#0b1109',
      tintA: 'rgba(96, 176, 72, 0.26)',
      tintB: 'rgba(150, 110, 60, 0.18)',
      tintC: 'rgba(60, 140, 110, 0.14)',
      ink: '#f0f4ec',
      ink2: '#c4cfbc',
      ink3: '#8d9a86',
      line: 'rgba(255, 255, 255, 0.10)',
      accent: '#5FBF4C'
    }
  },
  {
    id: 'amethyst',
    name: 'Amethyst',
    description: 'Deep violet with a pink field',
    builtIn: true,
    colors: {
      scheme: 'dark',
      bg: '#0c0817',
      tintA: 'rgba(140, 80, 255, 0.28)',
      tintB: 'rgba(220, 70, 180, 0.20)',
      tintC: 'rgba(80, 60, 200, 0.16)',
      ink: '#f3eefb',
      ink2: '#cbc2dd',
      ink3: '#968cab',
      line: 'rgba(255, 255, 255, 0.12)',
      accent: '#A374FF'
    }
  },
  {
    id: 'ember',
    name: 'Ember',
    description: 'Warm copper and nether red',
    builtIn: true,
    colors: {
      scheme: 'dark',
      bg: '#120a08',
      tintA: 'rgba(230, 120, 50, 0.26)',
      tintB: 'rgba(200, 50, 60, 0.20)',
      tintC: 'rgba(150, 90, 30, 0.14)',
      ink: '#f8f0ea',
      ink2: '#d8c6ba',
      ink3: '#a39084',
      line: 'rgba(255, 255, 255, 0.11)',
      accent: '#E8843C'
    }
  },
  {
    id: 'nord',
    name: 'Nord',
    description: 'Muted arctic blues, low contrast and easy on the eyes',
    builtIn: true,
    colors: {
      scheme: 'dark',
      bg: '#2e3440',
      tintA: 'rgba(136, 192, 208, 0.20)',
      tintB: 'rgba(129, 161, 193, 0.18)',
      tintC: 'rgba(180, 142, 173, 0.12)',
      ink: '#eceff4',
      ink2: '#d8dee9',
      ink3: '#a9b1c0',
      line: 'rgba(255, 255, 255, 0.12)',
      accent: '#88C0D0'
    }
  },
  {
    id: 'paper',
    name: 'Paper',
    description: 'Light, warm and quiet',
    builtIn: true,
    colors: {
      scheme: 'light',
      bg: '#f4f1ea',
      tintA: 'rgba(120, 150, 220, 0.16)',
      tintB: 'rgba(220, 160, 120, 0.14)',
      tintC: 'rgba(140, 200, 180, 0.12)',
      ink: '#14161c',
      ink2: '#3f4552',
      ink3: '#6d7484',
      line: 'rgba(16, 19, 26, 0.12)',
      accent: '#3E6BD6'
    }
  },
  {
    id: 'mono',
    name: 'Mono',
    description: 'No colour at all — the glass carries the whole interface',
    builtIn: true,
    colors: {
      scheme: 'dark',
      bg: '#0d0d0f',
      tintA: 'rgba(255, 255, 255, 0.10)',
      tintB: 'rgba(255, 255, 255, 0.06)',
      tintC: 'rgba(255, 255, 255, 0.04)',
      ink: '#f2f2f4',
      ink2: '#c2c2c8',
      ink3: '#8c8c95',
      line: 'rgba(255, 255, 255, 0.14)',
      accent: '#B8B8C4'
    }
  }
]

export function findTheme(id: string, userPresets: ThemePreset[] = []): ThemePreset | null {
  return (
    BUILT_IN_THEMES.find((t) => t.id === id) ?? userPresets.find((t) => t.id === id) ?? null
  )
}

export function defaultThemeColors(): ThemeColors {
  return { ...BUILT_IN_THEMES[0].colors }
}

/** Descriptions of each layout, shown in the picker. */
export const LAYOUTS: { id: import('./types').LayoutMode; name: string; description: string }[] = [
  {
    id: 'bottomTabs',
    name: 'Floating',
    description: 'Glass tab bar floating at the bottom, content edge to edge'
  },
  {
    id: 'sidebar',
    name: 'Sidebar',
    description: 'Fixed navigation rail on the left, like the official launcher'
  },
  {
    id: 'topTabs',
    name: 'Top tabs',
    description: 'Tabs under the title bar, in the shape of a classic desktop app'
  },
  {
    id: 'compact',
    name: 'Compact rail',
    description: 'Icon-only rail on the left, for narrow windows'
  }
]
