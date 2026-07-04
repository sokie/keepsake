import { FormEvent, useState } from 'react'

export interface MemoryFields {
  title: string
  note?: string
  tags: string[]
}

interface Props {
  heading: string
  sub: string
  initial?: Partial<MemoryFields>
  saveLabel: string
  busy?: boolean
  error?: string
  onCancel: () => void
  onSave: (fields: MemoryFields) => void
}

export function SaveMemoryDialog({ heading, sub, initial, saveLabel, busy, error, onCancel, onSave }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [tags, setTags] = useState((initial?.tags ?? []).join(', '))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    onSave({
      title: title.trim(),
      note: note.trim() || undefined,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    })
  }

  return (
    <div className="modal-back" onClick={onCancel}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>{heading}</h2>
        <div className="sub">{sub}</div>
        <div className="formrow">
          <label className="label" htmlFor="mem-title">
            Title
          </label>
          <input
            id="mem-title"
            className="field"
            autoFocus
            placeholder="the night we planned the trip 🌙"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="formrow">
          <label className="label" htmlFor="mem-note">
            Note <span style={{ opacity: 0.6, textTransform: 'none', letterSpacing: 0 }}>(optional — why it matters)</span>
          </label>
          <textarea id="mem-note" className="field" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="formrow">
          <label className="label" htmlFor="mem-tags">
            Tags <span style={{ opacity: 0.6, textTransform: 'none', letterSpacing: 0 }}>(comma separated)</span>
          </label>
          <input id="mem-tags" className="field" placeholder="silly, anniversary" value={tags} onChange={(e) => setTags(e.target.value)} />
        </div>
        {error && <div className="callout err">{error}</div>}
        <div className="inline-actions">
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn rose" disabled={busy || !title.trim()}>
            {busy ? <span className="spin" /> : '💌'} {saveLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
