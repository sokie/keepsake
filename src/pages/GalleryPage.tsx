import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { MemoryMeta } from '../../shared/types'
import { api } from '../lib/api'
import { fmtRange } from '../lib/format'

export default function GalleryPage() {
  const [memories, setMemories] = useState<MemoryMeta[] | null>(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set())

  useEffect(() => {
    api.memories().then(setMemories).catch((e) => setError(e.message))
  }, [])

  const allTags = useMemo(() => {
    const s = new Set<string>()
    memories?.forEach((m) => m.tags.forEach((t) => s.add(t)))
    return [...s].sort()
  }, [memories])

  const shown = useMemo(() => {
    if (!memories) return []
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    return memories.filter((m) => {
      if (activeTags.size > 0 && ![...activeTags].every((t) => m.tags.includes(t))) return false
      if (q.trim() && !norm(`${m.title} ${m.teaser ?? ''} ${m.note ?? ''}`).includes(norm(q))) return false
      return true
    })
  }, [memories, q, activeTags])

  const toggleTag = (t: string) =>
    setActiveTags((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })

  if (error) return <div className="page"><div className="callout err">{error}</div></div>
  if (!memories)
    return (
      <div className="page" style={{ textAlign: 'center', paddingTop: '18vh' }}>
        <span className="spin" />
      </div>
    )

  if (memories.length === 0) {
    return (
      <div className="page">
        <div className="letter fade-in">
          <div className="big">💌</div>
          <h2>No memories yet</h2>
          <p>
            Import a conversation, scroll to a moment you never want to lose,
            <br />
            and press it between these pages.
          </p>
          <Link to="/import" className="btn rose">
            Import a conversation
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="page fade-in">
      <h1 className="page-title">
        Our <span className="fancy">memory book</span>
      </h1>
      <p className="page-sub">
        {memories.length} kept {memories.length === 1 ? 'moment' : 'moments'}
      </p>

      {(allTags.length > 0 || memories.length > 3) && (
        <div className="filterbar">
          <input className="field" placeholder="Search titles & first lines…" value={q} onChange={(e) => setQ(e.target.value)} />
          {allTags.map((t) => (
            <button key={t} className={`tag clickable${activeTags.has(t) ? ' on' : ''}`} onClick={() => toggleTag(t)}>
              {t}
            </button>
          ))}
        </div>
      )}

      <div className="mem-grid">
        {shown.map((m, i) => (
          <Link
            key={m.id}
            to={`/memory/${m.id}`}
            className="mem-card"
            style={{ ['--tilt' as string]: `${(((i % 5) - 2) * 0.7).toFixed(1)}deg` }}
          >
            <div className="seal">{m.sealEmoji}</div>
            <span className="ticket">{fmtRange(m.startTs, m.endTs)}</span>
            <h3>{m.title}</h3>
            {m.teaser && <p className="teaser">{m.teaser}</p>}
            {m.tags.length > 0 && (
              <div className="tagrow">
                {m.tags.map((t) => (
                  <span key={t} className="tag">
                    {t}
                  </span>
                ))}
              </div>
            )}
            <div className="foot">
              <span>with {m.chatName}</span>
              <span>{m.count} messages</span>
            </div>
          </Link>
        ))}
      </div>
      {shown.length === 0 && <p className="page-sub" style={{ marginTop: 40 }}>Nothing matches that filter.</p>}
    </div>
  )
}
