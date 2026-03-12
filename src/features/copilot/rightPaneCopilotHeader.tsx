import { ChevronDown, ChevronUp, Plus } from 'lucide-react'
import type { TFunction } from 'i18next'
import type { CopilotTurnState } from './rightPaneTypes'

interface RightPaneCopilotHeaderProps {
    t: TFunction
    activeThreadLabel: string
    turnState: CopilotTurnState
    turnStateLabel: string
    copilotBusy: boolean
    copilotApplying: boolean
    canCreateNewChat: boolean
    shouldShowThreadManager: boolean
    canToggleThreadManager: boolean
    onCreateThread: () => void
    onToggleThreadManager: () => void
}

export function RightPaneCopilotHeader({
    t,
    activeThreadLabel,
    turnState,
    turnStateLabel,
    copilotBusy,
    copilotApplying,
    canCreateNewChat,
    shouldShowThreadManager,
    canToggleThreadManager,
    onCreateThread,
    onToggleThreadManager,
}: RightPaneCopilotHeaderProps) {
    const isDefaultThreadLabel = /^thread\s+\d+$/i.test(activeThreadLabel.trim())
    const shouldShowStatus =
        turnState === 'planning' ||
        turnState === 'streaming' ||
        copilotApplying

    const turnToneClass =
        copilotApplying
            ? 'border-sky-500/40 bg-sky-500/12 text-sky-100'
            : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'

    return (
        <div className="rounded-2xl border border-neutral-800 bg-[linear-gradient(180deg,rgba(20,184,166,0.14),rgba(13,15,19,0.92)_40%,rgba(13,15,19,0.98)_100%)] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_12px_30px_rgba(0,0,0,0.22)]">
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                        {!isDefaultThreadLabel ? (
                            <span className="truncate text-sm font-semibold text-neutral-50">{activeThreadLabel}</span>
                        ) : null}
                        {shouldShowStatus ? (
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${turnToneClass}`}>
                                {turnStateLabel}
                            </span>
                        ) : null}
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                <button
                    onClick={onCreateThread}
                    disabled={copilotBusy || copilotApplying || !canCreateNewChat}
                    title={t('rightPane.threadNew')}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-900/80 text-neutral-300 transition hover:border-neutral-600 hover:bg-neutral-800 hover:text-white disabled:opacity-60"
                >
                    <Plus size={13} />
                </button>
                <button
                    onClick={onToggleThreadManager}
                    title={shouldShowThreadManager ? t('common.close') : t('rightPane.threadListLabel')}
                    disabled={!canToggleThreadManager}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-900/80 text-neutral-300 transition hover:border-neutral-600 hover:bg-neutral-800 hover:text-white"
                >
                    {shouldShowThreadManager ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
                </div>
            </div>
        </div>
    )
}
