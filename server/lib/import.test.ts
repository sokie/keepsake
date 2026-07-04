import { describe, it, expect } from 'vitest'
import { parseExportTxt, participantsOf, buildExportMsgs, detectDaysFirst } from './importExport.js'
import { buildWtsMsgs, normalizeReactions } from './importWts.js'
import { mergeMessages } from './normalize.js'
import { dominantEmoji, isEmojiOnly } from '../../shared/emoji.js'

const TXT = [
  '25/12/2024, 09:12 - Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them.',
  '25/12/2024, 09:12 - Maia: Merry Christmas my love! 🎄❤️',
  '25/12/2024, 09:12 - Alex: Merry Christmas! 😍 I left something under the tree 👀',
  '25/12/2024, 09:13 - Maia: NO. What did you do 😂😂',
  '25/12/2024, 09:13 - Maia: if this is another sock joke I swear',
  '25/12/2024, 09:14 - Alex: IMG-20241225-WA0001.jpg (file attached)',
  'open it 🎁',
  '25/12/2024, 09:16 - Maia: AAAAAA',
  '25/12/2024, 09:16 - Maia: ❤️❤️❤️',
  '25/12/2024, 09:17 - Maia: STK-20241225-WA0002.webp (file attached)',
  '25/12/2024, 09:18 - Alex: <Media omitted>',
  '25/12/2024, 09:19 - Alex: VID-20241225-WA0003.mp4 (file attached)',
  '25/12/2024, 09:20 - Maia: i love you so much <This message was edited>',
  '25/12/2024, 21:40 - Alex: today was perfect',
  'thank you for everything',
  '❤️',
  '25/12/2024, 21:41 - Maia: 🥺',
].join('\n')

const at = (h: number, mi: number, s: number) => Math.floor(new Date(2024, 11, 25, h, mi, s).getTime() / 1000)

const WTS_CHAT = {
  name: 'Maia',
  media_base: '',
  messages: {
    1000: { from_me: false, timestamp: Math.floor(new Date(2023, 5, 10, 14, 3, 41).getTime() / 1000), media: false, data: 'our first inside joke 😄' },
    1001: { from_me: false, timestamp: at(9, 12, 5), media: false, data: 'Merry Christmas my love! 🎄❤️', reactions: { '❤️': 1 } },
    1002: { from_me: true, timestamp: at(9, 12, 48), media: false, data: 'Merry Christmas! 😍 I left something under the tree 👀' },
    1003: { from_me: false, timestamp: at(9, 13, 22), media: false, data: 'NO. What did you do 😂😂', reactions: [{ emoji: '😂', sender: 'Alex' }] },
    1004: { from_me: false, timestamp: at(9, 13, 50), media: false, data: 'if this is another sock joke I swear' },
    1005: { from_me: true, timestamp: at(9, 14, 10), media: true, data: 'WhatsApp/Media/WhatsApp Images/IMG-20241225-WA0001.jpg', mime: 'image/jpeg', caption: 'open it 🎁' },
    1006: { from_me: false, timestamp: at(9, 16, 2), media: false, data: 'AAAAAA' },
    1007: { from_me: false, timestamp: at(9, 16, 30), media: false, data: '❤️❤️❤️', reactions: { '❤️': 2 } },
    1008: { from_me: false, timestamp: at(9, 17, 15), media: true, data: 'WhatsApp/Media/WhatsApp Stickers/STK-20241225-WA0002.webp', mime: 'image/webp', sticker: true },
    1009: { from_me: true, timestamp: at(9, 18, 44), media: true, data: 'WhatsApp/Media/WhatsApp Images/IMG-20241225-WA0009.jpg', mime: 'image/jpeg' },
    1010: { from_me: false, timestamp: at(9, 20, 12), media: false, data: 'i love you so much', reactions: { '🥰': 1 } },
  },
}

describe('parseExportTxt', () => {
  const entries = parseExportTxt(TXT)

  it('parses all logical messages', () => {
    expect(entries.length).toBe(14)
  })

  it('flags the system line with a null author', () => {
    expect(entries[0].author).toBeNull()
    expect(entries[0].text).toContain('end-to-end encrypted')
  })

  it('keeps multiline messages together', () => {
    const multi = entries.find((e) => e.text.includes('today was perfect'))
    expect(multi?.text).toContain('thank you for everything')
    expect(multi?.text).toContain('❤️')
  })

  it('finds both participants', () => {
    expect(participantsOf(entries).sort()).toEqual(['Alex', 'Maia'])
  })
})

describe('buildExportMsgs', () => {
  const msgs = buildExportMsgs(parseExportTxt(TXT), 'Alex')

  it('maps fromMe correctly', () => {
    expect(msgs.find((m) => m.text?.includes('under the tree'))?.fromMe).toBe(true)
    expect(msgs.find((m) => m.text === 'AAAAAA')?.fromMe).toBe(false)
  })

  it('splits attachment + caption and types media', () => {
    const img = msgs.find((m) => m.media?.originalName === 'IMG-20241225-WA0001.jpg')
    expect(img?.media?.type).toBe('image')
    expect(img?.text).toBe('open it 🎁')
    expect(img?.media?.missing).toBe(true)
    expect(msgs.find((m) => m.media?.originalName === 'STK-20241225-WA0002.webp')?.media?.type).toBe('sticker')
    expect(msgs.find((m) => m.media?.originalName === 'VID-20241225-WA0003.mp4')?.media?.type).toBe('video')
  })

  it('treats <Media omitted> as unknown missing media', () => {
    const omitted = msgs.filter((m) => m.media?.type === 'unknown')
    expect(omitted.length).toBe(1)
    expect(omitted[0].media?.missing).toBe(true)
  })

  it('strips the edited marker and sets the flag', () => {
    const edited = msgs.find((m) => m.edited)
    expect(edited?.text).toBe('i love you so much')
  })

  it('keeps same-minute messages in file order via 10ms spreading', () => {
    const a = msgs.find((m) => m.text === 'NO. What did you do 😂😂')!
    const b = msgs.find((m) => m.text === 'if this is another sock joke I swear')!
    expect(b.ts - a.ts).toBe(10)
  })

  it('gives every message a unique id', () => {
    expect(new Set(msgs.map((m) => m.id)).size).toBe(msgs.length)
  })
})

describe('buildWtsMsgs', () => {
  const { msgs, mediaRefs } = buildWtsMsgs(WTS_CHAT, 'Alex', 'Maia')

  it('converts timestamps to ms and sorts', () => {
    expect(msgs[0].text).toContain('our first inside joke')
    expect(msgs.every((m, i) => i === 0 || m.ts >= msgs[i - 1].ts)).toBe(true)
  })

  it('normalizes both reaction shapes', () => {
    expect(msgs.find((m) => m.text === '❤️❤️❤️')?.reactions).toEqual([{ emoji: '❤️', count: 2 }])
    expect(msgs.find((m) => m.text === 'NO. What did you do 😂😂')?.reactions).toEqual([
      { emoji: '😂', count: 1, from: ['Alex'] },
    ])
  })

  it('collects media refs and types stickers via the flag', () => {
    expect(mediaRefs.get('STK-20241225-WA0002.webp')).toContain('WhatsApp Stickers')
    expect(msgs.find((m) => m.media?.originalName === 'STK-20241225-WA0002.webp')?.media?.type).toBe('sticker')
  })

  it('names senders', () => {
    expect(msgs.find((m) => m.media?.originalName === 'IMG-20241225-WA0001.jpg')?.sender).toBe('Alex')
    expect(msgs.find((m) => m.text === 'AAAAAA')?.sender).toBe('Maia')
  })
})

describe('mergeMessages (export + wts)', () => {
  const exportMsgs = buildExportMsgs(parseExportTxt(TXT), 'Alex')
  const wtsMsgs = buildWtsMsgs(WTS_CHAT, 'Alex', 'Maia').msgs
  const { messages, added, merged } = mergeMessages(exportMsgs, wtsMsgs)

  it('adds only the wts-only history and merges every overlap', () => {
    expect(added).toBe(1)
    expect(merged).toBe(10)
    expect(messages.length).toBe(exportMsgs.length + 1)
  })

  it('adopts precise wts timestamps over minute-rounded export ones', () => {
    const m = messages.find((m) => m.text === 'NO. What did you do 😂😂')!
    expect(m.ts % 60000).toBe(22000)
  })

  it('attaches reactions to messages that came from the export', () => {
    expect(messages.find((m) => m.text === '❤️❤️❤️')?.reactions?.[0]).toEqual({ emoji: '❤️', count: 2 })
  })

  it('upgrades <Media omitted> to a typed media message', () => {
    const upgraded = messages.filter((m) => m.media && m.fromMe && Math.floor(m.ts / 60000) === Math.floor(new Date(2024, 11, 25, 9, 18).getTime() / 60000))
    expect(upgraded.length).toBe(1)
    expect(upgraded[0].media?.type).toBe('image')
  })

  it('keeps the edited flag when the wts copy has no marker', () => {
    expect(messages.find((m) => m.text === 'i love you so much')?.edited).toBe(true)
  })

  it('is idempotent for both sources', () => {
    const again = mergeMessages(messages, wtsMsgs)
    expect(again.added).toBe(0)
    expect(again.messages.length).toBe(messages.length)
    const exportAgain = mergeMessages(messages, buildExportMsgs(parseExportTxt(TXT), 'Alex'))
    expect(exportAgain.added).toBe(0)
    expect(exportAgain.messages.length).toBe(messages.length)
  })
})

describe('emoji helpers', () => {
  it('finds the dominant emoji', () => {
    expect(dominantEmoji(['love you ❤️', '❤️❤️', 'haha 😂'])).toBe('❤️')
  })
  it('falls back when there are no emoji', () => {
    expect(dominantEmoji(['plain text'])).toBe('💌')
  })
  it('detects jumbo emoji-only messages incl. ZWJ sequences', () => {
    expect(isEmojiOnly('❤️❤️❤️')).toBe(true)
    expect(isEmojiOnly('👨‍👩‍👧')).toBe(true)
    expect(isEmojiOnly('love you ❤️')).toBe(false)
  })
})

describe('date-format detection (US month-first vs day-first)', () => {
  const US = ['6/25/19, 14:49 - Alex: hey', '1/7/20, 09:12 - Maia: hi 😊', '12/9/21, 10:00 - Alex: ok'].join('\n')
  const EU = ['25/06/2019, 14:49 - A: hey', '07/01/2020, 09:12 - B: hi', '09/12/2021, 10:00 - A: ok'].join('\n')

  it('detects month-first from a second field over 12', () => {
    expect(detectDaysFirst(US)).toBe(false)
    expect(detectDaysFirst(EU)).toBe(true)
    expect(detectDaysFirst('1/2/20, 09:00 - A: fully ambiguous')).toBeUndefined()
  })

  it('parses US-format exports into the correct month and never the future', () => {
    const entries = parseExportTxt(US)
    expect(entries.length).toBe(3)
    const d = new Date(entries[0].ts)
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([2019, 6, 25])
    const jan7 = new Date(entries[1].ts)
    expect([jan7.getFullYear(), jan7.getMonth() + 1, jan7.getDate()]).toEqual([2020, 1, 7])
  })
})

describe('normalizeReactions defensive shapes', () => {
  it('handles emoji->count maps, arrays and sender->emoji maps', () => {
    expect(normalizeReactions({ '❤️': 3 })).toEqual([{ emoji: '❤️', count: 3 }])
    expect(normalizeReactions([{ emoji: '😂', sender: 'M' }, '😂'])).toEqual([{ emoji: '😂', count: 2, from: ['M'] }])
    expect(normalizeReactions({ Maia: '🥰' })).toEqual([{ emoji: '🥰', count: 1, from: ['Maia'] }])
    expect(normalizeReactions(undefined)).toBeUndefined()
    expect(normalizeReactions({})).toBeUndefined()
  })
})
