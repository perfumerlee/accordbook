import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Language } from '../i18n/messages'
import './guide-entry-link.css'
import ContextGuideLinks from './ContextGuideLinks'

function currentLocale(): Language {
  const htmlLocale = document.documentElement.lang
  if (htmlLocale === 'ko' || htmlLocale === 'en') return htmlLocale

  try {
    return localStorage.getItem('accordbook.locale') === 'ko' ? 'ko' : 'en'
  } catch {
    return 'en'
  }
}

function useGuideEntryTargets() {
  const [targets, setTargets] = useState<{
    desktop: HTMLElement | null
    mobile: HTMLElement | null
  }>({ desktop: null, mobile: null })

  useEffect(() => {
    let frame = 0
    let mobileSlot: HTMLDivElement | null = null

    const ensureMobileSlot = () => {
      const sidebar = document.querySelector<HTMLElement>('.sidebar')
      const brandSub = sidebar?.querySelector<HTMLElement>(':scope > .brand-sub')

      if (!sidebar || !brandSub) return null

      if (!mobileSlot || !mobileSlot.isConnected) {
        mobileSlot = document.createElement('div')
        mobileSlot.className = 'guide-entry-mobile-slot'
        brandSub.insertAdjacentElement('afterend', mobileSlot)
      }

      return mobileSlot
    }

    const refresh = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const desktop = document.querySelector<HTMLElement>('.note-header .utility-actions')
        const mobile = ensureMobileSlot()

        setTargets((old) =>
          old.desktop === desktop && old.mobile === mobile
            ? old
            : { desktop, mobile },
        )
      })
    }

    refresh()

    const observer = new MutationObserver(refresh)
    observer.observe(document.body, { childList: true, subtree: true })

    window.addEventListener('resize', refresh)
    window.addEventListener('orientationchange', refresh)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', refresh)
      window.removeEventListener('orientationchange', refresh)
      mobileSlot?.remove()
    }
  }, [])

  return targets
}

function GuideBookIcon() {
  return (
    <svg
      className="guide-entry-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M4.5 5.25c2.65 0 4.7.62 7.5 2.1v11.4c-2.8-1.48-4.85-2.1-7.5-2.1V5.25Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19.5 5.25c-2.65 0-4.7.62-7.5 2.1v11.4c2.8-1.48 4.85-2.1 7.5-2.1V5.25Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function GuideLink({
  locale,
  mobile = false,
}: {
  locale: Language
  mobile?: boolean
}) {
  return (
    <a
      className={`guide-entry-link ${mobile ? 'guide-entry-link--mobile' : 'guide-entry-link--desktop'}`}
      href={`/guide/${locale}/`}
      aria-label={locale === 'ko' ? 'Accordbook 가이드 열기' : 'Open Accordbook Guide'}
    >
      <span className="guide-entry-main">
        <GuideBookIcon />
        <span>{locale === 'ko' ? '가이드' : 'GUIDE'}</span>
      </span>
      {mobile && <span className="guide-entry-arrow" aria-hidden="true">→</span>}
    </a>
  )
}

export default function GuideEntryLink() {
  const [locale, setLocale] = useState<Language>(() => currentLocale())
  const targets = useGuideEntryTargets()

  useEffect(() => {
    const syncLocale = () => setLocale(currentLocale())
    syncLocale()

    const observer = new MutationObserver(syncLocale)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['lang'],
    })

    return () => observer.disconnect()
  }, [])

  return (
    <>
      {targets.desktop && createPortal(<GuideLink locale={locale} />, targets.desktop)}
      {targets.mobile && createPortal(<GuideLink locale={locale} mobile />, targets.mobile)}
      <ContextGuideLinks locale={locale} />
    </>
  )
}
