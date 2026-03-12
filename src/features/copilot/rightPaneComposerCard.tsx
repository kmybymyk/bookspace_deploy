import type { ReactNode, RefObject } from 'react'
import type { TFunction } from 'i18next'

interface RightPaneComposerCardProps {
    t: TFunction
    composerRef: RefObject<HTMLTextAreaElement | null>
    draft: string
    copilotBusy: boolean
    allowInputWhileBusy?: boolean
    onDraftChange: (value: string) => void
    onComposerInput: (element: HTMLTextAreaElement) => void
    onSubmit: () => void
    controls: ReactNode
    isPrimary?: boolean
}

export function RightPaneComposerCard({
    t,
    composerRef,
    draft,
    copilotBusy,
    allowInputWhileBusy = false,
    onDraftChange,
    onComposerInput,
    onSubmit,
    controls,
    isPrimary = false,
}: RightPaneComposerCardProps) {
    return (
        <div
            className={`rounded-2xl border bg-[linear-gradient(180deg,rgba(18,22,30,0.96),rgba(11,14,20,0.98))] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_-8px_24px_rgba(0,0,0,0.18)] ${
                isPrimary ? 'border-neutral-700 p-4' : 'border-neutral-700/90 p-3'
            }`}
        >
            <textarea
                ref={composerRef}
                data-testid="copilot-composer-input"
                value={draft}
                onChange={(event) => onDraftChange(event.target.value)}
                onInput={(event) => onComposerInput(event.currentTarget)}
                onKeyDown={(event) => {
                    if (event.nativeEvent.isComposing) return
                    if (event.key !== 'Enter' || event.shiftKey) return
                    event.preventDefault()
                    onSubmit()
                }}
                disabled={copilotBusy && !allowInputWhileBusy}
                rows={isPrimary ? 3 : 1}
                placeholder={t('centerPane.aiChatPlaceholder')}
                className={`max-h-[156px] w-full resize-none overflow-y-auto rounded-xl border border-neutral-700/90 bg-neutral-950/80 px-3 text-sm text-neutral-50 outline-none transition focus:border-teal-500/70 focus:bg-neutral-950 disabled:opacity-60 [scrollbar-color:rgba(115,115,115,0.55)_transparent] [scrollbar-width:thin] ${
                    isPrimary ? 'min-h-[96px] py-3 leading-6' : 'h-9 py-2'
                }`}
            />
            <div className="mt-3">{controls}</div>
        </div>
    )
}
