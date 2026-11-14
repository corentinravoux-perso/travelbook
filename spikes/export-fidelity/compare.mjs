// Mean absolute pixel difference (% of 255) between pdftoppm render and Chromium capture, after resampling to the same size.
import sharp from 'sharp'
import { execFileSync } from 'node:child_process'
const [pdf, png, dpi = '300'] = process.argv.slice(2)
execFileSync('pdftoppm', ['-r', dpi, '-png', '-singlefile', pdf, 'out/ppm-' + dpi])
const a = sharp('out/ppm-' + dpi + '.png'), b = sharp(png)
const [ma, mb] = [await a.metadata(), await b.metadata()]
console.log(`pdftoppm ${ma.width}x${ma.height}, capture ${mb.width}x${mb.height}`)
const W = mb.width, H = mb.height
const raw = async s => (await s.clone().removeAlpha().resize(W, H, { fit: 'fill' }).raw().toBuffer())
const [ra, rb] = [await raw(a), await raw(b)]
let sum = 0
for (let i = 0; i < ra.length; i++) sum += Math.abs(ra[i] - rb[i])
console.log(`MAE ${(sum / ra.length).toFixed(3)} / 255 = ${(100 * sum / ra.length / 255).toFixed(3)} %`)
