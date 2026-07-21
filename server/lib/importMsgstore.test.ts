import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { locateMsgstore, listMsgstoreChats, buildMsgstoreMsgs, collectMedia } from './importMsgstore.js'

const T = (h: number, m: number, s: number) => new Date(2024, 0, 15, h, m, s).getTime()

let dump: string
let decrypted: string
let dbPath: string

function makeDb(p: string) {
  const db = new DatabaseSync(p)
  db.exec(`
    CREATE TABLE jid (_id INTEGER PRIMARY KEY, user TEXT, server TEXT, raw_string TEXT);
    CREATE TABLE chat (_id INTEGER PRIMARY KEY, jid_row_id INTEGER, subject TEXT);
    CREATE TABLE message (_id INTEGER PRIMARY KEY, chat_row_id INTEGER, from_me INTEGER, key_id TEXT,
      timestamp INTEGER, message_type INTEGER, text_data TEXT);
    CREATE TABLE message_media (message_row_id INTEGER PRIMARY KEY, chat_row_id INTEGER,
      file_path TEXT, mime_type TEXT, media_caption TEXT);
    CREATE TABLE message_add_on (_id INTEGER PRIMARY KEY, chat_row_id INTEGER, from_me INTEGER,
      parent_message_row_id INTEGER, message_add_on_type INTEGER, timestamp INTEGER);
    CREATE TABLE message_add_on_reaction (message_add_on_row_id INTEGER, reaction TEXT, sender_timestamp INTEGER);
    CREATE TABLE message_edit_info (message_row_id INTEGER, edited_timestamp INTEGER);
    CREATE TABLE message_quoted (message_row_id INTEGER PRIMARY KEY, chat_row_id INTEGER, from_me INTEGER,
      key_id TEXT, timestamp INTEGER, message_type INTEGER, text_data TEXT);
  `)
  db.exec(`
    INSERT INTO jid VALUES (1,'40711111111','s.whatsapp.net','40711111111@s.whatsapp.net');
    INSERT INTO jid VALUES (2,'123-456','g.us','123-456@g.us');
    INSERT INTO chat VALUES (1,1,NULL);
    INSERT INTO chat VALUES (2,2,'Some Group');

    INSERT INTO message VALUES (1,1,0,'k1',${T(9, 0, 5)},0,'hey you ❤️');
    INSERT INTO message VALUES (2,1,0,'k2',${T(9, 0, 30)},7,NULL);
    INSERT INTO message VALUES (3,1,1,'k3',${T(9, 1, 10)},1,'look under the tree 🎁');
    INSERT INTO message VALUES (4,1,1,'k4',${T(9, 2, 0)},13,NULL);
    INSERT INTO message VALUES (5,1,0,'k5',${T(9, 3, 0)},2,NULL);
    INSERT INTO message VALUES (6,1,0,'k6',${T(9, 4, 0)},20,NULL);
    INSERT INTO message VALUES (7,1,0,'k7',${T(9, 5, 0)},0,'i love you');
    INSERT INTO message VALUES (8,1,1,'k8',${T(9, 6, 0)},3,NULL);
    INSERT INTO message VALUES (9,2,0,'k9',${T(10, 0, 0)},0,'group noise');

    INSERT INTO message_media VALUES (3,1,'Media/WhatsApp Images/IMG-20240115-WA0001.jpg','image/jpeg',NULL);
    INSERT INTO message_media VALUES (4,1,'Media/WhatsApp Animated Gifs/VID-20240115-WA0002.mp4','video/mp4',NULL);
    INSERT INTO message_media VALUES (5,1,'Media/WhatsApp Voice Notes/202403/PTT-20240115-WA0003.opus','audio/ogg; codecs=opus',NULL);
    INSERT INTO message_media VALUES (6,1,'Media/WhatsApp Stickers/STK-20240115-WA0004.webp','image/webp',NULL);
    INSERT INTO message_media VALUES (8,1,NULL,'video/mp4',NULL);

    INSERT INTO message_add_on VALUES (1,1,1,3,56,${T(9, 1, 30)});
    INSERT INTO message_add_on_reaction VALUES (1,'😍',${T(9, 1, 30)});

    INSERT INTO message_edit_info VALUES (7,${T(9, 5, 20)});

    -- msg 7 ("i love you") replies to msg 1's text; msg 8 (video) replies to the image (msg 3)
    INSERT INTO message_quoted VALUES (7,1,0,'k1',${T(9, 0, 5)},0,'hey you ❤️');
    INSERT INTO message_quoted VALUES (8,1,1,'k3',${T(9, 1, 10)},1,NULL);
  `)
  db.close()
}

beforeAll(() => {
  dump = fs.mkdtempSync(path.join(os.tmpdir(), 'msgstore-fixture-'))
  decrypted = `${dump}-decrypted`
  dbPath = path.join(decrypted, 'Databases', 'msgstore.db')
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  makeDb(dbPath)

  // media split across the two siblings, like a real wabdd dump
  const img = path.join(dump, 'Media', 'WhatsApp Images')
  const stk = path.join(dump, 'Media', 'WhatsApp Stickers')
  const gif = path.join(decrypted, 'Media', 'WhatsApp Animated Gifs')
  fs.mkdirSync(img, { recursive: true })
  fs.mkdirSync(stk, { recursive: true })
  fs.mkdirSync(gif, { recursive: true })
  fs.writeFileSync(path.join(img, 'IMG-20240115-WA0001.jpg'), 'jpg-bytes')
  fs.writeFileSync(path.join(stk, 'STK-20240115-WA0004.webp'), 'webp-bytes')
  fs.writeFileSync(path.join(gif, 'VID-20240115-WA0002.mp4'), 'mp4-bytes')
  // PTT voice note deliberately absent everywhere → stays missing
})

afterAll(() => {
  fs.rmSync(dump, { recursive: true, force: true })
  fs.rmSync(decrypted, { recursive: true, force: true })
})

describe('locateMsgstore', () => {
  it('finds the db from the decrypted folder and collects both media roots', () => {
    const loc = locateMsgstore(decrypted)!
    expect(loc.dbPath).toBe(dbPath)
    expect(loc.mediaRoots.sort()).toEqual([dump, decrypted].sort())
  })

  it('finds the db from the plain dump folder via the -decrypted sibling', () => {
    const loc = locateMsgstore(dump)!
    expect(loc.dbPath).toBe(dbPath)
    expect(loc.mediaRoots.length).toBe(2)
  })

  it('accepts the .db path itself', () => {
    expect(locateMsgstore(dbPath)?.dbPath).toBe(dbPath)
  })

  it('returns undefined for unrelated folders', () => {
    expect(locateMsgstore(os.tmpdir())).toBeUndefined()
  })
})

describe('listMsgstoreChats', () => {
  it('lists chats with jid, subject-or-number name, counts desc', () => {
    const chats = listMsgstoreChats(dbPath)
    expect(chats.length).toBe(2)
    expect(chats[0]).toEqual({ jid: '40711111111@s.whatsapp.net', name: '40711111111', count: 8 })
    expect(chats[1].name).toBe('Some Group')
  })
})

describe('buildMsgstoreMsgs', () => {
  let msgs: ReturnType<typeof buildMsgstoreMsgs>['msgs']
  let mediaRefs: ReturnType<typeof buildMsgstoreMsgs>['mediaRefs']
  beforeAll(() => {
    ;({ msgs, mediaRefs } = buildMsgstoreMsgs(dbPath, '40711111111@s.whatsapp.net', 'Alex', 'Maia'))
  })

  it('imports only the requested chat and skips system rows', () => {
    expect(msgs.length).toBe(7) // 8 chat rows minus the type-7 system row
    expect(msgs.every((m) => !m.text?.includes('group noise'))).toBe(true)
  })

  it('maps senders and fromMe', () => {
    expect(msgs[0].sender).toBe('Maia')
    expect(msgs[0].fromMe).toBe(false)
    expect(msgs.find((m) => m.text === 'look under the tree 🎁')?.fromMe).toBe(true)
  })

  it('types media correctly (image w/ caption, gif-mp4, voice, sticker, pathless)', () => {
    const img = msgs.find((m) => m.media?.originalName === 'IMG-20240115-WA0001.jpg')!
    expect(img.media?.type).toBe('image')
    expect(img.text).toBe('look under the tree 🎁')
    expect(msgs.find((m) => m.media?.originalName === 'VID-20240115-WA0002.mp4')?.media?.type).toBe('gif')
    expect(msgs.find((m) => m.media?.originalName === 'PTT-20240115-WA0003.opus')?.media?.type).toBe('voice')
    expect(msgs.find((m) => m.media?.originalName === 'STK-20240115-WA0004.webp')?.media?.type).toBe('sticker')
    const pathless = msgs.filter((m) => m.media && !m.media.originalName)
    expect(pathless.length).toBe(1)
    expect(pathless[0].media?.type).toBe('video')
  })

  it('attaches reactions with sender attribution', () => {
    const img = msgs.find((m) => m.media?.originalName === 'IMG-20240115-WA0001.jpg')!
    expect(img.reactions).toEqual([{ emoji: '😍', count: 1, from: ['Alex'] }])
  })

  it('flags edited messages via message_edit_info', () => {
    expect(msgs.find((m) => m.text === 'i love you')?.edited).toBe(true)
  })

  it('attaches quoted-reply context, as text and as media snapshots', () => {
    expect(msgs.find((m) => m.text === 'i love you')?.quoted).toEqual({
      sender: 'Maia',
      fromMe: false,
      text: 'hey you ❤️',
    })
    // the pathless video (row 8) replies to the image — snapshot carries the media kind
    const mediaReply = msgs.find((m) => m.media && !m.media.originalName)!
    expect(mediaReply.quoted).toEqual({ sender: 'Alex', fromMe: true, mediaType: 'image' })
  })

  it('collects media refs and unique ids', () => {
    expect(mediaRefs.size).toBe(4)
    expect(new Set(msgs.map((m) => m.id)).size).toBe(msgs.length)
  })

  it('throws a 404 for unknown jids', () => {
    expect(() => buildMsgstoreMsgs(dbPath, 'nobody@s.whatsapp.net', 'a', 'b')).toThrow(/not found/)
  })
})

describe('collectMedia', () => {
  it('links files from BOTH sibling roots and reports what it found', () => {
    const { mediaRefs } = buildMsgstoreMsgs(dbPath, '40711111111@s.whatsapp.net', 'Alex', 'Maia')
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'media-dest-'))
    const located = collectMedia(mediaRefs, [decrypted, dump], dest)
    expect([...located].sort()).toEqual(
      ['IMG-20240115-WA0001.jpg', 'STK-20240115-WA0004.webp', 'VID-20240115-WA0002.mp4'].sort(),
    )
    expect(fs.readFileSync(path.join(dest, 'VID-20240115-WA0002.mp4'), 'utf8')).toBe('mp4-bytes')
    expect(located.has('PTT-20240115-WA0003.opus')).toBe(false)
    fs.rmSync(dest, { recursive: true, force: true })
  })
})
