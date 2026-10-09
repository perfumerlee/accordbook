import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { validAiToken } from '../services/aiClient'
import PaletteDialog from './PaletteDialog'

interface TokenAccess { token: string; connected: boolean; connect: (value: string) => boolean; disconnect: () => void; openDialog: (language: 'en' | 'ko') => void }
const Context = createContext<TokenAccess>({ token: '', connected: false, connect: () => false, disconnect: () => {}, openDialog: () => {} })
export const useAiAccessToken = () => useContext(Context)
export function AiAccessTokenProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(''), [language, setLanguage] = useState<'en' | 'ko'>()
  const connect = useCallback((value: string) => { const candidate = value.trim(); if (!validAiToken(candidate)) return false; setToken(candidate); return true }, [])
  const disconnect = useCallback(() => setToken(''), [])
  const value = useMemo(() => ({ token, connected: !!token, connect, disconnect, openDialog: setLanguage }), [token, connect, disconnect])
  return <Context.Provider value={value}>{children}{language && <AiAccessTokenDialog language={language} onClose={() => setLanguage(undefined)} />}</Context.Provider>
}
function AiAccessTokenDialog({ language, onClose }: { language: 'en' | 'ko'; onClose: () => void }) {
  const access = useAiAccessToken(), input = useRef<HTMLInputElement>(null), [error, setError] = useState(false), ko = language === 'ko'
  return <PaletteDialog title="AI Access Token" onClose={onClose}><div className="palette-token"><p>{ko ? '토큰은 현재 세션의 메모리에만 유지됩니다.' : 'The token is kept in memory for this session only.'}</p>{access.connected ? <><p role="status">● {ko ? '연결됨' : 'Connected'}</p><button className="btn" onClick={() => { access.disconnect(); setError(false) }}>{ko ? '연결 해제' : 'Disconnect'}</button></> : <form onSubmit={event => { event.preventDefault(); const candidate = input.current?.value ?? ''; if (input.current) input.current.value = ''; setError(!access.connect(candidate)) }}><label htmlFor="palette-token-input">Beta access token</label><div className="palette-token-row"><input id="palette-token-input" ref={input} type="password" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={128} autoFocus /><button className="btn primary" type="submit">{ko ? '연결' : 'Connect'}</button></div>{error && <p role="alert">{ko ? '유효한 토큰을 입력해 주세요.' : 'Enter a valid token.'}</p>}</form>}</div></PaletteDialog>
}
export function AiAccessTokenButton({ language }: { language: 'en' | 'ko' }) {
  const access = useAiAccessToken()
  return <button type="button" className="btn" onClick={() => access.openDialog(language)}>AI Access Token {access.connected ? '●' : '○'}</button>
}
