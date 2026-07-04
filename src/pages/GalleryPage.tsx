import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import JSZip from 'jszip'
import type { Memory, MemoryMeta } from '../../shared/types'
import { api } from '../lib/api'
import { fmtRange } from '../lib/format'
import { MemoryCanvas } from '../components/MemoryCanvas'
import { captureNodePng } from '../lib/exportPng'

export default function GalleryPage() {
  const [memories, setMemories] = useState<MemoryMeta[] | null>(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set())
  const [bulkMode, setBulkMode] = useState<'replay' | 'page' | 'png'>('page')
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null)
  const [renderMemory, setRenderMemory] = useState<Memory | null>(null)
  const renderRef = useRef<HTMLDivElement>(null)

  // "fake" bulk PNG: mount each memory off-screen, capture with the same
  // pipeline as the single-memory button, collect everything into one zip
  const bulkPng = async () => {
    if (!memories?.length || bulkProgress) return
    const zip = new JSZip()
    setBulkProgress({ done: 0, total: memories.length })
    let failed = 0
    try {
      for (let i = 0; i < memories.length; i++) {
        try {
          const mem = await api.memory(memories[i].id)
          setRenderMemory(mem)
          // wait for React to commit and the eager media to decode
          for (let t = 0; t < 100 && !renderRef.current; t++) await new Promise((r) => setTimeout(r, 20))
          const node = renderRef.current
          if (!node) throw new Error('render container missing')
          await Promise.all(
            [...node.querySelectorAll('img')].map((im) => (im.decode ? im.decode().catch(() => {}) : Promise.resolve())),
          )
          await new Promise((r) => setTimeout(r, 50))
          const { dataUrl } = await captureNodePng(node)
          zip.file(`${mem.id}.png`, dataUrl.split(',')[1], { base64: true })
          api.uploadPng(mem.id, dataUrl).catch(() => {})
        } catch (e) {
          console.error('bulk png: failed to render', memories[i].id, e)
          failed++
        } finally {
          setRenderMemory(null)
          setBulkProgress({ done: i + 1, total: memories.length })
        }
      }
      const blob = await zip.generateAsync({ type: 'blob' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'keepsake-memories-png.zip'
      a.click()
      window.setTimeout(() => URL.revokeObjectURL(a.href), 60000)
    } finally {
      setBulkProgress(null)
      setRenderMemory(null)
    }
    if (failed) window.alert(`${failed} memor${failed === 1 ? 'y' : 'ies'} failed to render — the rest are in the zip.`)
  }

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

      <div className="filterbar">
        {(allTags.length > 0 || memories.length > 3) && (
          <>
            <input className="field" placeholder="Search titles & first lines…" value={q} onChange={(e) => setQ(e.target.value)} />
            {allTags.map((t) => (
              <button key={t} className={`tag clickable${activeTags.has(t) ? ' on' : ''}`} onClick={() => toggleTag(t)}>
                {t}
              </button>
            ))}
          </>
        )}
        <div className="savebar">
          <select
            className="field"
            value={bulkMode}
            onChange={(e) => setBulkMode(e.target.value as 'replay' | 'page' | 'png')}
            title="format for all memories"
            disabled={!!bulkProgress}
          >
            <option value="page">Page .html</option>
            <option value="replay">Replay .html</option>
            <option value="png">Tall PNG</option>
          </select>
          {bulkMode === 'png' ? (
            <button className="btn" onClick={bulkPng} disabled={!!bulkProgress}>
              {bulkProgress ? (
                <>
                  <span className="spin" /> Rendering {bulkProgress.done}/{bulkProgress.total}…
                </>
              ) : (
                <>⬇ Save all ({memories.length})</>
              )}
            </button>
          ) : (
            <a className="btn" href={`/api/memories/export.zip?mode=${bulkMode}`}>
              ⬇ Save all ({memories.length})
            </a>
          )}
        </div>
      </div>

      {renderMemory && (
        <div key={renderMemory.id} style={{ position: 'fixed', left: -20000, top: 0, width: 640 }} aria-hidden>
          <MemoryCanvas ref={renderRef} memory={renderMemory} mediaBase={`/api/memory-media/${renderMemory.id}`} eager />
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
