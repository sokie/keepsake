import fs from 'node:fs'
import path from 'node:path'
import type { Memory } from '../../shared/types.js'
import { mimeFromName } from './util.js'

const MAX_INLINE_BYTES = 25 * 1024 * 1024
const DEFAULT_TOTAL_BUDGET = 250 * 1024 * 1024

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * A memory as a single self-contained .html file: all styles, script and
 * media are inlined so it opens anywhere, forever — no app, no server.
 * mode 'replay' plays messages back one-by-one with typing indicators;
 * mode 'page' renders the whole conversation at once, like the memory page.
 */
export function renderMemoryHtml(
  memory: Memory,
  mediaDir: string,
  mode: 'replay' | 'page' = 'replay',
  totalBudget = DEFAULT_TOTAL_BUDGET,
): string {
  const media: Record<string, string> = {}
  let spent = 0
  for (const m of memory.messages) {
    const file = m.media?.file
    if (!file || media[file]) continue
    const p = path.join(mediaDir, path.basename(file))
    try {
      const stat = fs.statSync(p)
      if (stat.size > MAX_INLINE_BYTES || spent + stat.size > totalBudget) continue
      spent += stat.size
      media[file] = `data:${mimeFromName(file)};base64,${fs.readFileSync(p).toString('base64')}`
    } catch {
      /* leave missing */
    }
  }

  const payload = JSON.stringify({
    mode,
    title: memory.title,
    note: memory.note ?? null,
    seal: memory.sealEmoji,
    chatName: memory.chatName,
    startDate: fmtDate(memory.startTs),
    endDate: fmtDate(memory.endTs),
    messages: memory.messages,
    media,
  }).replace(/</g, '\\u003c')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(memory.title)} — a kept memory</title>
<style>
  :root {
    --paper: #f6efe2; --ink: #33261b; --ink-soft: #8a7a67;
    --rose: #b3475d; --wa-me: #d9fdd3; --wa-them: #ffffff; --meta: #8a7f72;
  }
  * { box-sizing: border-box; margin: 0; }
  html { background: var(--paper); }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
    color: var(--ink); min-height: 100vh;
    background:
      radial-gradient(1200px 500px at 50% -10%, #fdf8ee 0%, transparent 60%),
      var(--paper);
  }
  .page { max-width: 560px; margin: 0 auto; padding: 24px 16px 110px; }
  .cover {
    text-align: center; padding: 48px 24px; margin: 8vh 0 24px;
    background: #fffdf7; border: 1px solid #e6dcc9; border-radius: 6px;
    box-shadow: 0 18px 40px -18px rgba(51,38,27,.35);
    font-family: 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif;
  }
  .cover .seal {
    width: 74px; height: 74px; margin: 0 auto 18px; font-size: 34px;
    display: flex; align-items: center; justify-content: center;
    background: radial-gradient(circle at 35% 30%, #cf6a7e, var(--rose) 65%, #8e3348);
    border-radius: 46% 54% 51% 49% / 52% 48% 53% 47%;
    box-shadow: inset 0 2px 6px rgba(255,255,255,.35), inset 0 -4px 8px rgba(0,0,0,.25), 0 4px 10px rgba(51,38,27,.25);
  }
  .cover h1 { font-size: 30px; font-weight: 600; font-style: italic; letter-spacing: .01em; }
  .cover .dates { margin-top: 10px; color: var(--ink-soft); font-size: 14px; letter-spacing: .12em; text-transform: uppercase; }
  .cover .note { margin-top: 16px; font-style: italic; color: var(--ink-soft); font-size: 16px; line-height: 1.5; }
  .cover button {
    margin-top: 26px; font: inherit; font-size: 16px; cursor: pointer;
    background: var(--ink); color: #fdf8ee; border: 0; border-radius: 999px; padding: 12px 26px;
  }
  .cover button:hover { background: #4a3828; }
  .daychip, .syschip {
    width: fit-content; margin: 18px auto 10px; padding: 5px 12px; font-size: 12px;
    background: #efe6d3; color: var(--ink-soft); border-radius: 8px;
    box-shadow: 0 1px 1px rgba(51,38,27,.08);
  }
  .syschip { font-style: italic; }
  .row { display: flex; padding: 2px 0 0; }
  .row.me { justify-content: flex-end; }
  .row.first { padding-top: 8px; }
  .bubble {
    position: relative; max-width: 78%; padding: 6px 9px 7px; border-radius: 9px;
    background: var(--wa-them); box-shadow: 0 1px 1px rgba(51,38,27,.13);
    font-size: 15.5px; line-height: 1.35; overflow-wrap: anywhere; white-space: pre-wrap;
  }
  .me .bubble { background: var(--wa-me); }
  .row.first .bubble::before {
    content: ''; position: absolute; top: 0; width: 12px; height: 12px; background: inherit;
  }
  .row.first.them .bubble::before { left: -6px; clip-path: polygon(100% 0, 0 0, 100% 100%); }
  .row.first.me .bubble::before { right: -6px; clip-path: polygon(0 0, 100% 0, 0 100%); }
  .bubble .time { float: right; margin: 8px 0 -4px 8px; font-size: 11px; color: var(--meta); white-space: nowrap; }
  .bubble.jumbo { background: transparent; box-shadow: none; font-size: 46px; line-height: 1.15; }
  .bubble.jumbo::before { display: none !important; }
  .bubble.jumbo .time { font-size: 11px; }
  .bubble img, .bubble video { max-width: 100%; border-radius: 6px; display: block; }
  .bubble img.sticker { max-width: 150px; background: transparent; }
  .bubble.stickerb { background: transparent !important; box-shadow: none; }
  .bubble.stickerb::before { display: none !important; }
  .bubble.has-media { padding: 4px; }
  .bubble.has-media .cap { padding: 4px 5px 2px; }
  .bubble.has-media .time { margin-right: 5px; }
  .missing {
    display: flex; gap: 8px; align-items: center; padding: 10px 12px; font-size: 13px;
    background: rgba(51,38,27,.05); border: 1px dashed rgba(51,38,27,.2); border-radius: 6px; color: var(--ink-soft);
  }
  .reactions {
    position: absolute; bottom: -12px; right: 6px; padding: 2px 6px; font-size: 12px;
    background: #fff; border: 1px solid #eee3d0; border-radius: 999px; box-shadow: 0 1px 2px rgba(51,38,27,.15);
  }
  .row.reacted { margin-bottom: 14px; }
  .edited { font-size: 11px; color: var(--meta); font-style: italic; }
  .typing { display: inline-flex; gap: 4px; padding: 12px 12px; }
  .typing i { width: 7px; height: 7px; border-radius: 50%; background: #b6aa99; animation: blink 1.2s infinite; }
  .typing i:nth-child(2) { animation-delay: .2s; } .typing i:nth-child(3) { animation-delay: .4s; }
  @keyframes blink { 0%,60%,100% { opacity: .25 } 30% { opacity: 1 } }
  .pop { animation: pop .32s cubic-bezier(.2,1.4,.4,1); transform-origin: bottom left; }
  .me .pop { transform-origin: bottom right; }
  @keyframes pop { from { transform: scale(.85) translateY(8px); opacity: 0 } to { transform: scale(1) translateY(0); opacity: 1 } }
  .controls {
    position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%);
    display: none; gap: 6px; padding: 8px; border-radius: 999px;
    background: rgba(51,38,27,.92); box-shadow: 0 10px 26px rgba(51,38,27,.4); backdrop-filter: blur(6px);
  }
  .controls button {
    font: inherit; font-size: 15px; min-width: 44px; padding: 8px 12px; cursor: pointer;
    background: transparent; color: #fdf8ee; border: 0; border-radius: 999px;
  }
  .controls button:hover { background: rgba(253,248,238,.15); }
  .fin { text-align: center; margin: 34px 0 8px; color: var(--ink-soft); font-style: italic;
         font-family: 'Iowan Old Style', Palatino, Georgia, serif; display: none; }
</style>
</head>
<body>
  <div class="page">
    <div class="cover" id="cover">
      <div class="seal" id="seal"></div>
      <h1 id="title"></h1>
      <div class="dates" id="dates"></div>
      <div class="note" id="note"></div>
      <button id="play">▶&nbsp; relive it</button>
    </div>
    <div id="thread"></div>
    <div class="fin" id="fin">— kept with 💌 —</div>
  </div>
  <div class="controls" id="controls">
    <button id="toggle" title="play/pause">⏸</button>
    <button id="speed" title="speed">1×</button>
    <button id="skip" title="show everything">⏭</button>
    <button id="restart" title="restart">↻</button>
  </div>
<script>
const DATA = ${payload};
const $ = (id) => document.getElementById(id);
$('seal').textContent = DATA.seal;
$('title').textContent = DATA.title;
$('dates').textContent = DATA.startDate === DATA.endDate ? DATA.startDate : DATA.startDate + '  —  ' + DATA.endDate;
if (DATA.note) $('note').textContent = '“' + DATA.note + '”'; else $('note').remove();
document.title = DATA.title + ' — a kept memory';

const seg = ('Segmenter' in Intl) ? new Intl.Segmenter('en', { granularity: 'grapheme' }) : null;
const PICTO = /\\p{Extended_Pictographic}/u;
function isJumbo(t) {
  if (!t) return false;
  const g = seg ? [...seg.segment(t.replace(/\\s+/g, ''))].map(s => s.segment) : [...t];
  return g.length > 0 && g.length <= 3 && g.every(x => PICTO.test(x));
}
const fmtTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const fmtDay = (ts) => new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

const thread = $('thread');
const M = DATA.messages;
let i = 0, playing = false, speed = 1, timer = null, prev = null;
const speeds = [1, 2, 4];

function mediaEl(m) {
  const src = m.media.file && DATA.media[m.media.file];
  if (!src) {
    const d = document.createElement('div');
    d.className = 'missing';
    const label = { image: 'photo', video: 'video', gif: 'GIF', sticker: 'sticker', voice: 'voice message', audio: 'audio', document: 'file', unknown: 'attachment' }[m.media.type] || 'attachment';
    d.textContent = '📎 ' + label + ' not included in the export';
    return d;
  }
  const t = m.media.type;
  if (t === 'gif' && /\\.(mp4|mov)$/i.test(m.media.file || '')) {
    const el = document.createElement('video');
    el.src = src; el.autoplay = true; el.loop = true; el.muted = true; el.playsInline = true;
    return el;
  }
  if (t === 'image' || t === 'gif' || t === 'sticker') {
    const el = document.createElement('img');
    el.src = src; if (t === 'sticker') el.className = 'sticker';
    return el;
  }
  if (t === 'video') { const el = document.createElement('video'); el.src = src; el.controls = true; el.playsInline = true; return el; }
  if (t === 'voice' || t === 'audio') { const el = document.createElement('audio'); el.src = src; el.controls = true; return el; }
  const a = document.createElement('a');
  a.href = src; a.download = m.media.originalName || 'file'; a.textContent = '📄 ' + (m.media.originalName || 'file');
  return a;
}

function appendMsg(m, animate) {
  if (!prev || new Date(prev.ts).toDateString() !== new Date(m.ts).toDateString()) {
    const chip = document.createElement('div'); chip.className = 'daychip'; chip.textContent = fmtDay(m.ts);
    thread.appendChild(chip);
    prev = null;
  }
  if (m.system) {
    const chip = document.createElement('div'); chip.className = 'syschip'; chip.textContent = m.text;
    thread.appendChild(chip); prev = m; return;
  }
  const grouped = prev && !prev.system && prev.fromMe === m.fromMe && (m.ts - prev.ts) < 180000;
  const row = document.createElement('div');
  row.className = 'row ' + (m.fromMe ? 'me' : 'them') + (grouped ? '' : ' first') + (m.reactions?.length ? ' reacted' : '');
  const b = document.createElement('div');
  b.className = 'bubble' + (animate ? ' pop' : '');
  if (m.media) {
    b.classList.add('has-media');
    if (m.media.type === 'sticker' && m.media.file && DATA.media[m.media.file]) b.classList.add('stickerb');
    b.appendChild(mediaEl(m));
    if (m.text) { const c = document.createElement('div'); c.className = 'cap'; c.textContent = m.text; b.appendChild(c); }
  } else {
    if (isJumbo(m.text)) b.classList.add('jumbo');
    b.appendChild(document.createTextNode(m.text || ''));
  }
  const t = document.createElement('span'); t.className = 'time';
  if (m.edited) { const e = document.createElement('span'); e.className = 'edited'; e.textContent = 'edited · '; t.appendChild(e); }
  t.appendChild(document.createTextNode(fmtTime(m.ts)));
  b.appendChild(t);
  if (m.reactions?.length) {
    const r = document.createElement('div'); r.className = 'reactions';
    const total = m.reactions.reduce((s, x) => s + x.count, 0);
    r.textContent = m.reactions.map(x => x.emoji).join('') + (total > 1 ? ' ' + total : '');
    b.appendChild(r);
  }
  row.appendChild(b);
  thread.appendChild(row);
  prev = m;
}

const scrollDown = () => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });

function typingRow() {
  const row = document.createElement('div'); row.className = 'row them first';
  row.innerHTML = '<div class="bubble"><span class="typing"><i></i><i></i><i></i></span></div>';
  thread.appendChild(row); return row;
}

function step() {
  if (!playing) return;
  if (i >= M.length) return finish();
  const m = M[i];
  const len = (m.text || '').length + (m.media ? 40 : 0);
  if (!m.fromMe && !m.system) {
    const tr = typingRow(); scrollDown();
    timer = setTimeout(() => { tr.remove(); appendMsg(m, true); i++; scrollDown(); timer = setTimeout(step, 350 / speed); },
      Math.min(600 + len * 22, 2400) / speed);
  } else {
    timer = setTimeout(() => { appendMsg(m, true); i++; scrollDown(); timer = setTimeout(step, 250 / speed); },
      Math.min(280 + len * 10, 1400) / speed);
  }
}

function finish() {
  playing = false; $('toggle').textContent = '▶'; $('fin').style.display = 'block'; scrollDown();
}

if (DATA.mode === 'page') {
  // static view: everything on the page at once, nothing to control
  $('controls').remove();
  $('play').remove();
  while (i < M.length) appendMsg(M[i++], false);
  $('fin').style.display = 'block';
} else {
  $('play').onclick = () => {
    $('cover').querySelector('button').style.display = 'none';
    $('controls').style.display = 'flex';
    playing = true; $('toggle').textContent = '⏸'; step();
  };
  $('toggle').onclick = () => {
    playing = !playing; $('toggle').textContent = playing ? '⏸' : '▶';
    if (playing) step(); else clearTimeout(timer);
  };
  $('speed').onclick = () => {
    speed = speeds[(speeds.indexOf(speed) + 1) % speeds.length];
    $('speed').textContent = speed + '×';
  };
  $('skip').onclick = () => {
    clearTimeout(timer); playing = false; $('toggle').textContent = '▶';
    document.querySelectorAll('.typing').forEach(el => el.closest('.row').remove());
    while (i < M.length) appendMsg(M[i++], false);
    finish();
  };
  $('restart').onclick = () => {
    clearTimeout(timer); thread.innerHTML = ''; $('fin').style.display = 'none';
    i = 0; prev = null; playing = true; $('toggle').textContent = '⏸';
    window.scrollTo({ top: 0 }); step();
  };
}
</script>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
