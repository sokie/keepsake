// Generates a fully SYNTHETIC fixture couple-chat (no real data) in both
// source formats: an official Android "Export Chat" zip and a wtsexporter
// result.json folder — including overlapping messages so merge/dedupe is
// exercised, plus reactions, stickers, media, edits and system lines.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import AdmZip from 'adm-zip'
import { IMG1, IMG9, STK } from './media-assets.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))

const pad = (n) => String(n).padStart(2, '0')
const line = (d, author, text) =>
  `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())} - ${author ? author + ': ' : ''}${text}`

const D = (y, mo, d, h, mi, s = 0) => new Date(y, mo - 1, d, h, mi, s)

// ---- handcrafted core (edge cases) ----
const lines = []
lines.push(line(D(2024, 12, 25, 9, 12), null, 'Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them.'))
lines.push(line(D(2024, 12, 25, 9, 12), 'Maia', 'Merry Christmas my love! 🎄❤️'))
lines.push(line(D(2024, 12, 25, 9, 12), 'Alex', 'Merry Christmas! 😍 I left something under the tree 👀'))
lines.push(line(D(2024, 12, 25, 9, 13), 'Maia', 'NO. What did you do 😂😂'))
lines.push(line(D(2024, 12, 25, 9, 13), 'Maia', 'if this is another sock joke I swear'))
lines.push(line(D(2024, 12, 25, 9, 14), 'Alex', 'IMG-20241225-WA0001.jpg (file attached)\nopen it 🎁'))
lines.push(line(D(2024, 12, 25, 9, 16), 'Maia', 'AAAAAA'))
lines.push(line(D(2024, 12, 25, 9, 16), 'Maia', '❤️❤️❤️'))
lines.push(line(D(2024, 12, 25, 9, 17), 'Maia', 'STK-20241225-WA0002.webp (file attached)'))
lines.push(line(D(2024, 12, 25, 9, 18), 'Alex', '<Media omitted>'))
lines.push(line(D(2024, 12, 25, 9, 19), 'Alex', 'VID-20241225-WA0003.mp4 (file attached)'))
lines.push(line(D(2024, 12, 25, 9, 20), 'Maia', 'i love you so much <This message was edited>'))
lines.push(line(D(2024, 12, 25, 21, 40), 'Alex', 'today was perfect\nthank you for everything\n❤️'))
lines.push(line(D(2024, 12, 25, 21, 41), 'Maia', '🥺'))
lines.push(line(D(2024, 12, 26, 8, 2), 'Maia', 'good morning 🌞'))
lines.push(line(D(2024, 12, 26, 8, 5), 'Alex', 'mooorning ☕ come back to bed'))
lines.push(line(D(2024, 12, 26, 8, 5), 'Maia', '😂 someone has to make the coffee'))

// ---- generated filler so scrolling/virtualization is exercised ----
const fillerTexts = [
  'what are you doing? 😊', 'i miss you', 'have you seen the weather? 🌧️', "let's order pizza 🍕",
  'on my way home', 'did you get milk?', '😂😂😂', 'look at this meme', 'good night ❤️',
  'i love you', 'show me later?', 'yes!! 🎉', "i can't believe it 😱", 'haha exactly', 'promise 🤞',
]
for (let day = 0; day < 40; day++) {
  const date = new Date(2025, 0, 5 + day)
  const perDay = 4 + ((day * 7) % 9)
  for (let k = 0; k < perDay; k++) {
    const who = (day + k) % 2 === 0 ? 'Maia' : 'Alex'
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 8 + ((k * 3) % 13), (k * 11) % 60)
    lines.push(line(d, who, fillerTexts[(day + k * 3) % fillerTexts.length]))
  }
}

const txt = lines.join('\n') + '\n'
const sampleDir = path.join(here, 'sample')
fs.mkdirSync(sampleDir, { recursive: true })
fs.writeFileSync(path.join(sampleDir, 'WhatsApp Chat with Maia.txt'), txt, 'utf8')

const zip = new AdmZip()
zip.addFile('WhatsApp Chat with Maia.txt', Buffer.from(txt, 'utf8'))
zip.addFile('IMG-20241225-WA0001.jpg', IMG1)
zip.addFile('STK-20241225-WA0002.webp', STK)
// VID-20241225-WA0003.mp4 deliberately NOT in the zip → exercises "missing media"
zip.writeZip(path.join(here, 'sample-export.zip'))

// ---- wtsexporter-shaped result.json: overlaps day one, adds seconds precision,
// reactions, and one older wts-only message (full-history simulation) ----
const sec = (y, mo, d, h, mi, s) => Math.floor(D(y, mo, d, h, mi, s).getTime() / 1000)
const wtsMessages = {
  1000: { from_me: false, timestamp: sec(2023, 6, 10, 14, 3, 41), time: '14:03', media: false, data: 'our first inside joke 😄', sender: null, meta: false, sticker: false },
  1001: { from_me: false, timestamp: sec(2024, 12, 25, 9, 12, 5), time: '09:12', media: false, data: 'Merry Christmas my love! 🎄❤️', sender: null, meta: false, sticker: false, reactions: { '❤️': 1 } },
  1002: { from_me: true, timestamp: sec(2024, 12, 25, 9, 12, 48), time: '09:12', media: false, data: 'Merry Christmas! 😍 I left something under the tree 👀', sender: null, meta: false, sticker: false },
  1003: { from_me: false, timestamp: sec(2024, 12, 25, 9, 13, 22), time: '09:13', media: false, data: 'NO. What did you do 😂😂', sender: null, meta: false, sticker: false, reactions: [{ emoji: '😂', sender: 'Alex' }] },
  1004: { from_me: false, timestamp: sec(2024, 12, 25, 9, 13, 50), time: '09:13', media: false, data: 'if this is another sock joke I swear', sender: null, meta: false, sticker: false },
  1005: { from_me: true, timestamp: sec(2024, 12, 25, 9, 14, 10), time: '09:14', media: true, data: 'WhatsApp/Media/WhatsApp Images/IMG-20241225-WA0001.jpg', mime: 'image/jpeg', caption: 'open it 🎁', sender: null, meta: false, sticker: false },
  1006: { from_me: false, timestamp: sec(2024, 12, 25, 9, 16, 2), time: '09:16', media: false, data: 'AAAAAA', sender: null, meta: false, sticker: false },
  1007: { from_me: false, timestamp: sec(2024, 12, 25, 9, 16, 30), time: '09:16', media: false, data: '❤️❤️❤️', sender: null, meta: false, sticker: false, reactions: { '❤️': 2 } },
  1008: { from_me: false, timestamp: sec(2024, 12, 25, 9, 17, 15), time: '09:17', media: true, data: 'WhatsApp/Media/WhatsApp Stickers/STK-20241225-WA0002.webp', mime: 'image/webp', sender: null, meta: false, sticker: true },
  1009: { from_me: true, timestamp: sec(2024, 12, 25, 9, 18, 44), time: '09:18', media: true, data: 'WhatsApp/Media/WhatsApp Images/IMG-20241225-WA0009.jpg', mime: 'image/jpeg', sender: null, meta: false, sticker: false },
  1010: { from_me: false, timestamp: sec(2024, 12, 25, 9, 20, 12), time: '09:20', media: false, data: 'i love you so much', sender: null, meta: false, sticker: false, reactions: { '🥰': 1 } },
}
const wtsDir = path.join(here, 'wts-sample')
fs.mkdirSync(path.join(wtsDir, 'WhatsApp/Media/WhatsApp Images'), { recursive: true })
fs.mkdirSync(path.join(wtsDir, 'WhatsApp/Media/WhatsApp Stickers'), { recursive: true })
fs.writeFileSync(path.join(wtsDir, 'WhatsApp/Media/WhatsApp Images/IMG-20241225-WA0001.jpg'), IMG1)
fs.writeFileSync(path.join(wtsDir, 'WhatsApp/Media/WhatsApp Images/IMG-20241225-WA0009.jpg'), IMG9)
fs.writeFileSync(path.join(wtsDir, 'WhatsApp/Media/WhatsApp Stickers/STK-20241225-WA0002.webp'), STK)
fs.writeFileSync(
  path.join(wtsDir, 'result.json'),
  JSON.stringify({ '40711111111@s.whatsapp.net': { name: 'Maia', type: 'android', media_base: '', messages: wtsMessages } }, null, 2),
)

console.log(`fixtures written:
- ${path.join(sampleDir, 'WhatsApp Chat with Maia.txt')} (${lines.length} lines)
- ${path.join(here, 'sample-export.zip')}
- ${path.join(wtsDir, 'result.json')}`)
