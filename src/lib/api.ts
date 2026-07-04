import type { ChatMeta, Memory, MemoryMeta, Msg } from '../../shared/types'

async function j<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}) as unknown)
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `request failed (${res.status})`)
  return body as T
}

const post = (url: string, body: unknown) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

export interface ZipImportResult {
  needsMe?: boolean
  participants?: string[]
  messageCount?: number
  chat?: ChatMeta
  added?: number
  merged?: number
}

export interface ArchiveScanResult {
  kind?: 'msgstore' | 'wts'
  chats?: { jid: string; name: string; count: number }[]
  chat?: ChatMeta
  added?: number
  merged?: number
  mediaLocated?: number
  mediaReferenced?: number
}

export const api = {
  chats: () => fetch('/api/chats').then(j<ChatMeta[]>),
  chat: (id: string) => fetch(`/api/chats/${id}`).then(j<ChatMeta>),
  messages: (id: string) => fetch(`/api/chats/${id}/messages`).then(j<Msg[]>),
  renameChat: (id: string, name: string) =>
    fetch(`/api/chats/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }).then(j<ChatMeta>),
  deleteChat: (id: string) => fetch(`/api/chats/${id}`, { method: 'DELETE' }).then(j<{ ok: boolean }>),

  importZip: (file: File, opts: { me?: string; targetChatId?: string } = {}) => {
    const fd = new FormData()
    fd.append('file', file)
    if (opts.me) fd.append('me', opts.me)
    if (opts.targetChatId) fd.append('targetChatId', opts.targetChatId)
    return fetch('/api/import/export-zip', { method: 'POST', body: fd }).then(j<ZipImportResult>)
  },
  archive: (body: { path: string; jid?: string; me?: string; targetChatId?: string }) =>
    post('/api/import/archive', body).then(j<ArchiveScanResult>),

  memories: () => fetch('/api/memories').then(j<MemoryMeta[]>),
  memory: (id: string) => fetch(`/api/memories/${id}`).then(j<Memory>),
  createMemory: (body: { chatId: string; startId: string; endId: string; title: string; note?: string; tags?: string[] }) =>
    post('/api/memories', body).then(j<Memory>),
  patchMemory: (id: string, body: { title?: string; note?: string; tags?: string[] }) =>
    fetch(`/api/memories/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(j<Memory>),
  deleteMemory: (id: string) => fetch(`/api/memories/${id}`, { method: 'DELETE' }).then(j<{ ok: boolean }>),
  uploadPng: (id: string, dataUrl: string) => post(`/api/memories/${id}/png`, { dataUrl }).then(j<{ ok: boolean }>),
}
