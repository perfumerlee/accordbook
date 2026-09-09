export function formatFormulaDropDate(value: string | null, includeTime = false): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-US', includeTime
    ? { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZoneName: 'short', timeZone: 'Asia/Seoul' }
    : { month: 'short', day: 'numeric', timeZone: 'Asia/Seoul' }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? ''
  return includeTime ? `${get('month').toUpperCase()} ${get('day')} · ${get('hour')}:${get('minute')} KST` : `${get('month').toUpperCase()} ${get('day')}`
}
