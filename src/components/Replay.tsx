import { useEffect, useRef, useState } from 'react'
import type { Memory } from '../../shared/types'
import { fmtRange } from '../lib/format'
import { MessageRow } from './MessageBubble'

const SPEEDS = [1, 2, 4]

export function Replay({ memory, mediaBase, onClose }: { memory: Memory; mediaBase: string; onClose: () => void }) {
  const msgs = memory.messages
  const backRef = useRef<HTMLDivElement>(null)

  const [started, setStarted] = useState(false)
  const [visible, setVisible] = useState(0)
  const [typing, setTyping] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // the timer chain: each render with playing=true schedules the next reveal
  useEffect(() => {
    if (!playing) return
    if (visible >= msgs.length) {
      setDone(true)
      setPlaying(false)
      return
    }
    const m = msgs[visible]
    const len = (m.text?.length ?? 0) + (m.media ? 40 : 0)
    const typed = !m.fromMe && !m.system
    const delay = (typed ? Math.min(600 + len * 22, 2400) : Math.min(280 + len * 10, 1400)) / speed
    if (typed) setTyping(true)
    const t = window.setTimeout(() => {
      setTyping(false)
      setVisible((v) => v + 1)
    }, delay)
    return () => {
      window.clearTimeout(t)
      setTyping(false)
    }
  }, [playing, visible, speed, msgs])

  useEffect(() => {
    backRef.current?.scrollTo({ top: backRef.current.scrollHeight, behavior: 'smooth' })
  }, [visible, typing, done])

  const start = () => {
    setStarted(true)
    setPlaying(true)
  }
  const skip = () => {
    setPlaying(false)
    setTyping(false)
    setVisible(msgs.length)
    setDone(true)
  }
  const restart = () => {
    setVisible(0)
    setDone(false)
    setTyping(false)
    setPlaying(true)
    backRef.current?.scrollTo({ top: 0 })
  }

  return (
    <div className="replay-back" ref={backRef}>
      <div className="replay-col">
        <div className="replay-cover">
          <div className="seal">{memory.sealEmoji}</div>
          <h1>{memory.title}</h1>
          <div className="dates">{fmtRange(memory.startTs, memory.endTs)}</div>
          {memory.note && (
            <p style={{ marginTop: 12, fontStyle: 'italic', color: 'var(--ink-soft)' }}>“{memory.note}”</p>
          )}
          {!started && (
            <button className="btn rose" style={{ marginTop: 22 }} onClick={start}>
              ▶ relive it
            </button>
          )}
        </div>

        <div>
          {msgs.slice(0, visible).map((m, i) => (
            <MessageRow
              key={m.id}
              m={m}
              prev={i > 0 ? msgs[i - 1] : undefined}
              mediaBase={mediaBase}
              animate={started && !done && i === visible - 1}
            />
          ))}
          {typing && (
            <div className="row them first">
              <div className="bubble">
                <span className="typing-bubble">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
            </div>
          )}
        </div>

        {done && <div className="replay-fin">— kept with 💌 —</div>}
      </div>

      <div className="replay-controls">
        {started && !done && (
          <button onClick={() => setPlaying((p) => !p)} title="play / pause">
            {playing ? '⏸' : '▶'}
          </button>
        )}
        <button onClick={() => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length])} title="speed">
          {speed}×
        </button>
        {!done && (
          <button onClick={skip} title="show everything">
            ⏭
          </button>
        )}
        {started && (
          <button onClick={restart} title="restart">
            ↻
          </button>
        )}
        <button onClick={onClose} title="close">
          ✕
        </button>
      </div>
    </div>
  )
}
