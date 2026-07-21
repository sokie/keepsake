import type { Msg } from '../../shared/types'
import { isEmojiOnly } from '../../shared/emoji'
import { fmtDay, fmtTime, sameDay } from '../lib/format'

const MISSING_LABEL: Record<string, string> = {
  image: 'photo',
  video: 'video',
  gif: 'GIF',
  sticker: 'sticker',
  voice: 'voice message',
  audio: 'audio',
  document: 'file',
  unknown: 'attachment',
}

const QUOTED_MEDIA_LABEL: Record<string, string> = {
  image: '📷 Photo',
  video: '🎬 Video',
  gif: '🎞️ GIF',
  sticker: '🌸 Sticker',
  voice: '🎙️ Voice message',
  audio: '🎵 Audio',
  document: '📄 Document',
  unknown: '📎 Attachment',
}

function QuotedBlock({ q }: { q: NonNullable<Msg['quoted']> }) {
  const preview = q.text?.trim() || (q.mediaType && QUOTED_MEDIA_LABEL[q.mediaType]) || 'message'
  return (
    <div className={`quoted ${q.fromMe ? 'me' : 'them'}`}>
      <span className="quoted-who">{q.sender}</span>
      <span className="quoted-text">{preview}</span>
    </div>
  )
}

function MediaEl({ m, mediaBase, eager }: { m: Msg; mediaBase: string; eager?: boolean }) {
  const media = m.media!
  const loading = eager ? 'eager' : 'lazy'
  if (!media.file) {
    return (
      <div className="missing-media">
        <span>📎</span>
        <span>{MISSING_LABEL[media.type] ?? 'attachment'} not included in the export</span>
      </div>
    )
  }
  const src = `${mediaBase}/${encodeURIComponent(media.file)}`
  const avChip = (icon: string, label: string) => (
    <div className="av-chip">
      <span>{icon}</span>
      <span>
        {label}
        {media.originalName ? ` · ${media.originalName}` : ''}
      </span>
    </div>
  )
  switch (media.type) {
    case 'gif':
      // WhatsApp "GIFs" are mp4 files — render them as silently looping video
      if (/\.(mp4|mov)$/i.test(media.file)) {
        return (
          <>
            <video src={src} autoPlay loop muted playsInline preload="metadata" />
            {avChip('🎞️', 'GIF')}
          </>
        )
      }
      return <img src={src} loading={loading} alt="" />
    case 'image':
      return <img src={src} loading={loading} alt="" />
    case 'sticker':
      return <img src={src} loading={loading} alt="" className="sticker" />
    case 'video':
      return (
        <>
          <video src={src} controls preload="metadata" playsInline />
          {avChip('🎬', 'video')}
        </>
      )
    case 'voice':
      return (
        <>
          <audio src={src} controls preload="none" />
          {avChip('🎙️', 'voice message')}
        </>
      )
    case 'audio':
      return (
        <>
          <audio src={src} controls preload="none" />
          {avChip('🎵', 'audio')}
        </>
      )
    default:
      return (
        <a href={src} download={media.originalName ?? media.file} className="missing-media" style={{ textDecoration: 'none' }}>
          <span>📄</span>
          <span>{media.originalName ?? media.file}</span>
        </a>
      )
  }
}

export interface MessageRowProps {
  m: Msg
  prev?: Msg
  mediaBase: string
  selectable?: boolean
  selEdge?: boolean
  onSelect?: (id: string) => void
  animate?: boolean
  /** load media immediately — required for off-screen capture */
  eager?: boolean
  /** suppress the automatic day separator (replay draws its own) */
  noDayChip?: boolean
}

export function MessageRow({ m, prev, mediaBase, selectable, selEdge, onSelect, animate, eager, noDayChip }: MessageRowProps) {
  const dayChip = !noDayChip && (!prev || !sameDay(prev.ts, m.ts)) ? <div className="daychip">{fmtDay(m.ts)}</div> : null

  if (m.system) {
    return (
      <>
        {dayChip}
        <div className="syschip">{m.text}</div>
      </>
    )
  }

  const grouped = !!prev && !prev.system && prev.fromMe === m.fromMe && sameDay(prev.ts, m.ts) && m.ts - prev.ts < 180000 && !dayChip
  const jumbo = !m.media && !m.quoted && !!m.text && isEmojiOnly(m.text)
  const rowCls = [
    'row',
    m.fromMe ? 'me' : 'them',
    grouped ? '' : 'first',
    m.reactions?.length ? 'reacted' : '',
    selEdge ? 'sel-edge' : '',
    selectable ? 'selectable' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const total = m.reactions?.reduce((s, r) => s + r.count, 0) ?? 0

  return (
    <>
      {dayChip}
      <div className={rowCls}>
        <div
          className={[
            'bubble',
            jumbo ? 'jumbo' : '',
            m.media ? 'has-media' : '',
            m.media?.type === 'sticker' && m.media.file ? 'stickerb' : '',
            animate ? 'pop' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={selectable && onSelect ? () => onSelect(m.id) : undefined}
        >
          {m.quoted && <QuotedBlock q={m.quoted} />}
          {m.media && <MediaEl m={m} mediaBase={mediaBase} eager={eager} />}
          {m.text && <span className={m.media ? 'cap txt' : 'txt'}>{m.text}</span>}
          <span className="time">
            {m.edited && <i>edited · </i>}
            {fmtTime(m.ts)}
          </span>
          {m.reactions && m.reactions.length > 0 && (
            <div className="reactions">
              {m.reactions.map((r) => r.emoji).join('')}
              {total > 1 ? ` ${total}` : ''}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
