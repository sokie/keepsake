import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso'
import type { ChatMeta, Msg } from '../../shared/types'
import { api } from '../lib/api'
import { fmtDay, fmtDayShort, fmtRange } from '../lib/format'
import { MessageRow } from '../components/MessageBubble'
import { SaveMemoryDialog } from '../components/SaveMemoryDialog'

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * Browsers cap an element's height (and scrollTop) around 33.5M pixels —
 * a years-long chat overflows that and the list silently stops scrolling.
 * So only a sliding window of messages is mounted; scrolling near an edge
 * extends it (Virtuoso's firstItemIndex keeps the scroll anchored), and
 * far jumps recenter the window and remount.
 */
const WINDOW = 30_000
const EXTEND = 10_000
const MAX_MOUNTED = 60_000

interface Win {
  start: number
  end: number
  epoch: number
}

export default function ChatPage() {
  const { chatId = '' } = useParams()
  const virtuoso = useRef<VirtuosoHandle>(null)

  const [chat, setChat] = useState<ChatMeta | null>(null)
  const [msgs, setMsgs] = useState<Msg[] | null>(null)
  const [error, setError] = useState('')
  const [win, setWin] = useState<Win | null>(null)
  const pendingFocus = useRef<{ local: number; align: 'start' | 'center' | 'end' } | null>(null)

  const [anchorId, setAnchorId] = useState<string | null>(null)
  const [endId, setEndId] = useState<string | null>(null)
  const [showSave, setShowSave] = useState(false)
  const [saveBusy, setSaveBusy] = useState(false)
  const [saveError, setSaveError] = useState('')
  // saving must never navigate away — search, scroll and selection context stay
  const [savedToast, setSavedToast] = useState<{ id: string; title: string } | null>(null)
  const toastTimer = useRef(0)

  const [q, setQ] = useState('')
  const [pos, setPos] = useState(0)
  const [flashId, setFlashId] = useState<string | null>(null)
  const flashTimer = useRef<number>(0)

  // floating "you are here" date chip, WhatsApp-style
  const surfaceRef = useRef<HTMLDivElement>(null)
  const scrollerEl = useRef<HTMLElement | null>(null)
  const winRef = useRef<Win | null>(null)
  const msgsRef = useRef<Msg[] | null>(null)
  const dayRaf = useRef(0)
  const dayIdleTimer = useRef(0)
  const [floatDay, setFloatDay] = useState('')
  const [floatShow, setFloatShow] = useState(false)

  useEffect(() => {
    winRef.current = win
  }, [win])
  useEffect(() => {
    msgsRef.current = msgs
  }, [msgs])

  const onScroll = useCallback(() => {
    window.cancelAnimationFrame(dayRaf.current)
    dayRaf.current = window.requestAnimationFrame(() => {
      const surface = surfaceRef.current
      const m = msgsRef.current
      const w = winRef.current
      if (!surface || !m || !w) return
      // whichever message row physically sits just under the top edge is
      // "where you are" — immune to windowing and virtualization details
      const rect = surface.getBoundingClientRect()
      const probe = document.elementFromPoint(rect.left + rect.width / 2, rect.top + 28)
      const item = probe instanceof Element ? (probe.closest('[data-index]') as HTMLElement | null) : null
      if (!item) return
      const msg = m[w.start + Number(item.dataset.index)]
      if (msg) setFloatDay(fmtDay(msg.ts))
    })
    setFloatShow(true)
    window.clearTimeout(dayIdleTimer.current)
    dayIdleTimer.current = window.setTimeout(() => setFloatShow(false), 1300)
  }, [])

  const attachScroller = useCallback(
    (el: HTMLElement | Window | null) => {
      scrollerEl.current?.removeEventListener('scroll', onScroll)
      scrollerEl.current = el instanceof HTMLElement ? el : null
      scrollerEl.current?.addEventListener('scroll', onScroll, { passive: true })
    },
    [onScroll],
  )

  useEffect(
    () => () => {
      scrollerEl.current?.removeEventListener('scroll', onScroll)
      window.cancelAnimationFrame(dayRaf.current)
      window.clearTimeout(dayIdleTimer.current)
    },
    [onScroll],
  )

  useEffect(() => {
    api.chat(chatId).then(setChat).catch((e) => setError(e.message))
    api.messages(chatId).then(setMsgs).catch((e) => setError(e.message))
  }, [chatId])

  // open at the most recent messages, like WhatsApp
  useEffect(() => {
    if (msgs) {
      pendingFocus.current = null
      setWin({ start: Math.max(0, msgs.length - WINDOW), end: msgs.length, epoch: 0 })
    }
  }, [msgs])

  const idx = useMemo(() => {
    const m = new Map<string, number>()
    msgs?.forEach((x, i) => m.set(x.id, i))
    return m
  }, [msgs])

  const winMsgs = useMemo(() => (msgs && win ? msgs.slice(win.start, win.end) : null), [msgs, win])

  const [lo, hi] = useMemo(() => {
    if (!anchorId) return [-1, -1]
    const a = idx.get(anchorId) ?? -1
    if (a === -1) return [-1, -1]
    if (!endId) return [a, a]
    const b = idx.get(endId) ?? a
    return a <= b ? [a, b] : [b, a]
  }, [anchorId, endId, idx])

  const matches = useMemo(() => {
    if (!msgs || !q.trim()) return []
    const nq = norm(q)
    const out: number[] = []
    msgs.forEach((m, i) => {
      if (m.text && norm(m.text).includes(nq)) out.push(i)
    })
    return out
  }, [msgs, q])

  useEffect(() => setPos(0), [q])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showSave) {
        setAnchorId(null)
        setEndId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showSave])

  const flash = (globalIndex: number) => {
    if (!msgs) return
    setFlashId(msgs[globalIndex].id)
    window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setFlashId(null), 1700)
  }

  /** scroll to a global message index, recentering the window if needed */
  const jumpTo = useCallback(
    (t: number, align: 'start' | 'center' = 'center') => {
      if (!msgs || !win) return
      if (t >= win.start && t < win.end) {
        virtuoso.current?.scrollToIndex({ index: t - win.start, align })
      } else {
        const start = Math.max(0, Math.min(t - Math.floor(WINDOW / 2), msgs.length - WINDOW))
        const end = Math.min(msgs.length, start + WINDOW)
        pendingFocus.current = { local: t - start, align }
        setWin({ start, end, epoch: win.epoch + 1 })
      }
      flash(t)
    },
    [msgs, win], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const extendUp = useCallback(() => {
    setWin((w) => {
      if (!w || w.start === 0) return w
      const start = Math.max(0, w.start - EXTEND)
      const end = w.end - start > MAX_MOUNTED ? start + MAX_MOUNTED : w.end
      return { start, end, epoch: w.epoch }
    })
  }, [])

  const extendDown = useCallback(() => {
    setWin((w) => {
      if (!w || !msgs || w.end >= msgs.length) return w
      const end = Math.min(msgs.length, w.end + EXTEND)
      const start = end - w.start > MAX_MOUNTED ? end - MAX_MOUNTED : w.start
      return { start, end, epoch: w.epoch }
    })
  }, [msgs])

  const jumpToMatch = (dir: 1 | -1) => {
    if (matches.length === 0) return
    const next = (pos + dir + matches.length) % matches.length
    setPos(next)
    jumpTo(matches[next])
  }

  const jumpToDate = (value: string) => {
    if (!msgs || !value) return
    const target = new Date(value).getTime()
    let i = msgs.findIndex((m) => m.ts >= target)
    if (i === -1) i = msgs.length - 1
    jumpTo(i, 'start')
  }

  const handleSelect = (id: string) => {
    setSaveError('')
    if (!anchorId) return setAnchorId(id)
    if (!endId) {
      if (id === anchorId) return setAnchorId(null)
      return setEndId(id)
    }
    setAnchorId(id)
    setEndId(null)
  }

  const saveMemory = async (fields: { title: string; note?: string; tags: string[] }) => {
    if (!msgs || lo === -1) return
    setSaveBusy(true)
    setSaveError('')
    try {
      const memory = await api.createMemory({
        chatId,
        startId: msgs[lo].id,
        endId: msgs[hi].id,
        ...fields,
      })
      setShowSave(false)
      setAnchorId(null)
      setEndId(null)
      setSavedToast({ id: memory.id, title: memory.title })
      window.clearTimeout(toastTimer.current)
      toastTimer.current = window.setTimeout(() => setSavedToast(null), 8000)
    } catch (e) {
      setSaveError((e as Error).message)
    } finally {
      setSaveBusy(false)
    }
  }

  useEffect(() => () => window.clearTimeout(toastTimer.current), [])

  if (error)
    return (
      <div className="page">
        <div className="callout err">{error}</div>
      </div>
    )
  if (!chat || !msgs || !win || !winMsgs)
    return (
      <div className="page" style={{ textAlign: 'center', paddingTop: '18vh' }}>
        <span className="spin" />
      </div>
    )

  const count = lo === -1 ? 0 : hi - lo + 1
  const hasSelection = lo !== -1
  const initialFocus = pendingFocus.current

  return (
    <div className="chat-screen">
      <div className="chat-toolbar">
        <Link to="/archive" className="backlink">
          ← archive
        </Link>
        <div className="who">
          <h2>{chat.name}</h2>
          <div className="meta">
            {msgs.length.toLocaleString()} messages
            {chat.firstTs && chat.lastTs ? ` · ${fmtDayShort(chat.firstTs)} → ${fmtDayShort(chat.lastTs)}` : ''}
          </div>
        </div>
        <div className="spacer" />
        <input
          className="field"
          placeholder="Search… (Enter jumps)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && jumpToMatch(e.shiftKey ? -1 : 1)}
        />
        {q.trim() && (
          <span className="searchnav">
            <button onClick={() => jumpToMatch(-1)}>↑</button>
            <button onClick={() => jumpToMatch(1)}>↓</button>
            {matches.length ? `${pos + 1}/${matches.length}` : '0'}
          </span>
        )}
        <input type="date" className="field" onChange={(e) => jumpToDate(e.target.value)} title="Jump to date" />
      </div>

      <div className="wa-surface" ref={surfaceRef}>
        <div className={`float-day${floatShow && floatDay ? ' show' : ''}`}>{floatDay}</div>
        <Virtuoso
          key={win.epoch}
          ref={virtuoso}
          scrollerRef={attachScroller}
          style={{ height: '100%' }}
          data={winMsgs}
          firstItemIndex={win.start}
          computeItemKey={(_i, m) => m.id}
          initialTopMostItemIndex={
            initialFocus
              ? { index: initialFocus.local, align: initialFocus.align }
              : { index: winMsgs.length - 1, align: 'end' }
          }
          startReached={extendUp}
          endReached={extendDown}
          increaseViewportBy={{ top: 600, bottom: 600 }}
          itemContent={(_i, m) => {
            const gi = idx.get(m.id) ?? 0
            return (
              <div
                className={[
                  'vrow',
                  hasSelection && gi >= lo && gi <= hi ? 'in-range' : '',
                  flashId === m.id ? 'flash' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <MessageRow
                  m={m}
                  prev={msgs[gi - 1]}
                  mediaBase={`/api/media/${chatId}`}
                  selectable
                  selEdge={hasSelection && (gi === lo || gi === hi)}
                  onSelect={handleSelect}
                />
              </div>
            )
          }}
        />
      </div>

      {savedToast && !hasSelection && !showSave && (
        <div className="selectbar toast-ok">
          <span>
            💌 Saved <b>“{savedToast.title}”</b>
          </span>
          <a className="btn rose small" href={`/memory/${savedToast.id}`} target="_blank" rel="noreferrer">
            Open ↗
          </a>
          <button className="x" onClick={() => setSavedToast(null)}>
            ✕
          </button>
        </div>
      )}

      {hasSelection && !showSave && (
        <div className="selectbar">
          {count === 1 && !endId ? (
            <span>
              First message picked <span className="muted">— now click the last one</span>
            </span>
          ) : (
            <span>
              {count} message{count === 1 ? '' : 's'} <span className="muted">· {fmtRange(msgs[lo].ts, msgs[hi].ts)}</span>
            </span>
          )}
          {endId && (
            <button className="btn rose small" onClick={() => setShowSave(true)}>
              💌 Save memory
            </button>
          )}
          <button
            className="x"
            onClick={() => {
              setAnchorId(null)
              setEndId(null)
            }}
          >
            ✕
          </button>
        </div>
      )}

      {showSave && msgs && lo !== -1 && (
        <SaveMemoryDialog
          heading="Keep this moment"
          sub={`${count} messages · ${fmtRange(msgs[lo].ts, msgs[hi].ts)} · with ${chat.name}`}
          saveLabel="Save memory"
          busy={saveBusy}
          error={saveError}
          onCancel={() => setShowSave(false)}
          onSave={saveMemory}
        />
      )}
    </div>
  )
}
