import type { Ref } from 'react'
import type { Memory } from '../../shared/types'
import { fmtRange } from '../lib/format'
import { MessageRow } from './MessageBubble'

/**
 * The capture surface for tall-PNG exports: chapter card + full thread on the
 * chat wallpaper. Used on the memory page (visible) and by the gallery's
 * bulk export (mounted off-screen, media loaded eagerly).
 */
export function MemoryCanvas({
  memory,
  mediaBase,
  eager,
  ref,
}: {
  memory: Memory
  mediaBase: string
  eager?: boolean
  ref?: Ref<HTMLDivElement>
}) {
  return (
    <div ref={ref} className="png-canvas mem-thread" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="chapter">
        <div className="seal">{memory.sealEmoji}</div>
        <h1>{memory.title}</h1>
        <div className="dates">
          {fmtRange(memory.startTs, memory.endTs)} · with {memory.chatName}
        </div>
        {memory.note && <p className="note">“{memory.note}”</p>}
        {memory.tags.length > 0 && (
          <div className="tagrow" style={{ marginTop: 14 }}>
            {memory.tags.map((t) => (
              <span key={t} className="tag">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="png-thread">
        {memory.messages.map((m, i) => (
          <MessageRow key={m.id} m={m} prev={i > 0 ? memory.messages[i - 1] : undefined} mediaBase={mediaBase} eager={eager} />
        ))}
      </div>
    </div>
  )
}
