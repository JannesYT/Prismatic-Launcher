import { mockCall } from './mock'

/**
 * Single entry point to the main process.
 *
 * When there is no preload bridge (i.e. `npm run dev:ui` in a plain browser) we
 * fall back to a mock backend so the whole interface can be designed without
 * launching Electron.
 */
export const isElectron = typeof window !== 'undefined' && Boolean(window.prismatic)

export function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  if (window.prismatic) return window.prismatic.call<T>(channel, ...args)
  return mockCall<T>(channel, args)
}

export function on(channel: string, listener: (payload: never) => void): () => void {
  if (window.prismatic) return window.prismatic.on(channel, listener)
  return () => {}
}
