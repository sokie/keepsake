import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { isSea } from 'node:sea'
import type { ChatMeta, Memory, MemoryMeta, Msg } from '../../shared/types.js'
import { dominantEmoji } from '../../shared/emoji.js'
import { slugify, shortHash } from './util.js'

// Where everything lives, in priority order:
//  1. KEEPSAKE_HOME, if set — an explicit override wins.
//  2. Portable mode (packaged binary only): if a `keepsake.portable` marker
//     OR a `data/` folder sits next to the executable — a USB stick, a synced
//     folder — keep everything there. Nothing to configure; the app travels
//     with its data. (Users who love the single-exe never set env vars.)
//  3. Packaged binary otherwise: ~/Keepsake.
//  4. Running from a checkout: next to the code, as before.
function resolveRoot(): string {
  if (process.env.KEEPSAKE_HOME) return path.resolve(process.env.KEEPSAKE_HOME)
  if (isSea()) {
    const beside = path.dirname(process.execPath)
    const portable = fs.existsSync(path.join(beside, 'keepsake.portable')) || fs.existsSync(path.join(beside, 'data'))
    if (portable) return beside
    return path.join(os.homedir(), 'Keepsake')
  }
  return process.cwd()
}

const ROOT = resolveRoot()

export const DATA_DIR = path.join(ROOT, 'data')
export const CHATS_DIR = path.join(DATA_DIR, 'chats')
export const MEMORIES_DIR = path.join(DATA_DIR, 'memories')
export const TRASH_DIR = path.join(DATA_DIR, 'trash')
export const UPLOADS_DIR = path.join(ROOT, 'uploads')

for (const dir of [CHATS_DIR, MEMORIES_DIR, UPLOADS_DIR]) {
  fs.mkdirSync(dir, { recursive: true })
}

function writeFileAtomic(file: string, content: string) {
  const tmp = `${file}.${randomUUID().slice(0, 8)}.tmp`
  fs.writeFileSync(tmp, content, 'utf8')
  fs.renameSync(tmp, file)
}

function readJson<T>(file: string): T | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T
  } catch {
    return undefined
  }
}

// ---------- trash ----------
// Deleting a chat or memory is the worst possible failure for an app whose
// whole point is "never lose this", so nothing is erased outright: the folder
// is moved to data/trash/<kind>/<id>__<timestamp> and swept after 30 days.
// Recovery is currently manual (move the folder back); a restore UI is a
// natural follow-up.

const TRASH_TTL_MS = 30 * 24 * 60 * 60 * 1000

function moveToTrash(src: string, kind: 'chats' | 'memories', id: string): void {
  if (!fs.existsSync(src)) return
  const dir = path.join(TRASH_DIR, kind)
  fs.mkdirSync(dir, { recursive: true })
  const dest = path.join(dir, `${id}__${Date.now()}`)
  try {
    fs.renameSync(src, dest)
  } catch {
    // rename fails across filesystems (e.g. data on a USB stick) — copy + remove
    fs.cpSync(src, dest, { recursive: true })
    fs.rmSync(src, { recursive: true, force: true })
  }
}

/** Purge trashed items older than the retention window. Called once at startup. */
export function sweepTrash(now = Date.now()): void {
  for (const kind of ['chats', 'memories'] as const) {
    const dir = path.join(TRASH_DIR, kind)
    if (!fs.existsSync(dir)) continue
    for (const name of fs.readdirSync(dir)) {
      const stamp = Number(name.split('__').pop())
      if (Number.isFinite(stamp) && now - stamp > TRASH_TTL_MS) {
        fs.rmSync(path.join(dir, name), { recursive: true, force: true })
      }
    }
  }
}

// ---------- chats ----------

export function chatDir(id: string): string {
  const dir = path.join(CHATS_DIR, id)
  if (!path.resolve(dir).startsWith(CHATS_DIR + path.sep)) throw new Error('bad chat id')
  return dir
}

export function chatMediaDir(id: string): string {
  const dir = path.join(chatDir(id), 'media')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function listChats(): ChatMeta[] {
  if (!fs.existsSync(CHATS_DIR)) return []
  return fs
    .readdirSync(CHATS_DIR)
    .map((id) => readJson<ChatMeta>(path.join(CHATS_DIR, id, 'chat.json')))
    .filter((c): c is ChatMeta => !!c)
    .sort((a, b) => (b.lastTs ?? 0) - (a.lastTs ?? 0))
}

export function getChat(id: string): ChatMeta | undefined {
  return readJson<ChatMeta>(path.join(chatDir(id), 'chat.json'))
}

export function saveChat(meta: ChatMeta): void {
  fs.mkdirSync(chatDir(meta.id), { recursive: true })
  writeFileAtomic(path.join(chatDir(meta.id), 'chat.json'), JSON.stringify(meta, null, 2))
}

export function deleteChat(id: string): void {
  moveToTrash(chatDir(id), 'chats', id)
}

export function readMessages(id: string): Msg[] {
  const file = path.join(chatDir(id), 'messages.jsonl')
  if (!fs.existsSync(file)) return []
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Msg)
}

export function writeMessages(id: string, msgs: Msg[]): void {
  fs.mkdirSync(chatDir(id), { recursive: true })
  writeFileAtomic(path.join(chatDir(id), 'messages.jsonl'), msgs.map((m) => JSON.stringify(m)).join('\n') + '\n')
}

// ---------- memories ----------

export function memoryDir(id: string): string {
  const dir = path.join(MEMORIES_DIR, id)
  if (!path.resolve(dir).startsWith(MEMORIES_DIR + path.sep)) throw new Error('bad memory id')
  return dir
}

export function memoryMediaDir(id: string): string {
  const dir = path.join(memoryDir(id), 'media')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function memoryPngPath(id: string): string {
  return path.join(memoryDir(id), 'memory.png')
}

function toMeta(m: Memory): MemoryMeta {
  const { messages, ...meta } = m
  const teaser = messages.find((x) => x.text && !x.system)?.text?.slice(0, 140)
  return { ...meta, teaser, hasPng: fs.existsSync(memoryPngPath(m.id)) }
}

export function listMemories(): MemoryMeta[] {
  if (!fs.existsSync(MEMORIES_DIR)) return []
  return fs
    .readdirSync(MEMORIES_DIR)
    .map((id) => readJson<Memory>(path.join(MEMORIES_DIR, id, 'memory.json')))
    .filter((m): m is Memory => !!m)
    .map(toMeta)
    .sort((a, b) => b.startTs - a.startTs)
}

export function getMemory(id: string): Memory | undefined {
  const m = readJson<Memory>(path.join(memoryDir(id), 'memory.json'))
  if (m) m.hasPng = fs.existsSync(memoryPngPath(id))
  return m
}

export function saveMemory(memory: Memory): void {
  fs.mkdirSync(memoryDir(memory.id), { recursive: true })
  writeFileAtomic(path.join(memoryDir(memory.id), 'memory.json'), JSON.stringify(memory, null, 2))
}

export function deleteMemory(id: string): void {
  moveToTrash(memoryDir(id), 'memories', id)
}

export interface CreateMemoryInput {
  chatId: string
  startId: string
  endId: string
  title: string
  note?: string
  tags?: string[]
}

export function createMemoryFromRange(input: CreateMemoryInput): Memory {
  const chat = getChat(input.chatId)
  if (!chat) throw Object.assign(new Error('chat not found'), { status: 404 })
  const msgs = readMessages(input.chatId)
  let lo = msgs.findIndex((m) => m.id === input.startId)
  let hi = msgs.findIndex((m) => m.id === input.endId)
  if (lo === -1 || hi === -1) throw Object.assign(new Error('start or end message not found'), { status: 400 })
  if (lo > hi) [lo, hi] = [hi, lo]

  const slice = msgs.slice(lo, hi + 1).map((m) => ({
    ...m,
    media: m.media ? { ...m.media } : undefined,
    quoted: m.quoted ? { ...m.quoted } : undefined,
  }))
  const title = input.title.trim()
  const id = `${new Date(slice[0].ts).toISOString().slice(0, 10)}-${slugify(title, 'memory')}-${shortHash(randomUUID(), 4)}`

  const mediaDir = memoryMediaDir(id)
  const srcDir = chatMediaDir(input.chatId)
  for (const m of slice) {
    if (m.media?.file) {
      const src = path.join(srcDir, m.media.file)
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(mediaDir, m.media.file))
      } else {
        m.media.missing = true
        m.media.file = undefined
      }
    }
  }

  const emojiSources = slice.flatMap((m) => [
    m.text,
    ...(m.reactions?.map((r) => r.emoji.repeat(r.count)) ?? []),
  ])

  const memory: Memory = {
    id,
    chatId: input.chatId,
    chatName: chat.name,
    title,
    note: input.note?.trim() || undefined,
    tags: (input.tags ?? []).map((t) => t.trim()).filter(Boolean),
    createdAt: new Date().toISOString(),
    startTs: slice[0].ts,
    endTs: slice[slice.length - 1].ts,
    count: slice.length,
    sealEmoji: dominantEmoji(emojiSources),
    messages: slice,
  }
  saveMemory(memory)
  return memory
}
