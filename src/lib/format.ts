export const fmtTime = (ts: number) =>
  new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

export const fmtDay = (ts: number) =>
  new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

export const fmtDayShort = (ts: number) =>
  new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString()

export const fmtRange = (start: number, end: number) =>
  sameDay(start, end) ? fmtDay(start) : `${fmtDayShort(start)} — ${fmtDayShort(end)}`

export const slugify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'memory'
