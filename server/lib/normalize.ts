import { createHash } from 'node:crypto'
import type { Msg } from '../../shared/types.js'

/**
 * Merging rules, born from how the two sources differ:
 * - Export .txt timestamps have MINUTE precision; wtsexporter has seconds.
 * - Exports lack reactions; wtsexporter has them.
 * - The same message must not appear twice when both sources are imported,
 *   and re-importing the same file must be a no-op.
 */

const EDITED_MARKERS = [/<this message was edited>/i, /<acest mesaj a fost editat>/i]

export function stripEdited(text: string): { text: string; edited: boolean } {
  for (const re of EDITED_MARKERS) {
    if (re.test(text)) return { text: text.replace(re, '').trim(), edited: true }
  }
  return { text, edited: false }
}

function normText(text: string | undefined): string {
  return (text ?? '').normalize('NFC').replace(/\s+/g, ' ').trim()
}

function contentToken(m: Msg): string {
  // media messages match type-agnostically: an export's "<Media omitted>" has
  // unknown type while the wts side knows it's an image — must still pair up.
  // Multiple media in the same minute pair one-to-one in chronological order.
  if (m.media) return 'm'
  return `t:${normText(m.text)}`
}

export function dedupeKey(m: Msg, minuteOffset = 0): string {
  const minute = Math.floor(m.ts / 60000) + minuteOffset
  return `${minute}|${m.fromMe ? 1 : 0}|${contentToken(m)}`
}

export function msgId(m: Omit<Msg, 'id'>, seq: number): string {
  return createHash('sha1')
    .update(`${m.source}|${m.ts}|${m.fromMe ? 1 : 0}|${normText(m.text)}|${m.media?.originalName ?? ''}|${seq}`)
    .digest('hex')
    .slice(0, 16)
}

function preferIncoming(existing: Msg, incoming: Msg): void {
  // database-derived timestamps (wts / msgstore) are precise; adopt them over
  // minute-rounded export times
  const existingRounded = existing.ts % 60000 === 0
  const incomingPrecise = incoming.ts % 60000 !== 0
  if (incoming.source !== 'export' && (existingRounded || incomingPrecise)) {
    existing.ts = incoming.ts
  }
  if (incoming.reactions?.length) existing.reactions = incoming.reactions
  if (incoming.edited) existing.edited = true
  if (incoming.media) {
    if (!existing.media) existing.media = incoming.media
    else if (!existing.media.file && incoming.media.file) {
      // the incoming side actually has the file on disk — take it wholesale
      existing.media = { ...incoming.media }
    } else {
      // no file to gain, but richer metadata still matters: the filename lets
      // a future import (another backup, the partner's export) fill the gap
      existing.media.originalName ??= incoming.media.originalName
      if (existing.media.type === 'unknown' && incoming.media.type !== 'unknown') {
        existing.media.type = incoming.media.type
      }
    }
    if (existing.media.file) existing.media.missing = false
  }
  const exText = normText(existing.text)
  const inText = normText(incoming.text)
  if (!exText && inText) existing.text = incoming.text
}

export interface MergeResult {
  messages: Msg[]
  added: number
  merged: number
}

export function mergeMessages(existing: Msg[], incoming: Msg[]): MergeResult {
  const byKey = new Map<string, number[]>()
  existing.forEach((m, i) => {
    const k = dedupeKey(m)
    const arr = byKey.get(k)
    if (arr) arr.push(i)
    else byKey.set(k, [i])
  })

  const used = new Set<number>()
  const result = existing.map((m) => ({ ...m, media: m.media ? { ...m.media } : undefined }))
  let added = 0
  let merged = 0

  const findMatch = (m: Msg): number | undefined => {
    // ±60 min fallbacks absorb timezone/DST drift between phone-local export
    // times and wtsexporter's absolute unix timestamps (text messages only —
    // media matched by type alone would false-positive too easily that far out)
    const offsets = m.media ? [0] : [0, -60, 60]
    for (const off of offsets) {
      for (const idx of byKey.get(dedupeKey(m, off)) ?? []) {
        if (!used.has(idx)) return idx
      }
    }
    return undefined
  }

  for (const inc of incoming) {
    const idx = findMatch(inc)
    if (idx !== undefined) {
      used.add(idx)
      preferIncoming(result[idx], inc)
      merged++
    } else {
      result.push({ ...inc, media: inc.media ? { ...inc.media } : undefined })
      added++
    }
  }

  result.sort((a, b) => a.ts - b.ts)
  return { messages: result, added, merged }
}

/**
 * Export .txt messages within the same minute all land on :00.000 — spread
 * them by 10ms in file order so their on-screen order survives sorting.
 * (Capped inside the minute so the dedupe bucket never shifts.)
 */
export function spreadWithinMinute(msgs: Msg[]): Msg[] {
  let lastMinute = -1
  let seq = 0
  for (const m of msgs) {
    const minute = Math.floor(m.ts / 60000)
    if (minute === lastMinute) seq++
    else {
      lastMinute = minute
      seq = 0
    }
    if (m.ts % 60000 === 0) m.ts += Math.min(seq * 10, 59_000)
  }
  return msgs
}
