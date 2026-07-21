import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { MediaType, Msg, QuotedMsg, Reaction } from '../../shared/types.js'
import { mediaTypeFromName } from './util.js'
import { msgId } from './normalize.js'

/**
 * Direct importer for WhatsApp Android's msgstore.db (modern schema:
 * message/chat/jid), as produced decrypted by wabdd
 * (github.com/giacomoferretti/whatsapp-backup-downloader-decryptor).
 * Reads the database in place, read-only — never writes to the dump.
 */

export interface MsgstoreLocation {
  dbPath: string
  /** roots whose Media/ subtree may hold the referenced files */
  mediaRoots: string[]
}

/**
 * Resolve a user-pasted path (dump root, its -decrypted sibling, or the .db
 * itself) to the database plus candidate media roots. wabdd decrypts the db
 * into `<dump>-decrypted/` while the bulk of the media stays unencrypted in
 * `<dump>/Media` — and the newest few files exist only in the decrypted
 * sibling — so both siblings are searched.
 */
export function locateMsgstore(p: string): MsgstoreLocation | undefined {
  const roots: string[] = []
  let dbPath: string | undefined

  const isFile = (c: string) => {
    try {
      return fs.statSync(c).isFile()
    } catch {
      return false
    }
  }

  if (p.toLowerCase().endsWith('.db')) {
    if (isFile(p)) dbPath = p
    roots.push(path.dirname(path.dirname(p)))
  } else {
    roots.push(p)
  }

  for (const r of [...roots]) {
    const base = path.basename(r)
    const sibling = base.endsWith('-decrypted')
      ? path.join(path.dirname(r), base.slice(0, -'-decrypted'.length))
      : path.join(path.dirname(r), `${base}-decrypted`)
    if (fs.existsSync(sibling)) roots.push(sibling)
  }

  if (!dbPath) {
    for (const r of roots) {
      const cand = [path.join(r, 'Databases', 'msgstore.db'), path.join(r, 'msgstore.db')].find(isFile)
      if (cand) {
        dbPath = cand
        break
      }
    }
  }
  if (!dbPath) return undefined

  const mediaRoots = roots.filter((r) => fs.existsSync(path.join(r, 'Media')))
  return { dbPath, mediaRoots }
}

export interface MsgstoreChatSummary {
  jid: string
  name: string
  count: number
}

export function listMsgstoreChats(dbPath: string): MsgstoreChatSummary[] {
  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    const rows = db
      .prepare(
        `SELECT j.raw_string AS jid, c.subject AS subject, COUNT(m._id) AS count
         FROM chat c
         JOIN jid j ON j._id = c.jid_row_id
         JOIN message m ON m.chat_row_id = c._id
         GROUP BY c._id
         ORDER BY count DESC
         LIMIT 100`,
      )
      .all() as Array<{ jid: unknown; subject: unknown; count: unknown }>
    return rows
      .filter((r) => typeof r.jid === 'string')
      .map((r) => ({
        jid: String(r.jid),
        name: (typeof r.subject === 'string' && r.subject.trim()) || String(r.jid).split('@')[0],
        count: Number(r.count),
      }))
  } finally {
    db.close()
  }
}

// WhatsApp Android message_type → media kind (mime/filename refine it further)
const MEDIA_TYPES: Record<number, MediaType> = {
  1: 'image',
  2: 'audio',
  3: 'video',
  9: 'document',
  13: 'gif',
  20: 'sticker',
}
const SYSTEM_TYPE = 7

export interface MsgstoreBuild {
  msgs: Msg[]
  /** media basename → file_path relative to a media root (e.g. "Media/WhatsApp Images/IMG-….jpg") */
  mediaRefs: Map<string, string>
}

export function buildMsgstoreMsgs(dbPath: string, jid: string, me: string, theirName: string): MsgstoreBuild {
  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    const chat = db
      .prepare('SELECT c._id AS id FROM chat c JOIN jid j ON j._id = c.jid_row_id WHERE j.raw_string = ?')
      .get(jid) as { id: number } | undefined
    if (!chat) throw Object.assign(new Error(`chat ${jid} not found in msgstore.db`), { status: 404 })

    const hasTable = (name: string) =>
      !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(name)

    const edited = new Set<number>()
    if (hasTable('message_edit_info')) {
      const rows = db
        .prepare(
          `SELECT DISTINCT mei.message_row_id AS id
           FROM message_edit_info mei JOIN message m ON m._id = mei.message_row_id
           WHERE m.chat_row_id = ?`,
        )
        .all(chat.id) as Array<{ id: unknown }>
      for (const r of rows) edited.add(Number(r.id))
    }

    const reactions = new Map<number, Reaction[]>()
    if (hasTable('message_add_on') && hasTable('message_add_on_reaction')) {
      const rows = db
        .prepare(
          `SELECT mao.parent_message_row_id AS mid, maor.reaction AS emoji, mao.from_me AS fromMe
           FROM message_add_on mao
           JOIN message_add_on_reaction maor ON maor.message_add_on_row_id = mao._id
           WHERE mao.chat_row_id = ?`,
        )
        .all(chat.id) as Array<{ mid: unknown; emoji: unknown; fromMe: unknown }>
      for (const r of rows) {
        const emoji = typeof r.emoji === 'string' ? r.emoji.trim() : ''
        if (!emoji) continue
        const mid = Number(r.mid)
        const by = r.fromMe ? me : theirName
        const list = reactions.get(mid) ?? []
        const existing = list.find((x) => x.emoji === emoji)
        if (existing) {
          existing.count++
          existing.from?.push(by)
        } else {
          list.push({ emoji, count: 1, from: [by] })
        }
        reactions.set(mid, list)
      }
    }

    // quoted replies: message_quoted holds a snapshot of the replied-to message,
    // keyed by the replying message's row id. Guarded — older schemas lack it.
    const quoted = new Map<number, QuotedMsg>()
    if (hasTable('message_quoted')) {
      const rows = db
        .prepare(
          `SELECT mq.message_row_id AS mid, mq.from_me AS fromMe, mq.text_data AS text, mq.message_type AS type
           FROM message_quoted mq JOIN message m ON m._id = mq.message_row_id
           WHERE m.chat_row_id = ?`,
        )
        .all(chat.id) as Array<{ mid: unknown; fromMe: unknown; text: unknown; type: unknown }>
      for (const r of rows) {
        const q: QuotedMsg = { sender: r.fromMe ? me : theirName, fromMe: !!r.fromMe }
        const text = typeof r.text === 'string' && r.text.trim() ? r.text.trim() : undefined
        if (text) q.text = text
        else {
          const qt = Number(r.type ?? 0)
          if (qt in MEDIA_TYPES) q.mediaType = MEDIA_TYPES[qt]
        }
        quoted.set(Number(r.mid), q)
      }
    }

    const rows = db
      .prepare(
        `SELECT m._id AS id, m.from_me AS fromMe, m.timestamp AS ts, m.text_data AS text,
                m.message_type AS type, mm.file_path AS filePath, mm.mime_type AS mime,
                mm.media_caption AS caption
         FROM message m
         LEFT JOIN message_media mm ON mm.message_row_id = m._id
         WHERE m.chat_row_id = ?
         ORDER BY m.timestamp, m._id`,
      )
      .all(chat.id) as Array<Record<string, unknown>>

    const mediaRefs = new Map<string, string>()
    const msgs: Msg[] = []
    for (const r of rows) {
      const type = Number(r.type ?? 0)
      if (type === SYSTEM_TYPE) continue
      const ts = Number(r.ts)
      if (!Number.isFinite(ts) || ts < 1e12) continue

      const text = typeof r.text === 'string' && r.text ? r.text : undefined
      const hasMedia = type in MEDIA_TYPES || typeof r.filePath === 'string' || typeof r.mime === 'string'
      if (!hasMedia && !text?.trim()) continue

      const msg: Msg = {
        id: '',
        ts,
        sender: r.fromMe ? me : theirName,
        fromMe: !!r.fromMe,
        source: 'msgstore',
      }

      if (hasMedia) {
        const rel = typeof r.filePath === 'string' && r.filePath.trim() ? r.filePath.trim() : undefined
        const original = rel ? path.basename(rel) : undefined
        if (rel && original) mediaRefs.set(original, rel)

        const mime = typeof r.mime === 'string' ? r.mime : ''
        let kind: MediaType = MEDIA_TYPES[type] ?? (original ? mediaTypeFromName(original) : 'unknown')
        if (mime === 'application/was') kind = 'sticker'
        else if (kind === 'audio' && (original?.startsWith('PTT-') || rel?.includes('Voice Notes'))) kind = 'voice'
        else if (kind === 'unknown') {
          if (mime.startsWith('image/')) kind = mime === 'image/gif' ? 'gif' : 'image'
          else if (mime.startsWith('video/')) kind = 'video'
          else if (mime.startsWith('audio/')) kind = 'audio'
        }

        msg.media = { type: kind, originalName: original, missing: true }
        const caption = text?.trim() || (typeof r.caption === 'string' ? r.caption.trim() : '')
        if (caption) msg.text = caption
      } else {
        msg.text = text
      }

      if (edited.has(Number(r.id))) msg.edited = true
      const rx = reactions.get(Number(r.id))
      if (rx) msg.reactions = rx
      const q = quoted.get(Number(r.id))
      if (q) msg.quoted = q
      msgs.push(msg)
    }

    msgs.forEach((m, i) => (m.id = msgId(m, i)))
    return { msgs, mediaRefs }
  } finally {
    db.close()
  }
}

/**
 * Find each referenced media file under the candidate roots and hardlink it
 * into destDir (falling back to a copy across filesystems). Hardlinks cost no
 * disk space and survive deletion of the original dump.
 */
export function collectMedia(mediaRefs: Map<string, string>, mediaRoots: string[], destDir: string): Set<string> {
  const located = new Set<string>()
  for (const [base, rel] of mediaRefs) {
    const clean = rel.replace(/^\.\//, '')
    const candidates = mediaRoots.flatMap((root) => [path.join(root, clean), path.join(root, 'Media', clean)])
    const src = candidates.find((c) => {
      try {
        return fs.statSync(c).isFile()
      } catch {
        return false
      }
    })
    if (!src) continue
    const dst = path.join(destDir, base)
    try {
      if (!fs.existsSync(dst)) {
        try {
          fs.linkSync(src, dst)
        } catch {
          fs.copyFileSync(src, dst)
        }
      }
      located.add(base)
    } catch {
      /* unreadable file — leave as missing */
    }
  }
  return located
}
