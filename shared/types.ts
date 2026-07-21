export type MediaType =
  | 'image'
  | 'video'
  | 'gif'
  | 'sticker'
  | 'audio'
  | 'voice'
  | 'document'
  | 'unknown'

export interface Media {
  /** filename inside the chat's media/ folder; absent when the file wasn't in the import */
  file?: string
  type: MediaType
  originalName?: string
  missing?: boolean
}

export interface Reaction {
  emoji: string
  count: number
  from?: string[]
}

/**
 * A snapshot of the message this one replied to. Stored inline (not a
 * reference) because a memory freezes a slice — the quoted original may well
 * sit outside it — and because export .txt never carries reply context, so
 * the snapshot is all we ever have.
 */
export interface QuotedMsg {
  sender: string
  fromMe: boolean
  text?: string
  /** set when the quoted message was media rather than text */
  mediaType?: MediaType
}

export interface Msg {
  id: string
  /** epoch milliseconds */
  ts: number
  sender: string
  fromMe: boolean
  system?: boolean
  text?: string
  media?: Media
  reactions?: Reaction[]
  edited?: boolean
  quoted?: QuotedMsg
  source: 'export' | 'wts' | 'msgstore'
}

export interface ImportSource {
  type: 'export' | 'wts' | 'msgstore'
  importedAt: string
  file?: string
  added: number
  merged: number
}

export interface ChatMeta {
  id: string
  /** the other person's name — the chat's display name */
  name: string
  /** the author name that counts as "me" */
  me: string
  participants: string[]
  messageCount: number
  firstTs?: number
  lastTs?: number
  sources: ImportSource[]
}

export interface MemoryMeta {
  id: string
  chatId: string
  chatName: string
  title: string
  note?: string
  tags: string[]
  createdAt: string
  startTs: number
  endTs: number
  count: number
  /** dominant emoji of the slice — the wax seal */
  sealEmoji: string
  hasPng?: boolean
  /** first line of the memory, for gallery cards */
  teaser?: string
}

export interface Memory extends MemoryMeta {
  /** frozen, self-contained copy of the selected messages */
  messages: Msg[]
}
