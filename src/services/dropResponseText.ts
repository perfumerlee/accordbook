/** Read at most the limit in bytes, including responses without Content-Length. */
export async function dropResponseText(response: Response, limit: number): Promise<string> {
  if (Number(response.headers.get('content-length')) > limit) throw new Error('package_too_large')
  if (!response.body) throw new Error('package_unavailable')
  const reader = response.body.getReader(); const decoder = new TextDecoder('utf-8', { fatal: true }); let bytes = 0; let text = ''
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break
      bytes += next.value.byteLength
      if (bytes > limit) { await reader.cancel(); throw new Error('package_too_large') }
      text += decoder.decode(next.value, { stream: true })
    }
    return text + decoder.decode()
  } finally { reader.releaseLock() }
}
