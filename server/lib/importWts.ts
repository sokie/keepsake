import path from 'node:path'
import type { Msg, Reaction } from '../../shared/types.js'
import { mediaTypeFromName } from './util.js'
import { msgId } from './normalize.js'

export interface WtsChatSummary {
  jid: string
  name: string
  count: number
}

export function listWtsChats(json: Record<string, any>): WtsChatSummary[] {
  return Object.entries(json)
    .filter(([, chat]) => chat && typeof chat === 'object' && chat.messages)
    .map(([jid, chat]) => ({
      jid,
      name: chat.name || jid.split('@')[0],
      count: Object.keys(chat.messages).length,
    }))
    .sort((a, b) => b.count - a.count)
}

/** wtsexporter's reactions shape has varied; accept map/list/object forms */
export function normalizeReactions(raw: unknown): Reaction[] | undefined {
  if (!raw) return undefined
  const out = new Map<string, Reaction>()
  const add = (emoji: unknown, by?: unknown, count = 1) => {
    if (typeof emoji !== 'string' || !emoji.trim()) return
    const key = emoji.trim()
    const r = out.get(key) ?? { emoji: key, count: 0, from: [] }
    r.count += count
    if (typeof by === 'string' && by) r.from!.push(by)
    out.set(key, r)
  }

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === 'string') add(item)
      else if (item && typeof item === 'object') add((item as any).emoji ?? (item as any).reaction, (item as any).sender)
    }
  } else if (typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === 'number') add(k, undefined, v)
      else if (typeof v === 'string') add(v, k)
      else if (v && typeof v === 'object') add((v as any).emoji ?? (v as any).reaction ?? k, (v as any).sender)
    }
  }

  if (out.size === 0) return undefined
  return [...out.values()].map((r) => ({ ...r, from: r.from?.length ? r.from : undefined }))
}

export interface WtsBuildResult {
  msgs: Msg[]
  /** media basename -> relative path as recorded by wtsexporter */
  mediaRefs: Map<string, string>
}

export function buildWtsMsgs(chat: any, me: string, theirName: string): WtsBuildResult {
  const mediaRefs = new Map<string, string>()
  const entries = Object.values(chat.messages ?? {}) as any[]
  entries.sort((a, b) => (a?.timestamp ?? 0) - (b?.timestamp ?? 0))

  const msgs: Msg[] = []
  for (const m of entries) {
    if (!m || typeof m !== 'object') continue
    const tsRaw = Number(m.timestamp ?? 0)
    if (!tsRaw) continue
    const ts = Math.round(tsRaw > 9_999_999_999 ? tsRaw : tsRaw * 1000)

    if (m.meta === true) {
      const text = typeof m.data === 'string' ? m.data.trim() : ''
      if (!text) continue
      msgs.push({ id: '', ts, sender: 'WhatsApp', fromMe: false, system: true, text, source: 'wts' })
      continue
    }

    const fromMe = m.from_me === true
    const msg: Msg = {
      id: '',
      ts,
      sender: fromMe ? me : m.sender || theirName,
      fromMe,
      source: 'wts',
    }

    if (m.media === true) {
      const rel = typeof m.data === 'string' && m.data.trim() ? m.data.trim() : undefined
      const original = rel ? path.basename(rel) : undefined
      if (rel && original) mediaRefs.set(original, rel)
      msg.media = {
        type: original ? mediaTypeFromName(original) : 'unknown',
        originalName: original,
        missing: true, // flipped off after the file is located and copied
      }
      if (m.sticker === true) msg.media.type = 'sticker'
      else if (typeof m.mime === 'string') {
        if (m.mime === 'image/gif') msg.media.type = 'gif'
        else if (m.mime.startsWith('image/') && msg.media.type === 'unknown') msg.media.type = 'image'
        else if (m.mime.startsWith('video/') && msg.media.type === 'unknown') msg.media.type = 'video'
        else if (m.mime.startsWith('audio/') && msg.media.type === 'unknown') msg.media.type = 'audio'
      }
      const caption = typeof m.caption === 'string' ? m.caption.trim() : ''
      if (caption) msg.text = caption
    } else {
      const text = typeof m.data === 'string' ? m.data : ''
      if (!text.trim()) continue
      msg.text = text
    }

    const reactions = normalizeReactions(m.reactions)
    if (reactions) msg.reactions = reactions

    msgs.push(msg)
  }

  msgs.forEach((m, i) => (m.id = msgId(m, i)))
  return { msgs, mediaRefs }
}
