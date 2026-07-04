import { chromium } from 'playwright-core'

const OUT = process.argv[2] ?? '.'
const MID = process.argv[3] ?? '2024-12-25-our-christmas-8b01'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1360, height: 850 }, deviceScaleFactor: 2 })

const shot = async (name) => {
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${OUT}/${name}.png` })
  console.log('shot', name)
}

await page.goto('http://localhost:5173/')
await shot('1-gallery')

await page.goto('http://localhost:5173/import')
await shot('2-import')

await page.goto('http://localhost:5173/chat/maia-7dbf7e')
await page.waitForTimeout(1200)
// select a range: click two bubbles
const bubbles = page.locator('.bubble')
const n = await bubbles.count()
if (n > 6) {
  await bubbles.nth(n - 7).click()
  await bubbles.nth(n - 2).click()
}
await shot('3-chat-selection')

await page.goto(`http://localhost:5173/memory/${MID}`)
await page.waitForTimeout(900)
await shot('4-memory')

await page.getByRole('button', { name: /Replay/ }).first().click()
await page.getByRole('button', { name: /relive it/ }).click()
await page.waitForTimeout(6000)
await shot('5-replay')

await browser.close()
