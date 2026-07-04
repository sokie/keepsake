import fs from 'node:fs'
import path from 'node:path'
import { isSea, getAsset } from 'node:sea'
import { spawn } from 'node:child_process'
import express from 'express'
import multer from 'multer'
import AdmZip from 'adm-zip'
import type { ChatMeta, Memory } from '../shared/types.js'
import { dominantEmoji } from '../shared/emoji.js'
import { slugify, shortHash, mimeFromName } from './lib/util.js'
import { mergeMessages } from './lib/normalize.js'
import { parseExportTxt, participantsOf, buildExportMsgs } from './lib/importExport.js'
import { listWtsChats, buildWtsMsgs } from './lib/importWts.js'
import { locateMsgstore, listMsgstoreChats, buildMsgstoreMsgs, collectMedia } from './lib/importMsgstore.js'
import { renderMemoryHtml } from './lib/replayTemplate.js'
import * as store from './lib/store.js'

const app = express()
app.use(express.json({ limit: '150mb' }))
const upload = multer({ dest: store.UPLOADS_DIR, limits: { fileSize: 2 * 1024 ** 3 } })

// ---------- chats ----------

app.get('/api/chats', (_req, res) => {
  res.json(store.listChats())
})

app.get('/api/chats/:id', (req, res) => {
  const chat = store.getChat(req.params.id)
  if (!chat) return void res.status(404).json({ error: 'chat not found' })
  res.json(chat)
})

app.get('/api/chats/:id/messages', (req, res) => {
  if (!store.getChat(req.params.id)) return void res.status(404).json({ error: 'chat not found' })
  res.json(store.readMessages(req.params.id))
})

app.patch('/api/chats/:id', (req, res) => {
  const chat = store.getChat(req.params.id)
  if (!chat) return void res.status(404).json({ error: 'chat not found' })
  if (typeof req.body.name === 'string' && req.body.name.trim()) chat.name = req.body.name.trim()
  store.saveChat(chat)
  res.json(chat)
})

app.delete('/api/chats/:id', (req, res) => {
  store.deleteChat(req.params.id)
  res.json({ ok: true })
})

// A whole chat as one static self-contained page. Browsers cap element
// heights around 33M px and choke on million-node DOMs, so past this many
// messages a single page physically cannot scroll — refuse honestly.
export const CHAT_PAGE_LIMIT = 25_000

app.get('/api/chats/:id/page.html', (req, res) => {
  const chat = store.getChat(String(req.params.id))
  if (!chat) return void res.status(404).json({ error: 'chat not found' })
  const messages = store.readMessages(chat.id)
  if (messages.length > CHAT_PAGE_LIMIT) {
    return void res.status(400).json({
      error: `this chat has ${messages.length.toLocaleString()} messages — a single HTML page stops scrolling around ${CHAT_PAGE_LIMIT.toLocaleString()}. Save the moments as memories instead.`,
    })
  }
  const emojiSources = messages.flatMap((m) => [m.text, ...(m.reactions?.map((r) => r.emoji.repeat(r.count)) ?? [])])
  const pseudo: Memory = {
    id: chat.id,
    chatId: chat.id,
    chatName: chat.name,
    title: `${chat.me} & ${chat.name}`,
    tags: [],
    createdAt: new Date().toISOString(),
    startTs: messages[0]?.ts ?? Date.now(),
    endTs: messages[messages.length - 1]?.ts ?? Date.now(),
    count: messages.length,
    sealEmoji: dominantEmoji(emojiSources),
    messages,
  }
  const html = renderMemoryHtml(pseudo, store.chatMediaDir(chat.id), 'page')
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  if (req.query.download !== undefined) {
    res.setHeader('Content-Disposition', `attachment; filename="${slugify(chat.name, 'chat')}.html"`)
  }
  res.send(html)
})

// ---------- import: official "Export Chat" .zip / .txt ----------

app.post('/api/import/export-zip', upload.single('file'), (req, res) => {
  const file = req.file
  if (!file) return void res.status(400).json({ error: 'no file uploaded' })
  try {
    let txt: string | undefined
    const mediaFiles = new Map<string, Buffer>()

    if (file.originalname.toLowerCase().endsWith('.txt')) {
      txt = fs.readFileSync(file.path, 'utf8')
    } else {
      const zip = new AdmZip(file.path)
      const entries = zip.getEntries().filter((e) => !e.isDirectory)
      const txtEntry = entries
        .filter((e) => e.entryName.toLowerCase().endsWith('.txt'))
        .sort((a, b) => b.header.size - a.header.size)[0]
      if (!txtEntry) return void res.status(400).json({ error: 'no chat .txt found inside the zip' })
      txt = txtEntry.getData().toString('utf8')
      for (const e of entries) {
        const base = path.basename(e.entryName)
        if (e === txtEntry || base.startsWith('.') || base.toLowerCase().endsWith('.txt')) continue
        mediaFiles.set(base, e.getData())
      }
    }

    const entries = parseExportTxt(txt)
    if (entries.length === 0) {
      return void res.status(400).json({ error: 'could not parse any messages from this file' })
    }
    const participants = participantsOf(entries)

    const me = typeof req.body.me === 'string' ? req.body.me : undefined
    if (!me || !participants.includes(me)) {
      return void res.json({ needsMe: true, participants, messageCount: entries.length })
    }

    const others = participants.filter((p) => p !== me)
    const fromFilename = file.originalname.match(/WhatsApp Chat with (.+?)\.(?:zip|txt)$/i)?.[1]
    const name = others.length === 1 ? others[0] : (fromFilename ?? others.join(' & ').slice(0, 60)) || 'Chat'

    const targetChatId = typeof req.body.targetChatId === 'string' && req.body.targetChatId ? req.body.targetChatId : undefined
    const chatId = targetChatId ?? `${slugify(name)}-${shortHash([...participants].sort().join('|'))}`
    const existing = store.getChat(chatId)

    const mediaDir = store.chatMediaDir(chatId)
    for (const [base, buf] of mediaFiles) fs.writeFileSync(path.join(mediaDir, base), buf)

    const msgs = buildExportMsgs(entries, me)
    for (const m of msgs) {
      if (m.media?.originalName && mediaFiles.has(m.media.originalName)) {
        m.media.file = m.media.originalName
        m.media.missing = false
      }
    }

    const { messages, added, merged } = mergeMessages(existing ? store.readMessages(chatId) : [], msgs)
    store.writeMessages(chatId, messages)

    const meta: ChatMeta = {
      id: chatId,
      name: existing?.name ?? name,
      me: existing?.me ?? me,
      participants: [...new Set([...(existing?.participants ?? []), ...participants])],
      messageCount: messages.length,
      firstTs: messages[0]?.ts,
      lastTs: messages[messages.length - 1]?.ts,
      sources: [
        ...(existing?.sources ?? []),
        { type: 'export', importedAt: new Date().toISOString(), file: file.originalname, added, merged },
      ],
    }
    store.saveChat(meta)
    res.json({ chat: meta, added, merged })
  } finally {
    fs.rmSync(file.path, { force: true })
  }
})

// ---------- import: full archive (msgstore.db dump or wtsexporter result.json) ----------

// Direct msgstore.db import — the wabdd dump flow, no wtsexporter needed
function msgstoreHandler(req: express.Request, res: express.Response, p: string) {
  const loc = locateMsgstore(p)!
  const jid = typeof req.body.jid === 'string' ? req.body.jid : undefined
  if (!jid) {
    return void res.json({ kind: 'msgstore', db: loc.dbPath, mediaRoots: loc.mediaRoots, chats: listMsgstoreChats(loc.dbPath) })
  }

  const targetChatId = typeof req.body.targetChatId === 'string' && req.body.targetChatId ? req.body.targetChatId : undefined
  const theirName = jid.split('@')[0]
  const chatId = targetChatId ?? `${slugify(theirName)}-${shortHash(jid)}`
  const existing = store.getChat(chatId)
  const me = (typeof req.body.me === 'string' && req.body.me.trim()) || existing?.me || 'Me'

  const { msgs, mediaRefs } = buildMsgstoreMsgs(loc.dbPath, jid, me, existing?.name ?? theirName)
  const located = collectMedia(mediaRefs, loc.mediaRoots, store.chatMediaDir(chatId))
  for (const m of msgs) {
    if (m.media?.originalName && located.has(m.media.originalName)) {
      m.media.file = m.media.originalName
      m.media.missing = false
    }
  }

  const { messages, added, merged } = mergeMessages(existing ? store.readMessages(chatId) : [], msgs)
  store.writeMessages(chatId, messages)

  const meta: ChatMeta = {
    id: chatId,
    name: existing?.name ?? theirName,
    me,
    participants: [...new Set([...(existing?.participants ?? []), me, existing?.name ?? theirName])],
    messageCount: messages.length,
    firstTs: messages[0]?.ts,
    lastTs: messages[messages.length - 1]?.ts,
    sources: [
      ...(existing?.sources ?? []),
      { type: 'msgstore', importedAt: new Date().toISOString(), file: loc.dbPath, added, merged },
    ],
  }
  store.saveChat(meta)
  res.json({ kind: 'msgstore', chat: meta, added, merged, mediaLocated: located.size, mediaReferenced: mediaRefs.size })
}

// unified entry: detect what the pasted path is and route accordingly
app.post('/api/import/archive', (req, res) => {
  const p = typeof req.body.path === 'string' ? req.body.path.trim().replace(/^~(?=\/)/, process.env.HOME ?? '~') : ''
  if (!p) return void res.status(400).json({ error: 'path is required' })
  if (!fs.existsSync(p)) return void res.status(400).json({ error: `path does not exist: ${p}` })
  if (locateMsgstore(p)) return void msgstoreHandler(req, res, p)
  return void wtsHandler(req, res, p)
})

app.post('/api/import/wts', (req, res) => {
  const p = typeof req.body.path === 'string' ? req.body.path.trim().replace(/^~(?=\/)/, process.env.HOME ?? '~') : ''
  if (!p) return void res.status(400).json({ error: 'path is required' })
  if (!fs.existsSync(p)) return void res.status(400).json({ error: `path does not exist: ${p}` })
  wtsHandler(req, res, p)
})

function wtsHandler(req: express.Request, res: express.Response, p: string) {
  const isDir = fs.statSync(p).isDirectory()
  const jsonPath = isDir ? path.join(p, 'result.json') : p
  const baseDir = isDir ? p : path.dirname(p)
  if (!fs.existsSync(jsonPath)) {
    return void res.status(400).json({ error: `no result.json found in ${p} — run wtsexporter with -j` })
  }

  let json: Record<string, any>
  try {
    json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
  } catch {
    return void res.status(400).json({ error: 'could not parse result.json' })
  }

  const jid = typeof req.body.jid === 'string' ? req.body.jid : undefined
  if (!jid) return void res.json({ kind: 'wts', chats: listWtsChats(json).slice(0, 100) })

  const chat = json[jid]
  if (!chat) return void res.status(404).json({ error: `chat ${jid} not found in result.json` })

  const targetChatId = typeof req.body.targetChatId === 'string' && req.body.targetChatId ? req.body.targetChatId : undefined
  const theirName = chat.name || jid.split('@')[0]
  const chatId = targetChatId ?? `${slugify(theirName)}-${shortHash(jid)}`
  const existing = store.getChat(chatId)
  const me = (typeof req.body.me === 'string' && req.body.me.trim()) || existing?.me || 'Me'

  const { msgs, mediaRefs } = buildWtsMsgs(chat, me, theirName)

  const mediaDir = store.chatMediaDir(chatId)
  const located = new Set<string>()
  for (const [base, rel] of mediaRefs) {
    const clean = rel.replace(/^\.\//, '')
    const candidates = [
      path.join(baseDir, clean),
      path.join(baseDir, chat.media_base ?? '', clean),
      path.join(baseDir, base),
    ]
    const src = candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile())
    if (src) {
      fs.copyFileSync(src, path.join(mediaDir, base))
      located.add(base)
    }
  }
  for (const m of msgs) {
    if (m.media?.originalName && located.has(m.media.originalName)) {
      m.media.file = m.media.originalName
      m.media.missing = false
    }
  }

  const { messages, added, merged } = mergeMessages(existing ? store.readMessages(chatId) : [], msgs)
  store.writeMessages(chatId, messages)

  const meta: ChatMeta = {
    id: chatId,
    name: existing?.name ?? theirName,
    me,
    participants: [...new Set([...(existing?.participants ?? []), me, theirName])],
    messageCount: messages.length,
    firstTs: messages[0]?.ts,
    lastTs: messages[messages.length - 1]?.ts,
    sources: [
      ...(existing?.sources ?? []),
      { type: 'wts', importedAt: new Date().toISOString(), file: jsonPath, added, merged },
    ],
  }
  store.saveChat(meta)
  res.json({ kind: 'wts', chat: meta, added, merged })
}

// ---------- media ----------

function sendMedia(dir: string, file: unknown, res: express.Response) {
  const p = path.join(dir, path.basename(String(file)))
  if (!fs.existsSync(p)) return void res.status(404).end()
  res.sendFile(p)
}

app.get('/api/media/:chatId/:file', (req, res) => {
  sendMedia(store.chatMediaDir(String(req.params.chatId)), req.params.file, res)
})

app.get('/api/memory-media/:memoryId/:file', (req, res) => {
  sendMedia(store.memoryMediaDir(String(req.params.memoryId)), req.params.file, res)
})

// ---------- memories ----------

app.get('/api/memories', (_req, res) => {
  res.json(store.listMemories())
})

// every memory as a self-contained .html in one zip — must be registered
// before the /api/memories/:id routes so the literal path wins
app.get('/api/memories/export.zip', (req, res) => {
  const mode = req.query.mode === 'page' ? 'page' : 'replay'
  const metas = store.listMemories()
  if (metas.length === 0) return void res.status(404).json({ error: 'no memories to export' })
  const zip = new AdmZip()
  for (const meta of metas) {
    const m = store.getMemory(meta.id)
    if (!m) continue
    zip.addFile(`${m.id}.html`, Buffer.from(renderMemoryHtml(m, store.memoryMediaDir(m.id), mode), 'utf8'))
  }
  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', `attachment; filename="keepsake-memories-${mode}.zip"`)
  res.send(zip.toBuffer())
})

app.post('/api/memories', (req, res) => {
  const { chatId, startId, endId, title, note, tags } = req.body ?? {}
  if (!chatId || !startId || !endId || !title?.trim()) {
    return void res.status(400).json({ error: 'chatId, startId, endId and title are required' })
  }
  const memory = store.createMemoryFromRange({ chatId, startId, endId, title, note, tags })
  res.json(memory)
})

app.get('/api/memories/:id', (req, res) => {
  const m = store.getMemory(req.params.id)
  if (!m) return void res.status(404).json({ error: 'memory not found' })
  res.json(m)
})

app.patch('/api/memories/:id', (req, res) => {
  const m = store.getMemory(req.params.id)
  if (!m) return void res.status(404).json({ error: 'memory not found' })
  if (typeof req.body.title === 'string' && req.body.title.trim()) m.title = req.body.title.trim()
  if ('note' in req.body) m.note = req.body.note?.trim() || undefined
  if (Array.isArray(req.body.tags)) m.tags = req.body.tags.map((t: string) => String(t).trim()).filter(Boolean)
  store.saveMemory(m)
  res.json(m)
})

app.delete('/api/memories/:id', (req, res) => {
  store.deleteMemory(req.params.id)
  res.json({ ok: true })
})

function sendMemoryHtml(mode: 'replay' | 'page') {
  return (req: express.Request, res: express.Response) => {
    const id = String(req.params.id)
    const m = store.getMemory(id)
    if (!m) return void res.status(404).json({ error: 'memory not found' })
    const html = renderMemoryHtml(m, store.memoryMediaDir(m.id), mode)
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    if (req.query.download !== undefined) {
      const suffix = mode === 'replay' ? '-replay' : ''
      res.setHeader('Content-Disposition', `attachment; filename="${slugify(m.title, 'memory')}${suffix}.html"`)
    }
    res.send(html)
  }
}

app.get('/api/memories/:id/replay.html', sendMemoryHtml('replay'))
app.get('/api/memories/:id/page.html', sendMemoryHtml('page'))

app.post('/api/memories/:id/png', (req, res) => {
  const m = store.getMemory(req.params.id)
  if (!m) return void res.status(404).json({ error: 'memory not found' })
  const dataUrl = String(req.body.dataUrl ?? '')
  const b64 = dataUrl.replace(/^data:image\/png;base64,/, '')
  if (!b64 || b64 === dataUrl) return void res.status(400).json({ error: 'expected a png data url' })
  fs.writeFileSync(store.memoryPngPath(m.id), Buffer.from(b64, 'base64'))
  res.json({ ok: true })
})

app.get('/api/memories/:id/png', (req, res) => {
  const p = store.memoryPngPath(req.params.id)
  if (!fs.existsSync(p)) return void res.status(404).end()
  res.sendFile(p)
})

// ---------- static (packaged binary / production) ----------

function seaAsset(key: string): Buffer | undefined {
  try {
    return Buffer.from(getAsset(key))
  } catch {
    return undefined
  }
}

const DIST = path.resolve(process.cwd(), 'dist')
if (isSea()) {
  // the built frontend travels inside the executable as SEA assets
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next()
    let key = req.path === '/' ? 'index.html' : decodeURIComponent(req.path.slice(1))
    let buf = seaAsset(key)
    if (!buf) {
      key = 'index.html' // SPA fallback
      buf = seaAsset(key)
    }
    if (!buf) return next()
    res.setHeader('Content-Type', mimeFromName(key))
    res.end(buf)
  })
} else if (process.env.NODE_ENV === 'production' && fs.existsSync(DIST)) {
  app.use(express.static(DIST))
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) return void res.sendFile(path.join(DIST, 'index.html'))
    next()
  })
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err)
  res.status(err.status ?? 500).json({ error: err.message ?? 'internal error' })
})

const PORT = Number(process.env.PORT ?? 3010)
app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`
  console.log(`Keepsake 💌  ${url}  (your data lives in ${store.DATA_DIR})`)
  if (isSea() && !process.env.KEEPSAKE_NO_OPEN) {
    const [cmd, args]: [string, string[]] =
      process.platform === 'darwin'
        ? ['open', [url]]
        : process.platform === 'win32'
          ? ['cmd', ['/c', 'start', '', url]]
          : ['xdg-open', [url]]
    try {
      spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref()
    } catch {
      /* the console already shows the URL */
    }
  }
})
