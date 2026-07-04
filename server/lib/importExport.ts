import { parseString } from 'whatsapp-chat-parser'
import type { Msg } from '../../shared/types.js'
import { mediaTypeFromName } from './util.js'
import { msgId, spreadWithinMinute, stripEdited } from './normalize.js'

export interface ExportEntry {
  ts: number
  author: string | null
  text: string
  attachment?: string
}

const DATE_PREFIX = /^\[?(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})[,\s]/

/**
 * The parser's own day/month inference has been observed to fail on real
 * exports (US-format "6/25/19" parsed day-first → month 25 rolls the Date
 * years into the future). Decide explicitly: any line whose first field
 * exceeds 12 proves day-first; any second field over 12 proves month-first.
 */
export function detectDaysFirst(txt: string): boolean | undefined {
  let firstIsDay = 0
  let secondIsDay = 0
  for (const line of txt.split('\n')) {
    const m = line.match(DATE_PREFIX)
    if (!m) continue
    const f1 = Number(m[1])
    const f2 = Number(m[2])
    if (f1 > 12 && f1 <= 31) firstIsDay++
    if (f2 > 12 && f2 <= 31) secondIsDay++
  }
  if (firstIsDay === 0 && secondIsDay === 0) return undefined // all ambiguous — let the parser infer
  return firstIsDay >= secondIsDay
}

export function parseExportTxt(txt: string): ExportEntry[] {
  const clean = txt.replace(/^﻿/, '')
  const parsed = parseString(clean, { parseAttachments: true, daysFirst: detectDaysFirst(clean) })
  return parsed.map((m) => ({
    ts: m.date.getTime(),
    author: m.author,
    text: m.message ?? '',
    attachment: m.attachment?.fileName,
  }))
}

export function participantsOf(entries: ExportEntry[]): string[] {
  const set = new Set<string>()
  for (const e of entries) if (e.author) set.add(e.author)
  return [...set]
}

// WhatsApp media filenames are locale-proof even when the surrounding
// "(file attached)" wording is localized
const WA_FILENAME = /\b((?:IMG|VID|PTT|STK|AUD|DOC|GIF)-\d{8}-WA\d{3,}\.\w{2,4})\b/
const ATTACHED_SUFFIX = /^(.+?)\s*\([^()]{4,40}\)\s*$/ // "IMG-….jpg (file attached)" in any language
const IOS_ATTACH_TOKEN = /<attached:\s*([^>]+)>/i
const MEDIA_OMITTED = /^<[^<>]{3,60}>$/ // "<Media omitted>" and localized variants

function splitAttachment(e: ExportEntry): { attachment?: string; caption?: string; omitted?: boolean } {
  const lines = e.text.split('\n')
  const first = (lines[0] ?? '').trim()

  if (e.attachment) {
    // parser found it — everything except marker lines is caption
    const caption = lines
      .filter((l) => !l.includes(e.attachment!) && !IOS_ATTACH_TOKEN.test(l))
      .join('\n')
      .trim()
    return { attachment: e.attachment, caption: caption || undefined }
  }

  const ios = first.match(IOS_ATTACH_TOKEN)
  if (ios) {
    return { attachment: ios[1].trim(), caption: lines.slice(1).join('\n').trim() || undefined }
  }

  const suffix = first.match(ATTACHED_SUFFIX)
  if (suffix && WA_FILENAME.test(suffix[1])) {
    return { attachment: suffix[1].trim(), caption: lines.slice(1).join('\n').trim() || undefined }
  }

  if (MEDIA_OMITTED.test(first) && !stripEdited(first).edited) {
    return { omitted: true, caption: lines.slice(1).join('\n').trim() || undefined }
  }

  return {}
}

export function buildExportMsgs(entries: ExportEntry[], me: string): Msg[] {
  const msgs: Msg[] = []
  for (const e of entries) {
    if (e.author === null) {
      const { text } = stripEdited(e.text)
      if (!text) continue
      msgs.push({
        id: '',
        ts: e.ts,
        sender: 'WhatsApp',
        fromMe: false,
        system: true,
        text,
        source: 'export',
      })
      continue
    }

    const { attachment, caption, omitted } = splitAttachment(e)
    const base: Msg = {
      id: '',
      ts: e.ts,
      sender: e.author,
      fromMe: e.author === me,
      source: 'export',
    }

    if (attachment) {
      base.media = {
        type: mediaTypeFromName(attachment),
        originalName: attachment,
        missing: true, // flipped off once the file is found in the zip
      }
      if (caption) base.text = caption
    } else if (omitted) {
      base.media = { type: 'unknown', missing: true }
      if (caption) base.text = caption
    } else {
      const { text, edited } = stripEdited(e.text)
      base.text = text
      if (edited) base.edited = true
    }

    msgs.push(base)
  }

  spreadWithinMinute(msgs)
  msgs.forEach((m, i) => (m.id = msgId(m, i)))
  return msgs
}
