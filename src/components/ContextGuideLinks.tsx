import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Language } from '../i18n/messages'
import './context-guide-links.css'

type ContextSlots = {
  timeMachine: HTMLElement | null
  experimentModal: HTMLElement | null
  experimentDetail: HTMLElement | null
  data: HTMLElement | null
}

type GuideContext = 'time-machine' | 'experiments' | 'import-export'

export function guideContextHref(locale: Language, context: GuideContext) {
  return `/guide/${locale}/${context}/`
}

function GuideBookIcon() {
  return (
    <svg
      className="context-guide-icon"
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

function ContextLink({
  locale,
  context,
  placement,
}: {
  locale: Language
  context: GuideContext
  placement: 'time-machine' | 'experiment-modal' | 'experiment-detail' | 'data'
}) {
  const label =
    locale === 'ko'
      ? `${context === 'time-machine' ? 'Time Machine' : context === 'experiments' ? '실험' : '가져오기와 내보내기'} 가이드 새 탭에서 열기`
      : `Open ${context === 'time-machine' ? 'Time Machine' : context === 'experiments' ? 'Experiments' : 'Import & Export'} Guide in a new tab`

  return (
    <a
      className={`context-guide-link context-guide-link--${placement}`}
      href={guideContextHref(locale, context)}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      title={label}
    >
      <GuideBookIcon />
      <span>GUIDE</span>
      <span className="context-guide-external" aria-hidden="true">↗</span>
    </a>
  )
}

function sameSlots(a: ContextSlots, b: ContextSlots) {
  return (
    a.timeMachine === b.timeMachine &&
    a.experimentModal === b.experimentModal &&
    a.experimentDetail === b.experimentDetail &&
    a.data === b.data
  )
}

function ensurePortalSlot(host: HTMLElement | null, className: string) {
  if (!host) return null

  const existing = Array.from(host.children).find(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && child.classList.contains(className),
  )
  if (existing) return existing

  const slot = document.createElement('span')
  slot.className = `context-guide-portal-slot ${className}`
  slot.setAttribute('data-context-guide-slot', '')
  host.append(slot)
  return slot
}

export default function ContextGuideLinks({ locale }: { locale: Language }) {
  const [slots, setSlots] = useState<ContextSlots>({
    timeMachine: null,
    experimentModal: null,
    experimentDetail: null,
    data: null,
  })

  useEffect(() => {
    let frame = 0

    const refresh = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const next: ContextSlots = {
          timeMachine: ensurePortalSlot(
            document.querySelector<HTMLElement>('.tm-panel > header'),
            'context-guide-slot--time-machine',
          ),
          experimentModal: ensurePortalSlot(
            document.querySelector<HTMLElement>('.experiment-modal'),
            'context-guide-slot--experiment-modal',
          ),
          experimentDetail: ensurePortalSlot(
            document.querySelector<HTMLElement>(
              '.experiment-detail .wide-workspace__header-actions',
            ),
            'context-guide-slot--experiment-detail',
          ),
          data: ensurePortalSlot(
            document.querySelector<HTMLElement>(
              '.app > .sidebar .data-section-title',
            ),
            'context-guide-slot--data',
          ),
        }

        setSlots((current) => (sameSlots(current, next) ? current : next))
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

      document
        .querySelectorAll<HTMLElement>('[data-context-guide-slot]')
        .forEach((slot) => slot.remove())
    }
  }, [])

  return (
    <>
      {slots.timeMachine &&
        createPortal(
          <ContextLink locale={locale} context="time-machine" placement="time-machine" />,
          slots.timeMachine,
        )}

      {slots.experimentModal &&
        createPortal(
          <ContextLink locale={locale} context="experiments" placement="experiment-modal" />,
          slots.experimentModal,
        )}

      {slots.experimentDetail &&
        createPortal(
          <ContextLink locale={locale} context="experiments" placement="experiment-detail" />,
          slots.experimentDetail,
        )}

      {slots.data &&
        createPortal(
          <ContextLink locale={locale} context="import-export" placement="data" />,
          slots.data,
        )}
    </>
  )
}
