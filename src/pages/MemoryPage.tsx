import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { Memory } from '../../shared/types'
import { api } from '../lib/api'
import { fmtDay, fmtRange } from '../lib/format'
import { MemoryCanvas } from '../components/MemoryCanvas'
import { SaveMemoryDialog } from '../components/SaveMemoryDialog'
import { Replay } from '../components/Replay'
import { exportMemoryPng } from '../lib/exportPng'

export default function MemoryPage() {
  const { memoryId = '' } = useParams()
  const navigate = useNavigate()
  const pngNode = useRef<HTMLDivElement>(null)

  const [memory, setMemory] = useState<Memory | null>(null)
  const [error, setError] = useState('')
  const [replaying, setReplaying] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editBusy, setEditBusy] = useState(false)
  const [pngBusy, setPngBusy] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    api.memory(memoryId).then(setMemory).catch((e) => setError(e.message))
  }, [memoryId])

  const mediaBase = `/api/memory-media/${memoryId}`

  const downloadPng = async () => {
    if (!pngNode.current || !memory) return
    setPngBusy(true)
    setNotice('')
    try {
      const { scaled } = await exportMemoryPng(pngNode.current, memory.id, memory.title)
      setNotice(
        scaled
          ? 'PNG saved — this memory is very long, so it was exported at standard resolution instead of retina.'
          : 'PNG saved to your Downloads (and archived beside the memory).',
      )
    } catch (e) {
      setNotice(`PNG export failed: ${(e as Error).message}`)
    } finally {
      setPngBusy(false)
    }
  }

  const saveEdit = async (fields: { title: string; note?: string; tags: string[] }) => {
    setEditBusy(true)
    try {
      const updated = await api.patchMemory(memoryId, fields)
      setMemory(updated)
      setEditing(false)
    } finally {
      setEditBusy(false)
    }
  }

  const remove = async () => {
    if (!memory) return
    if (window.confirm(`Delete the memory “${memory.title}”?\nIt moves to the trash folder and is recoverable for 30 days.`)) {
      await api.deleteMemory(memoryId)
      navigate('/')
    }
  }

  if (error)
    return (
      <div className="page">
        <div className="callout err">{error}</div>
      </div>
    )
  if (!memory)
    return (
      <div className="page" style={{ textAlign: 'center', paddingTop: '18vh' }}>
        <span className="spin" />
      </div>
    )

  return (
    <div className="page fade-in">
      <div className="mem-wrap">
        <Link to="/" className="backlink">
          ← memory book
        </Link>

        <div className="mem-actions" style={{ marginTop: 18 }}>
          <button className="btn rose" onClick={() => setReplaying(true)}>
            ▶ Replay
          </button>
          <button className="btn" onClick={downloadPng} disabled={pngBusy}>
            {pngBusy ? <span className="spin" /> : '📸'} Tall screenshot
          </button>
          <a className="btn" href={`/api/memories/${memoryId}/replay.html?download`}>
            💾 Replay .html
          </a>
          <a className="btn" href={`/api/memories/${memoryId}/page.html?download`}>
            📄 Page .html
          </a>
          <button className="btn ghost" onClick={() => setEditing(true)}>
            ✎ Edit
          </button>
          <button className="btn danger" onClick={remove}>
            Delete
          </button>
        </div>

        {notice && <div className="callout ok" style={{ marginBottom: 18 }}>{notice}</div>}

        <MemoryCanvas ref={pngNode} memory={memory} mediaBase={mediaBase} />

        <div className="mem-foot">kept on {fmtDay(new Date(memory.createdAt).getTime())} 💌</div>
      </div>

      {replaying && <Replay memory={memory} mediaBase={mediaBase} onClose={() => setReplaying(false)} />}

      {editing && (
        <SaveMemoryDialog
          heading="Edit memory"
          sub={`${memory.count} messages · ${fmtRange(memory.startTs, memory.endTs)}`}
          saveLabel="Save changes"
          busy={editBusy}
          initial={{ title: memory.title, note: memory.note, tags: memory.tags }}
          onCancel={() => setEditing(false)}
          onSave={saveEdit}
        />
      )}
    </div>
  )
}
