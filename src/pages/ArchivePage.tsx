import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { ChatMeta } from '../../shared/types'
import { api } from '../lib/api'
import { fmtDayShort } from '../lib/format'

export default function ArchivePage() {
  const [chats, setChats] = useState<ChatMeta[] | null>(null)
  const [error, setError] = useState('')

  const reload = () => api.chats().then(setChats).catch((e) => setError(e.message))
  useEffect(() => {
    reload()
  }, [])

  const rename = async (chat: ChatMeta) => {
    const name = window.prompt('Display name for this chat:', chat.name)
    if (name?.trim() && name.trim() !== chat.name) {
      await api.renameChat(chat.id, name.trim())
      reload()
    }
  }

  const remove = async (chat: ChatMeta) => {
    if (window.confirm(`Delete the imported archive “${chat.name}” (${chat.messageCount} messages)?\nSaved memories are self-contained and will NOT be deleted. The archive moves to the trash folder, recoverable for 30 days.`)) {
      await api.deleteChat(chat.id)
      reload()
    }
  }

  return (
    <div className="page fade-in">
      <h1 className="page-title">
        The <span className="fancy">archive</span>
      </h1>
      <p className="page-sub">Every imported conversation, merged across its sources.</p>

      {error && <div className="callout err">{error}</div>}

      {chats && chats.length === 0 && (
        <div className="letter">
          <div className="big">🗄️</div>
          <h2>Nothing imported yet</h2>
          <p>Export a chat from your phone and bring it in.</p>
          <Link to="/import" className="btn rose">
            Import a conversation
          </Link>
        </div>
      )}

      <div className="chat-list">
        {chats?.map((c) => (
          <div key={c.id} className="chat-item">
            <div className="avatar">{c.name.slice(0, 1).toUpperCase()}</div>
            <div className="grow">
              <h3>{c.name}</h3>
              <div className="meta">
                {c.messageCount.toLocaleString()} messages
                {c.firstTs && c.lastTs ? ` · ${fmtDayShort(c.firstTs)} → ${fmtDayShort(c.lastTs)}` : ''}
                {' · '}
                {c.sources.length} import{c.sources.length === 1 ? '' : 's'}
                {c.sources.some((s) => s.type === 'wts') ? ' (incl. full archive)' : ''}
              </div>
            </div>
            <div className="actions">
              <Link to={`/chat/${c.id}`} className="btn small">
                Open
              </Link>
              {c.messageCount <= 25000 ? (
                <a className="btn small ghost" href={`/api/chats/${c.id}/page.html?download`}>
                  Page .html
                </a>
              ) : (
                <button
                  className="btn small ghost"
                  disabled
                  style={{ opacity: 0.45, cursor: 'not-allowed' }}
                  title={`${c.messageCount.toLocaleString()} messages — a single HTML page stops scrolling around 25,000. Save moments as memories instead.`}
                >
                  Page .html
                </button>
              )}
              <button className="btn small ghost" onClick={() => rename(c)}>
                Rename
              </button>
              <button className="btn small danger" onClick={() => remove(c)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
