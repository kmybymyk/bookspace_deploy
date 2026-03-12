import { useTranslation } from 'react-i18next'
import type { AiCommand, AiCommandEnvelope } from '../../../shared/aiCommandSchema'
import { useModalA11y } from '../../hooks/useModalA11y'
import DsButton from './ds/DsButton'
import { commandPreview as describeCommandPreview } from '../../features/copilot/rightPaneMessageRenderer'

interface CopilotPreviewModalProps {
    open: boolean
    envelope: AiCommandEnvelope | null
    applying?: boolean
    onApply: () => void
    onClose: () => void
}

function commandTitleKey(command: AiCommand): string {
    if (command.type === 'rewrite_selection') return 'centerPane.commandType.rewriteSelection'
    if (command.type === 'append_text') return 'centerPane.commandType.appendText'
    if (command.type === 'find_replace') return 'centerPane.commandType.findReplace'
    if (command.type === 'save_project') return 'centerPane.commandType.saveProject'
    if (command.type === 'rename_chapter') return 'centerPane.commandType.renameChapter'
    if (command.type === 'delete_chapter') return 'centerPane.commandType.deleteChapter'
    if (command.type === 'move_chapter') return 'centerPane.commandType.moveChapter'
    if (command.type === 'set_chapter_type') return 'centerPane.commandType.setChapterType'
    if (command.type === 'set_typography') return 'centerPane.commandType.setTypography'
    if (command.type === 'set_page_background') return 'centerPane.commandType.setPageBackground'
    if (command.type === 'apply_theme') return 'centerPane.commandType.applyTheme'
    if (command.type === 'update_book_info') return 'centerPane.commandType.updateBookInfo'
    if (command.type === 'set_cover_asset') return 'centerPane.commandType.setCoverAsset'
    if (command.type === 'export_project') return 'centerPane.commandType.exportProject'
    if (command.type === 'restore_snapshot') return 'centerPane.commandType.restoreSnapshot'
    if (command.type === 'create_chapter') return 'centerPane.commandType.createChapter'
    if (command.type === 'insert_table') return 'centerPane.commandType.insertTable'
    if (command.type === 'insert_illustration') return 'centerPane.commandType.insertIllustration'
    return 'centerPane.commandType.feedbackReport'
}

export default function CopilotPreviewModal({
    open,
    envelope,
    applying = false,
    onApply,
    onClose,
}: CopilotPreviewModalProps) {
    const { t } = useTranslation()
    const { rootRef, dialogRef } = useModalA11y(open, onClose)

    const commands = envelope?.commands ?? []
    const summary = envelope?.summary ?? ''
    const warnings = envelope?.warnings ?? []
    const commandRows = commands.map((command, index) => ({
        id: `${command.type}-${index}`,
        title: t(commandTitleKey(command)),
        preview: describeCommandPreview(command, t),
    }))

    if (!open || !envelope) return null

    return (
        <div
            ref={rootRef}
            data-bookspace-modal-root="true"
            className="ds-overlay fixed inset-0 z-[120] flex items-center justify-center p-4"
            onClick={onClose}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-label={t('centerPane.aiPreviewTitle')}
                tabIndex={-1}
                className="ds-modal w-full max-w-3xl overflow-hidden shadow-2xl"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="border-b border-[var(--ds-border-neutral-subtle)] px-4 py-3">
                    <h3 className="text-sm font-semibold text-[var(--ds-text-neutral-primary)]">
                        {t('centerPane.aiPreviewTitle')}
                    </h3>
                    <p className="mt-1 text-xs text-[var(--ds-text-neutral-muted)]">
                        {t('centerPane.aiPreviewSummary')}: {summary}
                    </p>
                    <p className="mt-1 text-xs text-[var(--ds-text-neutral-muted)]">
                        {t('centerPane.aiPreviewCommands', { count: commands.length })}
                    </p>
                    {warnings.length > 0 && (
                        <div className="mt-2 rounded-md border border-[var(--ds-border-warning-weak)] bg-[var(--ds-fill-warning-weak)] px-2 py-1.5">
                            <div className="text-xs font-semibold text-[var(--ds-text-warning-default)]">
                                {t('centerPane.aiPreviewWarningsLabel')}
                            </div>
                            <ul className="mt-1 space-y-0.5">
                                {warnings.map((warning, index) => (
                                    <li key={`warning-${index}`} className="text-xs text-[var(--ds-text-warning-default)]">
                                        - {warning}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>

                <div className="max-h-[52vh] overflow-auto px-4 py-3 space-y-3">
                    {commandRows.length === 0 ? (
                        <div className="text-xs text-[var(--ds-text-neutral-muted)]">
                            {t('centerPane.aiPreviewNoCommands')}
                        </div>
                    ) : (
                        commandRows.map((row) => (
                            <div
                                key={row.id}
                                className="rounded-md border border-[var(--ds-border-neutral-subtle)] bg-[var(--ds-fill-neutral-card)] p-3"
                            >
                                <div className="text-xs font-semibold text-[var(--ds-text-neutral-secondary)]">
                                    {row.title}
                                </div>
                                <pre className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-[var(--ds-text-neutral-secondary)]">
                                    {row.preview}
                                </pre>
                            </div>
                        ))
                    )}
                </div>

                <div className="flex justify-end gap-2 border-t border-[var(--ds-border-neutral-subtle)] px-4 py-3">
                    <DsButton
                        onClick={onClose}
                        disabled={applying}
                        className="px-3 py-1.5"
                    >
                        {t('common.close')}
                    </DsButton>
                    <DsButton
                        onClick={onApply}
                        disabled={applying || commands.length === 0}
                        variant="primary"
                        className="px-3 py-1.5"
                    >
                        {applying
                            ? t('centerPane.aiPreviewApplying')
                            : t('centerPane.aiPreviewApply')}
                    </DsButton>
                </div>
            </div>
        </div>
    )
}
