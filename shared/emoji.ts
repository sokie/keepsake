const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter('en', { granularity: 'grapheme' })
    : null

const PICTO = /\p{Extended_Pictographic}/u
// bare skin-tone modifiers / variation selectors shouldn't count as emoji on their own
const MODIFIER_ONLY = /^[\u{1F3FB}-\u{1F3FF}︎️‍]+$/u

export function graphemes(s: string): string[] {
  if (!s) return []
  if (segmenter) return [...segmenter.segment(s)].map((x) => x.segment)
  return [...s]
}

export function isEmojiGrapheme(g: string): boolean {
  return PICTO.test(g) && !MODIFIER_ONLY.test(g)
}

export function extractEmoji(s: string): string[] {
  return graphemes(s).filter(isEmojiGrapheme)
}

/** true when the text is nothing but 1..max emoji — rendered jumbo, like WhatsApp */
export function isEmojiOnly(s: string, max = 3): boolean {
  const g = graphemes(s.replace(/\s+/g, ''))
  return g.length > 0 && g.length <= max && g.every(isEmojiGrapheme)
}

/** the most frequent emoji across a set of texts — used as a memory's wax seal */
export function dominantEmoji(texts: Array<string | undefined>, fallback = '💌'): string {
  const counts = new Map<string, number>()
  for (const t of texts) {
    if (!t) continue
    for (const e of extractEmoji(t)) counts.set(e, (counts.get(e) ?? 0) + 1)
  }
  let best = fallback
  let bestCount = 0
  for (const [e, c] of counts) {
    if (c > bestCount) {
      best = e
      bestCount = c
    }
  }
  return best
}
