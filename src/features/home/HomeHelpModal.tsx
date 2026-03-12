import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import DsButton from '../../components/ui/ds/DsButton'
import { BookOpenText, CircleHelp, FileInput, ShieldCheck } from 'lucide-react'

interface HomeHelpModalProps {
  open: boolean
  onClose: () => void
  onQuickStart: () => void
  onOpenFile: () => Promise<void>
  onNewProject: () => void
}

export default function HomeHelpModal({ open, onClose, onQuickStart, onOpenFile, onNewProject }: HomeHelpModalProps) {
  const { t } = useTranslation()
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const titleId = 'home-help-title'
  const descId = 'home-help-desc'

  const helpSections = [
    {
      title: t('home.helpSectionStartTitle'),
      items: [t('home.helpStart1'), t('home.helpStart2')],
      icon: BookOpenText,
    },
    {
      title: t('home.helpSectionSafeTitle'),
      items: [t('home.helpSafe1'), t('home.helpSafe2')],
      icon: ShieldCheck,
    },
    {
      title: t('home.helpSectionIOTitle'),
      items: [t('home.helpIO1'), t('home.helpIO2')],
      icon: FileInput,
    },
  ]

  useEffect(() => {
    if (!open) return
    const container = dialogRef.current
    if (!container) return
    const focusableSelector =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    const focusable = Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter(
      (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true',
    )
    focusable[0]?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const activeElement = document.activeElement as HTMLElement | null
      if (event.shiftKey && activeElement === first) {
        event.preventDefault()
        last.focus()
        return
      }
      if (!event.shiftKey && activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    container.addEventListener('keydown', handleKeyDown)
    return () => {
      container.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose, open])

  if (!open) return null

  return (
    <div className="ds-overlay fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="ds-modal w-full max-w-3xl p-5 md:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id={titleId} className="inline-flex items-center gap-1.5 text-base font-semibold text-[var(--ds-text-neutral-primary)] md:text-lg">
          <CircleHelp size={16} />
          {t('home.helpTitle')}
        </h3>
        <p id={descId} className="mt-1 text-sm text-[var(--ds-text-neutral-muted)]">{t('home.helpSubtitle')}</p>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          {helpSections.map((section) => (
            <div key={section.title} className="rounded-md border border-[var(--ds-border-neutral-subtle)] bg-[var(--ds-fill-neutral-card-alt)] p-3">
              <h4 className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--ds-text-neutral-secondary)]">
                <section.icon size={14} />
                {section.title}
              </h4>
              <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-[var(--ds-text-neutral-muted)]">
                {section.items.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-md border border-[var(--ds-border-neutral-subtle)] bg-[var(--ds-fill-neutral-card-alt)] p-3">
          <h4 className="text-sm font-semibold text-[var(--ds-text-neutral-secondary)]">{t('home.helpShortcutTitle')}</h4>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--ds-text-neutral-secondary)]">
            <span className="ds-kbd">Cmd/Ctrl + S</span>
            <span className="text-[var(--ds-text-neutral-muted)]">: {t('home.helpShortcutSave')}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--ds-text-neutral-secondary)]">
            <span className="ds-kbd">Cmd/Ctrl + Shift + V</span>
            <span className="text-[var(--ds-text-neutral-muted)]">: {t('home.helpShortcutHistory')}</span>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <DsButton
            onClick={() => {
              onClose()
              onQuickStart()
            }}
            className="py-2"
          >
            {t('home.quickStart')}
          </DsButton>
          <DsButton
            onClick={async () => {
              onClose()
              await onOpenFile()
            }}
            className="py-2"
          >
            {t('home.openFile')}
          </DsButton>
          <DsButton
            onClick={() => {
              onClose()
              onNewProject()
            }}
            className="py-2"
          >
            {t('home.newProject')}
          </DsButton>
        </div>

        <div className="mt-3 flex justify-end">
          <DsButton onClick={onClose} className="px-3 py-1.5">
            {t('common.close')}
          </DsButton>
        </div>
      </div>
    </div>
  )
}
