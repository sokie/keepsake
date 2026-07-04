import { createHash } from 'node:crypto'
import type { MediaType } from '../../shared/types.js'

export function slugify(s: string, fallback = 'chat'): string {
  const out = s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return out || fallback
}

export function shortHash(s: string, len = 6): string {
  return createHash('sha1').update(s).digest('hex').slice(0, len)
}

const VOICE_RE = /^PTT-|\.opus$/i
const STICKER_RE = /^STK-|\.webp$/i
const IMAGE_RE = /^IMG-|\.(jpe?g|png|heic|heif)$/i
const VIDEO_RE = /^VID-|\.(mp4|mov|3gp|mkv)$/i
const AUDIO_RE = /^AUD-|\.(m4a|mp3|aac|ogg|wav|amr)$/i
const GIF_RE = /\.gif$/i
const DOC_RE = /\.(pdf|docx?|xlsx?|pptx?|txt|vcf|zip)$/i

export function mediaTypeFromName(name: string): MediaType {
  const base = name.split('/').pop() ?? name
  if (VOICE_RE.test(base)) return 'voice'
  if (STICKER_RE.test(base)) return 'sticker'
  if (GIF_RE.test(base)) return 'gif'
  if (IMAGE_RE.test(base)) return 'image'
  if (VIDEO_RE.test(base)) return 'video'
  if (AUDIO_RE.test(base)) return 'audio'
  if (DOC_RE.test(base)) return 'document'
  return 'unknown'
}

export function mimeFromName(name: string): string {
  const ext = (name.split('.').pop() ?? '').toLowerCase()
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    heic: 'image/heic',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    '3gp': 'video/3gpp',
    opus: 'audio/ogg',
    ogg: 'audio/ogg',
    m4a: 'audio/mp4',
    mp3: 'audio/mpeg',
    aac: 'audio/aac',
    wav: 'audio/wav',
    pdf: 'application/pdf',
    html: 'text/html; charset=utf-8',
    js: 'text/javascript',
    mjs: 'text/javascript',
    css: 'text/css',
    svg: 'image/svg+xml',
    ico: 'image/x-icon',
    json: 'application/json',
    map: 'application/json',
    woff2: 'font/woff2',
    woff: 'font/woff',
    txt: 'text/plain; charset=utf-8',
  }
  return map[ext] ?? 'application/octet-stream'
}
