import { useMemo, useState } from 'react'
import { ChevronUp, CreditCard, LogOut, UserRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { SubscriptionPlan } from '../../../shared/entitlements'

interface LeftPaneAccountFooterProps {
    plan: SubscriptionPlan
    isSignedIn: boolean
    signedInLabel?: string | null
    authBusy?: boolean
    onUpgradeClick?: () => void
    onGoogleSignInClick?: () => void
    onSignOutClick?: () => void
}

export default function LeftPaneAccountFooter({
    plan,
    isSignedIn,
    signedInLabel,
    authBusy = false,
    onUpgradeClick,
    onGoogleSignInClick,
    onSignOutClick,
}: LeftPaneAccountFooterProps) {
    const { t } = useTranslation()
    const [expanded, setExpanded] = useState(false)

    const planLabel = useMemo(() => {
        if (plan === 'PRO') return t('titleBar.planPro')
        if (plan === 'PRO_LITE') return t('titleBar.planProLite')
        return t('titleBar.planFree')
    }, [plan, t])

    const accountLabel = signedInLabel || t('titleBar.signedIn')
    const planToneClass =
        plan === 'FREE'
            ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
            : 'border-sky-500/30 bg-sky-500/10 text-sky-200'

    return (
        <div className="border-t border-[var(--ds-border-subtle)] bg-[var(--ds-surface-panel)] p-3">
            <button
                type="button"
                onClick={() => setExpanded((prev) => !prev)}
                className="flex w-full items-center gap-2 rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-card-subtle)] px-3 py-2 text-left transition hover:bg-[var(--ds-fill-neutral-control)]"
            >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-card)] text-[var(--ds-text-neutral-muted)]">
                    <UserRound size={15} />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs text-[var(--ds-text-neutral-muted)]">
                        {accountLabel}
                    </span>
                    <span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${planToneClass}`}>
                        {planLabel}
                    </span>
                </span>
                <ChevronUp
                    size={14}
                    className={`shrink-0 text-[var(--ds-text-neutral-muted)] transition-transform ${expanded ? '' : 'rotate-180'}`}
                />
            </button>

            {expanded ? (
                <div className="mt-2 space-y-2 rounded-xl border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-card-subtle)] p-2">
                    {!isSignedIn ? (
                        <button
                            type="button"
                            onClick={onGoogleSignInClick}
                            disabled={authBusy}
                            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-[var(--ds-text-neutral-secondary)] transition hover:bg-[var(--ds-fill-neutral-control)] disabled:opacity-60"
                        >
                            <span>{authBusy ? t('titleBar.signInGoogleBusy') : t('titleBar.signInGoogle')}</span>
                        </button>
                    ) : null}

                    {plan === 'FREE' ? (
                        <button
                            type="button"
                            onClick={onUpgradeClick}
                            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-[var(--ds-text-neutral-secondary)] transition hover:bg-[var(--ds-fill-neutral-control)]"
                        >
                            <span>{t('titleBar.upgrade')}</span>
                            <CreditCard size={15} className="text-[var(--ds-text-neutral-muted)]" />
                        </button>
                    ) : null}

                    {isSignedIn ? (
                        <button
                            type="button"
                            onClick={onSignOutClick}
                            disabled={authBusy}
                            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-[var(--ds-text-neutral-secondary)] transition hover:bg-[var(--ds-fill-neutral-control)] disabled:opacity-60"
                        >
                            <span>{authBusy ? t('titleBar.signOutBusy') : t('titleBar.signOut')}</span>
                            <LogOut size={15} className="text-[var(--ds-text-neutral-muted)]" />
                        </button>
                    ) : null}
                </div>
            ) : null}
        </div>
    )
}
