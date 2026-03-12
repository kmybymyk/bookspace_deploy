import type { TFunction } from 'i18next'
import type { CopilotActivityEntry } from './rightPaneTypes'

interface RightPaneActivityTimelineProps {
    t: TFunction
    activity: CopilotActivityEntry[]
    summary?: string | null
}

function formatActivityTime(value: string): string {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return new Intl.DateTimeFormat(undefined, {
        hour: 'numeric',
        minute: '2-digit',
    }).format(date)
}

function toneClass(tone: CopilotActivityEntry['tone']): string {
    if (tone === 'success') return 'border-emerald-700/40 bg-emerald-950/25 text-emerald-100'
    if (tone === 'warning') return 'border-amber-700/40 bg-amber-950/25 text-amber-100'
    if (tone === 'error') return 'border-rose-700/40 bg-rose-950/25 text-rose-100'
    if (tone === 'info') return 'border-sky-700/40 bg-sky-950/25 text-sky-100'
    return 'border-neutral-700 bg-neutral-900 text-neutral-200'
}

export function RightPaneActivityTimeline({
    t,
    activity,
    summary,
}: RightPaneActivityTimelineProps) {
    if (activity.length === 0 && !summary) return null

    const items = [...activity].slice(-6).reverse()

    return (
        <div className="rounded-2xl border border-neutral-800/90 bg-[linear-gradient(180deg,rgba(17,24,39,0.92),rgba(10,13,18,0.96))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
                    {t('rightPane.activityTitle')}
                </div>
                {summary ? (
                    <div className="rounded-full border border-neutral-700/80 bg-neutral-900/70 px-2 py-0.5 text-[11px] text-neutral-300">
                        {summary}
                    </div>
                ) : null}
            </div>
            {items.length > 0 ? (
                <div className="mt-3 space-y-2">
                    {items.map((entry) => (
                        <div key={entry.id} className={`rounded-xl border px-2.5 py-2 ${toneClass(entry.tone)}`}>
                            <div className="flex items-start justify-between gap-2">
                                <div className="text-xs font-medium leading-4">{entry.label}</div>
                                <div className="shrink-0 text-[10px] uppercase tracking-[0.08em] text-current/60">
                                    {formatActivityTime(entry.createdAt)}
                                </div>
                            </div>
                            {entry.detail ? (
                                <div className="mt-1 text-[11px] leading-4 opacity-90">{entry.detail}</div>
                            ) : null}
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    )
}
