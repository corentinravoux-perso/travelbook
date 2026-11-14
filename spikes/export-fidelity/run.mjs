// Electron main script. Run: env -u ELECTRON_RUN_AS_NODE npx electron run.mjs --no-sandbox [--prefer-css|--inches|--microns] [--variants] [--no-capture] [--dpi=300|600]
import { app, BrowserWindow } from 'electron'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, 'out')
mkdirSync(out, { recursive: true })
const mode = process.argv.includes('--inches') ? 'inches' : process.argv.includes('--microns') ? 'microns' : process.argv.includes('--prefer-css') ? 'prefer-css' : 'default'
const WMM = 216, HMM = 303
const cssW = (WMM / 25.4) * 96, cssH = (HMM / 25.4) * 96
const variants = process.argv.includes('--variants') ? ['plain', 'shadow', 'rounded', 'clip', 'filter', 'opacity', 'rotate', 'textshadow', 'svg', 'png'] : []

function pdfOptions() {
  const o = { printBackground: true, margins: { marginType: 'none' } }
  if (mode === 'prefer-css') o.preferCSSPageSize = true
  else if (mode === 'inches') o.pageSize = { width: WMM / 25.4, height: HMM / 25.4 }
  else if (mode === 'microns') o.pageSize = { width: WMM * 1000, height: HMM * 1000 }
  return o // mode 'default': only the CSS @page, no option
}

app.on('window-all-closed', () => {}) // we quit explicitly
async function load(v, offscreen = false) {
  // printToPDF hangs in an offscreen window; a plain hidden window never paints, so captureScreenshot hangs there.
  const win = new BrowserWindow({ show: false, width: Math.ceil(cssW), height: Math.ceil(cssH), webPreferences: { offscreen, backgroundThrottling: false } })
  await win.loadFile(join(here, 'page.html'), v ? { hash: v } : undefined)
  await win.webContents.executeJavaScript('document.fonts.ready.then(() => Promise.all([...document.images].map(i => i.decode())))')
  return win
}

async function capture(win, dpi, file) {
  const dbg = win.webContents.debugger
  dbg.attach('1.3')
  const scale = dpi / 96
  const t0 = Date.now()
  await dbg.sendCommand('Emulation.setDeviceMetricsOverride', { width: Math.ceil(cssW), height: Math.ceil(cssH), deviceScaleFactor: 1, mobile: false })
  const r = await Promise.race([
    dbg.sendCommand('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: cssW, height: cssH, scale } }),
    new Promise((_, rej) => setTimeout(() => rej(new Error('capture timeout 90 s')), 90000))
  ])
  const ms = Date.now() - t0
  writeFileSync(file, Buffer.from(r.data, 'base64'))
  await dbg.sendCommand('Emulation.clearDeviceMetricsOverride')
  dbg.detach()
  return ms
}

app.disableHardwareAcceleration?.()
app.whenReady().then(async () => {
  const suffix = mode === 'default' ? '' : `-${mode}`
  const win = await load()
  const pdf = await win.webContents.printToPDF(pdfOptions())
  writeFileSync(join(out, `out${suffix}.pdf`), pdf)
  console.log('pdf', mode, pdf.length)
  win.destroy()

  for (const v of variants) {
    const w = await load(v)
    writeFileSync(join(out, `var-${v}.pdf`), await w.webContents.printToPDF(pdfOptions()))
    w.destroy()
  }

  if (!process.argv.includes('--no-capture')) {
    const w = await load(undefined, true)
    const only = process.argv.find(a => a.startsWith('--dpi='))
    for (const dpi of only ? [Number(only.slice(6))] : [300, 600]) {
      const ms = await capture(w, dpi, join(out, `out-${dpi}.png`))
      const m = process.memoryUsage()
      const metrics = app.getAppMetrics().map(x => ({ type: x.type, peakKB: x.memory.peakWorkingSetSize }))
      console.log(JSON.stringify({ dpi, ms, nodeRssMB: Math.round(m.rss / 1e6), metrics }))
    }
    w.destroy()
  }
  app.quit()
}).catch(e => { console.error('FAILED', e); app.exit(1) })
