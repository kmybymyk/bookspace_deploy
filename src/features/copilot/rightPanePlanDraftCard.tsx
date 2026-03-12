import type { TFunction } from 'i18next'
import type { CopilotPlanDraft } from './rightPaneTypes'

interface RightPanePlanDraftCardProps {
    t: TFunction
    planDraft: CopilotPlanDraft
    copilotBusy: boolean
    onCancel: () => void
    onGeneratePreview: () => void
}

function intentLabel(intent: CopilotPlanDraft['resolvedIntent'], t: TFunction): string {
    if (intent === 'rewrite_selection') return t('rightPane.intent.rewriteSelection')
    if (intent === 'append_text') return t('rightPane.intent.appendText')
    if (intent === 'find_replace') return t('rightPane.intent.findReplace')
    if (intent === 'save_project') return t('rightPane.intent.saveProject')
    if (intent === 'rename_chapter') return t('rightPane.intent.renameChapter')
    if (intent === 'delete_chapter') return t('rightPane.intent.deleteChapter')
    if (intent === 'move_chapter') return t('rightPane.intent.moveChapter')
    if (intent === 'set_chapter_type') return t('rightPane.intent.setChapterType')
    if (intent === 'set_typography') return t('rightPane.intent.setTypography')
    if (intent === 'set_page_background') return t('rightPane.intent.setPageBackground')
    if (intent === 'apply_theme') return t('rightPane.intent.applyTheme')
    if (intent === 'update_book_info') return t('rightPane.intent.updateBookInfo')
    if (intent === 'set_cover_asset') return t('rightPane.intent.setCoverAsset')
    if (intent === 'export_project') return t('rightPane.intent.exportProject')
    if (intent === 'restore_snapshot') return t('rightPane.intent.restoreSnapshot')
    if (intent === 'create_chapter') return t('rightPane.intent.createChapter')
    if (intent === 'insert_table') return t('rightPane.intent.insertTable')
    if (intent === 'insert_illustration') return t('rightPane.intent.insertIllustration')
    return t('rightPane.intent.feedbackReport')
}

export function RightPanePlanDraftCard({
    t,
    planDraft,
    copilotBusy,
    onCancel,
    onGeneratePreview,
}: RightPanePlanDraftCardProps) {
    return (
        <div className="rounded-2xl border border-sky-500/30 bg-[linear-gradient(180deg,rgba(14,165,233,0.14),rgba(10,13,18,0.96)_65%)] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-200/80">
                {t('rightPane.planDraftTitle')}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[11px] text-sky-100">
                    {intentLabel(planDraft.resolvedIntent, t)}
                </span>
                <span className="text-[11px] text-sky-200/80">
                    {t('rightPane.planNextStepHint')}
                </span>
            </div>
            <div className="mt-2 text-sm font-medium leading-5 text-sky-50 whitespace-pre-wrap break-words">
                {planDraft.prompt}
            </div>
            <div className="mt-3 flex justify-end gap-2">
                <button
                    onClick={onCancel}
                    disabled={copilotBusy}
                    className="rounded-lg border border-neutral-700 bg-neutral-900/80 px-2.5 py-1.5 text-xs text-neutral-200 transition hover:bg-neutral-800 disabled:opacity-60"
                >
                    {t('rightPane.planCancel')}
                </button>
                <button
                    onClick={onGeneratePreview}
                    disabled={copilotBusy}
                    className="rounded-lg bg-sky-600 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-sky-500 disabled:opacity-60"
                >
                    {t('rightPane.planGeneratePreview')}
                </button>
            </div>
        </div>
    )
}
