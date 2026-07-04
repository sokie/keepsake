import { toPng } from 'html-to-image'
import { api } from './api'
import { slugify } from './format'

// Browsers cap canvas dimensions around 65k px and total area lower than
// that; past ~60k device px we halve the pixel ratio instead of failing.
const MAX_DEVICE_PX = 60000

export interface PngCapture {
  dataUrl: string
  scaled: boolean
}

const BLANK_PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

/** render a mounted memory canvas to a PNG data url */
export async function captureNodePng(node: HTMLElement): Promise<PngCapture> {
  // corrupt media files (backups accumulate them over the years) make the
  // browser fail DECODING even though the fetch succeeds — html-to-image then
  // rejects with a bare Event. Swap anything undecodable for a blank pixel.
  await Promise.all(
    [...node.querySelectorAll('img')].map(async (img) => {
      if (!img.src || img.src === BLANK_PX) return
      try {
        await img.decode()
      } catch {
        img.src = BLANK_PX
      }
    }),
  )
  node.classList.add('png-export')
  try {
    let pixelRatio = 2
    if (node.scrollHeight * pixelRatio > MAX_DEVICE_PX) pixelRatio = 1
    const dataUrl = await toPng(node, {
      pixelRatio,
      backgroundColor: '#efe7db',
      cacheBust: false,
      // html-to-image cannot snapshot live <video>/<audio> elements (it
      // rejects with a bare Event) — drop them from the clone; the .av-chip
      // fallback rendered next to them carries the PNG instead
      filter: (n) => !(n instanceof HTMLVideoElement || n instanceof HTMLAudioElement),
      // a corrupt media file must never sink the whole export — show a blank
      // placeholder for anything the browser can't decode
      imagePlaceholder:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    })
    return { dataUrl, scaled: pixelRatio === 1 }
  } finally {
    node.classList.remove('png-export')
  }
}

export async function exportMemoryPng(node: HTMLElement, memoryId: string, title: string): Promise<{ scaled: boolean }> {
  const { dataUrl, scaled } = await captureNodePng(node)

  const a = document.createElement('a')
  a.href = dataUrl
  a.download = `${slugify(title)}.png`
  a.click()

  // archive a copy next to the memory's JSON; failures here are non-fatal
  api.uploadPng(memoryId, dataUrl).catch(() => {})

  return { scaled }
}
