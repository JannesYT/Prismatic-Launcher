declare global {
  interface Window {
    prismatic?: {
      call<T>(channel: string, ...args: unknown[]): Promise<T>
      on(channel: string, listener: (payload: never) => void): () => void
    }
  }
}

export {}
