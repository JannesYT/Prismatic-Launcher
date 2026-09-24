import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

/** Every handler returns { ok, value } | { ok, error }; unwrap it here. */
async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const result = (await ipcRenderer.invoke(channel, ...args)) as
    | { ok: true; value: T }
    | { ok: false; error: string }
  if (!result.ok) throw new Error(result.error)
  return result.value
}

/** Subscribe to a push channel; returns an unsubscribe function. */
function on(channel: string, listener: (payload: never) => void): () => void {
  const wrapped = (_event: IpcRendererEvent, payload: unknown): void => {
    // The renderer declares the payload type per channel, so cast at the edge.
    listener(payload as never)
  }
  ipcRenderer.on(channel, wrapped)
  return () => ipcRenderer.off(channel, wrapped)
}

const api = { call, on }

contextBridge.exposeInMainWorld('prismatic', api)

export type PrismaticApi = typeof api
