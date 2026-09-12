import sharp from 'sharp'
import opentype from 'opentype.js'
import { readFile, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
const require = createRequire(import.meta.url)
// Serialize commands directly: the font library's path optimizer can emit NaN
// for consecutive quadratic curves. Never publish an incomplete glyph path.
export function textPath(font, text, x, y, size, color) {
  const shape = font.getPath(text,x,y,size,{kerning:false})
  const keys = { M:['x','y'], L:['x','y'], Q:['x1','y1','x','y'], C:['x1','y1','x2','y2','x','y'], Z:[] }
  const d = shape.commands.map(command => {
    const values = keys[command.type].map(key => {
      if (!Number.isFinite(command[key])) throw new Error('Invalid OG glyph coordinate')
      return command[key].toFixed(2)
    })
    return command.type + values.join(' ')
  }).join(' ')
  return `<path fill="${color}" d="${d}"/>`
}
let cachedFont
let cachedLogo
async function getLogoMarkup() {
  if (!cachedLogo) {
    const source = await readFile(join(process.cwd(), 'public/favicon.svg'), 'utf8')
    const match = source.match(/<g[\s\S]*<\/g>/)
    if (!match) throw new Error('Accordbook logo asset is missing')
    cachedLogo = match[0]
  }
  return cachedLogo
}
async function getFont() {
  if (!cachedFont) {
    const data = await readFile(join(dirname(require.resolve('@fontsource/libre-baskerville/package.json')), 'files/libre-baskerville-latin-400-normal.woff'))
    cachedFont = opentype.parse(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))
  }
  return cachedFont
}
export function wrapText(font, text, size, width) {
  const lines = []; let line = ''
  for (const word of text.trim().split(/\s+/)) {
    if (font.getAdvanceWidth(word,size,{kerning:false}) > width) throw new Error('OG word exceeds safe width')
    const candidate = line ? line + ' ' + word : word
    if (font.getAdvanceWidth(candidate,size,{kerning:false}) > width) { lines.push(line); line = word } else line = candidate
  }
  if (line) lines.push(line)
  return lines
}
export async function layoutOg(drop) {
  const font = await getFont()
  for (const character of drop.title + (drop.subtitle || '')) if (!/\s/.test(character) && !font.charToGlyphIndex(character)) throw new Error('Unsupported OG glyph; provide a custom og-source.png')
  for (const size of [58,54,50,46,42,38,34]) {
    let lines
    try { lines = wrapText(font,drop.title,size,1040) } catch { continue }
    if (lines.length <= 4 && lines.length * size * 1.22 <= 245) {
      const subtitle = drop.subtitle ? wrapText(font,drop.subtitle,28,900) : []
      if (subtitle.length > 3) throw new Error('OG subtitle exceeds three lines')
      return {font,size,lines,subtitle}
    }
  }
  throw new Error('OG title cannot fit legibly; supply og-source.png')
}
export async function generateOg(drop, customPath, output) {
  let custom
  try { custom = await stat(customPath) } catch (error) { if (error.code !== 'ENOENT') throw error }
  if (custom) {
    if (!custom.isFile() || custom.size > 10 * 1024 * 1024) throw new Error('Custom OG must be under 10 MB')
    const image = sharp(customPath,{limitInputPixels:40000000}); const meta = await image.metadata()
    if (meta.format !== 'png' || (meta.pages || 1) !== 1 || meta.width < 600 || meta.height < 315) throw new Error('Custom OG must be one PNG of at least 600 × 315')
    await image.rotate().resize(1200,630,{fit:'cover',position:'centre'}).png().toFile(output)
    return 'CUSTOM'
  }
  const {font,size,lines,subtitle} = await layoutOg(drop)
  const logo = await getLogoMarkup()
  const path = (text,x,y,fontSize,color) => textPath(font,text,x,y,fontSize,color)
  const titleY = 204
  const titleBottom = titleY + (lines.length - 1) * size * 1.22 + size
  const subtitleY = Math.min(440, Math.max(300, titleBottom + 42))
  const number = drop.slug ? 'NO. ' + drop.slug : 'ARCHIVE'
  const descriptor = 'A PUBLIC FORMULA STUDY'
  const numberSize = 29
  const descriptorSize = 22
  const subtitleSize = 28
  const numberX = 1120 - font.getAdvanceWidth(number,numberSize,{kerning:false})
  const descriptorX = 1120 - font.getAdvanceWidth(descriptor,descriptorSize,{kerning:false})
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#e8e1d5"/><path d="M32 115H1168M32 534H1168" stroke="#bdb1a1"/><svg x="860" y="205" width="280" height="280" viewBox="0 0 512 512" opacity="0.055">${logo}</svg>${path('FORMULA DROP',80,80,25,'#6f527f')}${path(number,numberX,80,numberSize,'#6f527f')}${lines.map((line,i)=>path(line,80,titleY+i*size*1.22,size,'#332d27')).join('')}${subtitle.map((line,i)=>path(line,80,subtitleY+i*34,subtitleSize,'#5f5348')).join('')}${path('ACCORDBOOK',80,582,30,'#332d27')}${path(descriptor,descriptorX,582,descriptorSize,'#5f5348')}</svg>`
  await sharp(Buffer.from(svg)).png().toFile(output)
  return 'AUTO'
}
