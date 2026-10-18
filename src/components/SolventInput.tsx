import { useEffect, useId, useRef, useState, type KeyboardEvent, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { getSolventSuggestions } from '../services/solventDictionary'
import { solventInputMessages, type Language } from '../i18n/messages'
import './solventInput.css'

export interface SolventInputProps {
  value: string
  onChange: (value: string) => void
  language: Language
  id?: string
  ariaLabel: string
  disabled?: boolean
  className?: string
  ariaInvalid?: boolean
  ariaDescribedBy?: string
  onEscapeSuggestions?: () => void
}

/** A free-text solvent input with optional, explicitly selected dictionary suggestions. */
export default function SolventInput({ value, onChange, language, id, ariaLabel, disabled = false, className = '', ariaInvalid, ariaDescribedBy, onEscapeSuggestions }: SolventInputProps) {
  const generatedId = useId().replace(/:/g, '')
  const inputId = id ?? `solvent-input-${generatedId}`
  const listId = `${inputId}-suggestions`
  const input = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [dialogTarget, setDialogTarget] = useState<HTMLDialogElement | null>(null)
  const [floatingStyle, setFloatingStyle] = useState<CSSProperties>()
  const suggestions = disabled ? [] : getSolventSuggestions(value)
  const suggestionsOpen = focused && suggestions.length > 0
  const labels = solventInputMessages[language]

  useEffect(() => {
    const dialog = input.current?.closest('dialog')
    setDialogTarget(dialog instanceof HTMLDialogElement ? dialog : null)
  }, [])

  useEffect(() => { setActiveIndex(-1) }, [value])

  useEffect(() => {
    if (!dialogTarget || !suggestionsOpen) return
    const position = () => {
      const rect = input.current?.getBoundingClientRect()
      if (!rect) return
      const viewportWidth = window.visualViewport?.width ?? window.innerWidth
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight
      const maxWidth = Math.max(0, viewportWidth - 16)
      const width = Math.min(rect.width, maxWidth)
      const left = Math.max(8, Math.min(rect.left, viewportWidth - width - 8))
      const spaceBelow = viewportHeight - rect.bottom - 8
      const spaceAbove = rect.top - 8
      const opensAbove = spaceBelow < 160 && spaceAbove > spaceBelow
      const maxHeight = Math.max(80, Math.min(240, opensAbove ? spaceAbove : spaceBelow))
      setFloatingStyle({ left, width, maxHeight, ...(opensAbove ? { bottom: viewportHeight - rect.top + 4 } : { top: rect.bottom + 4 }) })
    }
    position()
    window.addEventListener('scroll', position, true)
    window.addEventListener('resize', position)
    window.visualViewport?.addEventListener('scroll', position)
    window.visualViewport?.addEventListener('resize', position)
    return () => {
      window.removeEventListener('scroll', position, true)
      window.removeEventListener('resize', position)
      window.visualViewport?.removeEventListener('scroll', position)
      window.visualViewport?.removeEventListener('resize', position)
    }
  }, [dialogTarget, suggestionsOpen, suggestions.length])

  const select = (code: string) => {
    onChange(code)
    setActiveIndex(-1)
    setFocused(false)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return
    if (!suggestionsOpen) {
      if (event.key === 'Escape') setFocused(false)
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex(index => index < 0 ? 0 : Math.min(index + 1, suggestions.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex(index => index < 0 ? suggestions.length - 1 : Math.max(index - 1, 0))
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault()
      event.stopPropagation()
      select(suggestions[activeIndex].code)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onEscapeSuggestions?.()
      setActiveIndex(-1)
      setFocused(false)
    } else if (event.key === 'Tab') {
      setActiveIndex(-1)
      setFocused(false)
    }
  }

  const list = <div
    id={listId}
    className={`solvent-suggestions${dialogTarget ? ' is-floating' : ''}`}
    role="listbox"
    aria-label={labels.suggestionsLabel}
    hidden={!suggestionsOpen}
    style={dialogTarget ? floatingStyle : undefined}
  >{suggestions.map((definition, index) => <div
    id={`${listId}-option-${index}`}
    key={definition.code}
    className={`solvent-suggestion${index === activeIndex ? ' is-active' : ''}`}
    role="option"
    aria-selected={index === activeIndex}
    aria-label={`${labels.useCode}: ${definition.code} — ${definition.fullName}`}
    onPointerDown={event => { event.preventDefault() }}
    onMouseDown={event => { event.preventDefault() }}
    onClick={event => { event.preventDefault(); select(definition.code) }}
  >{definition.code} — {definition.fullName}</div>)}</div>

  return <div className={`solvent-input-shell ${className}`.trim()}>
    <input
      ref={input}
      id={inputId}
      data-solvent-input="true"
      className="solvent-input"
      type="text"
      role="combobox"
      aria-label={ariaLabel}
      aria-invalid={ariaInvalid}
      aria-describedby={ariaDescribedBy}
      aria-autocomplete="list"
      aria-haspopup="listbox"
      aria-expanded={suggestionsOpen}
      aria-controls={listId}
      aria-activedescendant={suggestionsOpen && activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined}
      value={value}
      disabled={disabled}
      onFocus={() => { setFocused(true); setActiveIndex(-1) }}
      onBlur={() => { setFocused(false); setActiveIndex(-1) }}
      onChange={event => { setFocused(true); setActiveIndex(-1); onChange(event.target.value) }}
      onKeyDown={handleKeyDown}
    />
    <span className="solvent-suggestion-announcement" role="status" aria-live="polite" aria-atomic="true">
      {suggestionsOpen ? labels.suggestionsAvailable(suggestions.length) : ''}
    </span>
    {dialogTarget ? createPortal(list, dialogTarget) : list}
  </div>
}
