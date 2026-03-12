import { useTranslation } from 'react-i18next'
import ChapterList from '../../features/chapters/components/ChapterList'
import { PanelLeftOpen, PanelLeftClose } from 'lucide-react'
import { useChapterStore } from '../../features/chapters/useChapterStore'
import type { SubscriptionPlan } from '../../../shared/entitlements'
import LeftPaneAccountFooter from './LeftPaneAccountFooter'

interface LeftPaneProps {
    collapsed?: boolean
    onToggleCollapse?: () => void
    showAccountFooter?: boolean
    plan?: SubscriptionPlan
    isSignedIn?: boolean
    signedInLabel?: string | null
    authBusy?: boolean
    onUpgradeClick?: () => void
    onGoogleSignInClick?: () => void
    onSignOutClick?: () => void
}

export default function LeftPane({
    collapsed = false,
    onToggleCollapse,
    showAccountFooter = false,
    plan = 'FREE',
    isSignedIn = false,
    signedInLabel = null,
    authBusy = false,
    onUpgradeClick,
    onGoogleSignInClick,
    onSignOutClick,
}: LeftPaneProps) {
    const { t } = useTranslation()
    const chapters = useChapterStore((state) => state.chapters)
    const hasPages = chapters.length > 0
    const frontCount = chapters.filter((chapter) => chapter.chapterType === 'front').length
    const backCount = chapters.filter((chapter) => chapter.chapterType === 'back').length
    const bodyCount = chapters.length - frontCount - backCount

    if (collapsed) {
        return (
            <aside data-left-pane="true" className="ds-panel ds-panel--left w-14 min-w-14 overflow-hidden select-none">
                <button
                    onClick={onToggleCollapse}
                    className="flex h-full w-full flex-col items-center justify-center gap-3 transition-colors hover:bg-[var(--ds-fill-neutral-control)]"
                    title={t('leftPane.expandSidebar')}
                >
                    <span className="ds-icon-button h-9 w-9 transition-transform duration-200 ease-out hover:scale-[1.03]">
                        <PanelLeftOpen size={18} />
                    </span>
                    <span className="text-[11px] font-medium text-[var(--ds-text-neutral-muted)]">{t('leftPane.structureShort')}</span>
                </button>
            </aside>
        )
    }

    return (
        <aside data-left-pane="true" className="ds-panel ds-panel--left relative flex w-[272px] min-w-[272px] flex-col overflow-hidden select-none">
            <div className="flex h-full min-h-0 w-[272px] min-w-[272px] shrink-0 flex-col">
                <div className="ds-panel-header flex shrink-0 flex-col gap-2 px-3 py-3">
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 text-base font-semibold text-[var(--ds-text-neutral-secondary)]">
                            {t('chapterList.title')}
                        </div>
                        <button
                            onClick={onToggleCollapse}
                            className="ds-icon-button h-7 px-2 transition-transform duration-200 ease-out hover:scale-[1.03]"
                            title={t('leftPane.collapseSidebar')}
                        >
                            <PanelLeftClose size={16} />
                        </button>
                    </div>
                    {hasPages ? (
                        <div className="grid grid-cols-3 gap-2 text-[11px]">
                            <div className="rounded-lg border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-card-subtle)] px-2.5 py-2">
                                <div className="text-[var(--ds-text-neutral-muted)]">{t('leftPane.structureFront')}</div>
                                <div className="text-[10px] text-[var(--ds-text-neutral-muted)]">{t('leftPane.pageCountLabel')}</div>
                                <div className="mt-1 font-semibold text-[var(--ds-text-neutral-secondary)]">{frontCount}</div>
                            </div>
                            <div className="rounded-lg border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-card-subtle)] px-2.5 py-2">
                                <div className="text-[var(--ds-text-neutral-muted)]">{t('leftPane.structureBody')}</div>
                                <div className="text-[10px] text-[var(--ds-text-neutral-muted)]">{t('leftPane.pageCountLabel')}</div>
                                <div className="mt-1 font-semibold text-[var(--ds-text-neutral-secondary)]">{bodyCount}</div>
                            </div>
                            <div className="rounded-lg border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-card-subtle)] px-2.5 py-2">
                                <div className="text-[var(--ds-text-neutral-muted)]">{t('leftPane.structureBack')}</div>
                                <div className="text-[10px] text-[var(--ds-text-neutral-muted)]">{t('leftPane.pageCountLabel')}</div>
                                <div className="mt-1 font-semibold text-[var(--ds-text-neutral-secondary)]">{backCount}</div>
                            </div>
                        </div>
                    ) : null}
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto">
                    <ChapterList />
                </div>
                {showAccountFooter ? (
                    <LeftPaneAccountFooter
                        plan={plan}
                        isSignedIn={isSignedIn}
                        signedInLabel={signedInLabel}
                        authBusy={authBusy}
                        onUpgradeClick={onUpgradeClick}
                        onGoogleSignInClick={onGoogleSignInClick}
                        onSignOutClick={onSignOutClick}
                    />
                ) : null}
            </div>
        </aside>
    )
}
