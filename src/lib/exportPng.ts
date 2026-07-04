import { toPng } from 'html-to-image'
import { api } from './api'
import { slugify } from './format'

// Browsers cap canvas dimensions around 65k px and total area lower than
// that; past ~60k device px we halve the pixel ratio instead of failing.
const MAX_DEVICE_PX = 60000

export interface PngResult {
  scaled: boolean
}

export async function exportMemoryPng(node: HTMLElement, memoryId: string, title: string): Promise<PngResult> {
  node.classList.add('png-export')
  try {
    let pixelRatio = 2
    if (node.scrollHeight * pixelRatio > MAX_DEVICE_PX) pixelRatio = 1
    const dataUrl = await toPng(node, {
      pixelRatio,
      backgroundColor: '#efe7db',
      cacheBust: false,
      // a corrupt media file must never sink the whole export — show a blank
      // placeholder for anything the browser can't decode
      imagePlaceholder:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    })

    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `${slugify(title)}.png`
    a.click()

    // archive a copy next to the memory's JSON; failures here are non-fatal
    api.uploadPng(memoryId, dataUrl).catch(() => {})

    return { scaled: pixelRatio === 1 }
  } finally {
    node.classList.remove('png-export')
  }
}
