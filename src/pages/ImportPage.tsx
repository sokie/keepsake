import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { ChatMeta } from '../../shared/types'
import { api, ZipImportResult, ArchiveScanResult } from '../lib/api'

function TargetSelect({
  chats,
  value,
  onChange,
}: {
  chats: ChatMeta[]
  value: string
  onChange: (v: string) => void
}) {
  if (chats.length === 0) return null
  return (
    <div className="formrow">
      <label className="label">Add into</label>
      <select className="field" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">New chat (auto-detected)</option>
        {chats.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} — {c.messageCount.toLocaleString()} messages
          </option>
        ))}
      </select>
    </div>
  )
}

function ImportedCallout({
  chat,
  added,
  merged,
  mediaLocated,
  mediaReferenced,
}: {
  chat: ChatMeta
  added?: number
  merged?: number
  mediaLocated?: number
  mediaReferenced?: number
}) {
  return (
    <div className="callout ok">
      ✓ Imported into <b>{chat.name}</b> — {(added ?? 0).toLocaleString()} new message{added === 1 ? '' : 's'}
      {merged ? `, ${merged.toLocaleString()} already known (merged)` : ''}
      {mediaReferenced
        ? ` · ${(mediaLocated ?? 0).toLocaleString()}/${mediaReferenced.toLocaleString()} media files attached`
        : ''}
      . <Link to={`/chat/${chat.id}`}>Open the archive →</Link>
    </div>
  )
}

export default function ImportPage() {
  const [chats, setChats] = useState<ChatMeta[]>([])
  useEffect(() => {
    api.chats().then(setChats).catch(() => {})
  }, [])

  // ————— export-zip panel state —————
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [zipTarget, setZipTarget] = useState('')
  const [needsMe, setNeedsMe] = useState<string[] | null>(null)
  const [me, setMe] = useState('')
  const [zipBusy, setZipBusy] = useState(false)
  const [zipError, setZipError] = useState('')
  const [zipDone, setZipDone] = useState<ZipImportResult | null>(null)

  const submitZip = async (f: File, meName?: string) => {
    setZipBusy(true)
    setZipError('')
    setZipDone(null)
    try {
      const res = await api.importZip(f, { me: meName, targetChatId: zipTarget || undefined })
      if (res.needsMe) {
        setNeedsMe(res.participants ?? [])
        if ((res.participants?.length ?? 0) > 0) setMe(res.participants![0])
      } else {
        setNeedsMe(null)
        setZipDone(res)
        api.chats().then(setChats).catch(() => {})
      }
    } catch (e) {
      setZipError((e as Error).message)
    } finally {
      setZipBusy(false)
    }
  }

  const pickFile = (f: File | null) => {
    if (!f) return
    setFile(f)
    setNeedsMe(null)
    setZipDone(null)
    submitZip(f)
  }

  // ————— full-archive (msgstore dump / wts json) panel state —————
  const [wtsPath, setWtsPath] = useState('')
  const [wtsKind, setWtsKind] = useState<'msgstore' | 'wts' | undefined>(undefined)
  const [wtsChats, setWtsChats] = useState<ArchiveScanResult['chats']>(undefined)
  const [wtsJid, setWtsJid] = useState('')
  const [wtsMe, setWtsMe] = useState('Me')
  const [wtsTarget, setWtsTarget] = useState('')
  const [wtsBusy, setWtsBusy] = useState(false)
  const [wtsError, setWtsError] = useState('')
  const [wtsDone, setWtsDone] = useState<ArchiveScanResult | null>(null)

  const scanWts = async () => {
    setWtsBusy(true)
    setWtsError('')
    setWtsDone(null)
    setWtsChats(undefined)
    try {
      const res = await api.archive({ path: wtsPath.trim() })
      setWtsKind(res.kind)
      setWtsChats(res.chats ?? [])
      if (res.chats?.length) setWtsJid(res.chats[0].jid)
    } catch (e) {
      setWtsError((e as Error).message)
    } finally {
      setWtsBusy(false)
    }
  }

  const importWts = async () => {
    setWtsBusy(true)
    setWtsError('')
    try {
      const res = await api.archive({ path: wtsPath.trim(), jid: wtsJid, me: wtsMe.trim() || 'Me', targetChatId: wtsTarget || undefined })
      setWtsDone(res)
      api.chats().then(setChats).catch(() => {})
    } catch (e) {
      setWtsError((e as Error).message)
    } finally {
      setWtsBusy(false)
    }
  }

  return (
    <div className="page fade-in">
      <h1 className="page-title">
        Bring a conversation <span className="fancy">home</span>
      </h1>
      <p className="page-sub">Everything stays on this Mac — nothing is uploaded anywhere.</p>

      <div className="import-grid">
        {/* ————— official export ————— */}
        <section className="panel">
          <h2>📱 From your phone</h2>
          <p className="hint">The quick way — covers the most recent ~40,000 messages (~10,000 with media).</p>
          <ul className="steps">
            <li>
              <span className="n">1</span>
              <span>
                On Android, open the chat → <b>⋮ menu → More → Export chat</b>
              </span>
            </li>
            <li>
              <span className="n">2</span>
              <span>
                Choose <b>Include media</b> (photos, stickers &amp; GIFs come along)
              </span>
            </li>
            <li>
              <span className="n">3</span>
              <span>
                Send the .zip to this Mac (Quick Share / Drive / cable) and drop it below
              </span>
            </li>
          </ul>

          <div
            className={`dropzone${dragOver ? ' over' : ''}`}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              pickFile(e.dataTransfer.files?.[0] ?? null)
            }}
          >
            {file ? (
              <>
                📦 <b>{file.name}</b> — drop another to replace
              </>
            ) : (
              <>Drop the exported .zip (or .txt) here, or click to choose</>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".zip,.txt"
              hidden
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
          </div>

          <TargetSelect chats={chats} value={zipTarget} onChange={setZipTarget} />

          {needsMe && (
            <div>
              <div className="callout">One more thing — which of these is <b>you</b>?</div>
              <div className="picker">
                {needsMe.map((p) => (
                  <label key={p}>
                    <input type="radio" name="me" checked={me === p} onChange={() => setMe(p)} />
                    {p}
                  </label>
                ))}
              </div>
              <div className="inline-actions">
                <button className="btn rose" disabled={zipBusy || !me} onClick={() => file && submitZip(file, me)}>
                  {zipBusy ? <span className="spin" /> : null} Continue import
                </button>
              </div>
            </div>
          )}

          {zipBusy && !needsMe && (
            <div className="callout">
              <span className="spin" /> Importing…
            </div>
          )}
          {zipError && <div className="callout err">{zipError}</div>}
          {zipDone?.chat && <ImportedCallout chat={zipDone.chat} added={zipDone.added} merged={zipDone.merged} />}
        </section>

        {/* ————— full archive (wabdd dump, read natively) ————— */}
        <section className="panel">
          <h2>🗝️ Complete archive</h2>
          <p className="hint">
            For advanced users: the <b>whole history</b> — beyond the export caps, <b>with ❤️ reactions</b> — read
            directly from a Google Drive backup dump made with{' '}
            <a href="https://github.com/giacomoferretti/whatsapp-backup-downloader-decryptor" target="_blank" rel="noreferrer">
              wabdd
            </a>
            . No phone cable needed.
          </p>

          <details className="guide">
            <summary>How to produce the dump (Android + Google Drive, one-time)</summary>
            <ul className="steps">
              <li>
                <span className="n">1</span>
                <span>
                  Phone: WhatsApp → Settings → Chats → Chat backup → <b>End-to-end encrypted backup</b> → on →{' '}
                  <b>Use 64-digit encryption key</b> → save the key, then <b>Back up</b> (to Google Drive)
                </span>
              </li>
              <li>
                <span className="n">2</span>
                <span>
                  Mac: <code>pipx install wabdd</code>, then <code>wabdd token YOUR@GMAIL.ADDRESS</code> and follow its
                  cookie instructions
                </span>
              </li>
              <li>
                <span className="n">3</span>
                <span>
                  <code>wabdd download --token-file tokens/…_token.txt</code> then{' '}
                  <code>wabdd decrypt --key-file keys/…_decryption.key dump backups/PHONE_DATE</code>
                </span>
              </li>
              <li>
                <span className="n">4</span>
                <span>
                  Paste the dump folder below — either <code>…/PHONE_DATE</code> or the <code>…-decrypted</code> sibling;
                  both are searched for the database and media
                </span>
              </li>
            </ul>
          </details>

          <div className="formrow">
            <label className="label">Path to backup dump (or wtsexporter result.json)</label>
            <input
              className="field"
              placeholder="~/backups/PHONE_DATE"
              value={wtsPath}
              onChange={(e) => setWtsPath(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && wtsPath.trim() && scanWts()}
            />
          </div>
          <div className="inline-actions">
            <button className="btn" disabled={wtsBusy || !wtsPath.trim()} onClick={scanWts}>
              {wtsBusy && !wtsChats ? <span className="spin" /> : '🔍'} Scan
            </button>
          </div>

          {wtsChats && wtsChats.length === 0 && <div className="callout err">No chats found at that path.</div>}
          {wtsChats && wtsChats.length > 0 && (
            <>
              <div className="callout">
                {wtsKind === 'msgstore'
                  ? '🗄️ Found msgstore.db — reading the database directly.'
                  : '📜 Found a wtsexporter result.json.'}{' '}
                Pick the conversation:
              </div>
              <div className="picker" style={{ maxHeight: 220, overflowY: 'auto' }}>
                {wtsChats.slice(0, 20).map((c) => (
                  <label key={c.jid}>
                    <input type="radio" name="wtsjid" checked={wtsJid === c.jid} onChange={() => setWtsJid(c.jid)} />
                    {c.name}
                    <span className="cnt">{c.count.toLocaleString()} msgs</span>
                  </label>
                ))}
              </div>
              <div className="formrow">
                <label className="label">Your display name</label>
                <input className="field" value={wtsMe} onChange={(e) => setWtsMe(e.target.value)} />
              </div>
              <TargetSelect chats={chats} value={wtsTarget} onChange={setWtsTarget} />
              <div className="inline-actions">
                <button className="btn rose" disabled={wtsBusy || !wtsJid} onClick={importWts}>
                  {wtsBusy ? <span className="spin" /> : '💌'} Import this chat
                </button>
              </div>
            </>
          )}
          {wtsError && <div className="callout err">{wtsError}</div>}
          {wtsDone?.chat && (
            <ImportedCallout
              chat={wtsDone.chat}
              added={wtsDone.added}
              merged={wtsDone.merged}
              mediaLocated={wtsDone.mediaLocated}
              mediaReferenced={wtsDone.mediaReferenced}
            />
          )}
        </section>
      </div>

      <div className="callout" style={{ maxWidth: 720, marginTop: 30 }}>
        💡 Import the same chat again any time — new messages are added, duplicates merge automatically. If you import
        both a phone export <i>and</i> the complete archive, pick the existing chat under “Add into” so they merge into
        one timeline.
      </div>
    </div>
  )
}
