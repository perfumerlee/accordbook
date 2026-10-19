export const PALETTE_PASTE_LIMITS = Object.freeze({ maxRows: 10_000, maxColumns: 50, maxTextBytes: 1024 * 1024 })

export function parsePaletteTsv(text: string): string[][] {
  if (!text.trim()) throw new Error('Paste spreadsheet data / 스프레드시트 데이터를 붙여넣어 주세요.')
  if (new TextEncoder().encode(text).byteLength > PALETTE_PASTE_LIMITS.maxTextBytes) throw new Error('Paste data is limited to 1 MiB / 붙여넣기는 1 MiB까지 지원합니다.')
  const source = text.replace(/\r\n/g, '\n')
  if (source.includes('\r')) throw new Error('Unsupported line ending / 줄바꿈 형식을 확인해 주세요.')
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false, afterQuote = false
  const finishRow = () => {
    row.push(cell)
    if (row.some(value => value.trim())) rows.push(row)
    row = []; cell = ''; afterQuote = false
    if (rows.length > PALETTE_PASTE_LIMITS.maxRows + 1) throw new Error('Paste data is limited to 10,000 material rows / 원료는 최대 10,000행까지 붙여넣을 수 있습니다.')
  }
  for (let index = 0; index < source.length; index++) {
    const char = source[index]
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') { cell += '"'; index++ }
        else { quoted = false; afterQuote = true }
      } else cell += char
      continue
    }
    if (afterQuote) {
      if (char === '\t') { row.push(cell); cell = ''; afterQuote = false }
      else if (char === '\n') finishRow()
      else if (char === ' ' || char === '\t') { /* allow whitespace after a quoted cell */ }
      else throw new Error('Malformed quoted cell / 따옴표로 묶인 셀의 형식이 올바르지 않습니다.')
      continue
    }
    if (char === '"') {
      if (cell.length) throw new Error('Malformed quoted cell / 따옴표로 묶인 셀의 형식이 올바르지 않습니다.')
      quoted = true
    } else if (char === '\t') { row.push(cell); cell = '' }
    else if (char === '\n') finishRow()
    else cell += char
  }
  if (quoted) throw new Error('Unclosed quoted cell / 닫히지 않은 따옴표가 있습니다.')
  if (row.length || cell.length || afterQuote) finishRow()
  if (!rows.length) throw new Error('No material rows found / 원료 행을 찾을 수 없습니다.')
  if (rows.some(cells => cells.length > PALETTE_PASTE_LIMITS.maxColumns)) throw new Error('Paste data is limited to 50 columns / 붙여넣기는 최대 50열까지 지원합니다.')
  return rows
}

