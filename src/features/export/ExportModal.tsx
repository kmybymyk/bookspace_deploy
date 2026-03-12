import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BookMetadata, ExportFormat } from '../../types/project'
import { useModalA11y } from '../../hooks/useModalA11y'
import DsButton from '../../components/ui/ds/DsButton'
import DsInput from '../../components/ui/ds/DsInput'
import DsSelect from '../../components/ui/ds/DsSelect'
import DsTextarea from '../../components/ui/ds/DsTextarea'

interface Props {
    initialMetadata: BookMetadata
    initialEmbedFonts: boolean
    onExport: (
        metadata: BookMetadata,
        options: { format: ExportFormat; embedFonts: boolean },
    ) => void
    onClose: () => void
}

const INITIAL: BookMetadata = {
    title: '',
    subtitle: '',
    authors: [],
    isbn: '',
    language: 'ko',
    publisher: '',
    link: '',
    description: '',
}

type TextFieldKey = 'title' | 'subtitle' | 'publisher' | 'link' | 'description' | 'language'

export default function ExportModal({
    initialMetadata,
    initialEmbedFonts,
    onExport,
    onClose,
}: Props) {
    const { t } = useTranslation()
    const [meta, setMeta] = useState<BookMetadata>({ ...INITIAL, ...initialMetadata })
    const [embedFonts, setEmbedFonts] = useState(initialEmbedFonts)
    const [format, setFormat] = useState<ExportFormat>('epub3')
    const [errorMessage, setErrorMessage] = useState('')
    const { rootRef, dialogRef } = useModalA11y(true, onClose)
    const dialogTitleId = useId()
    const dialogDescriptionId = useId()
    const fieldIdPrefix = useId()
    const linkInputId = `${fieldIdPrefix}-url`
    const publishId = `${fieldIdPrefix}-publisher`
    const subtitleId = `${fieldIdPrefix}-subtitle`
    const embedFontsId = `${fieldIdPrefix}-embed-fonts`
    const descriptionId = `${fieldIdPrefix}-description`
    const languageId = `${fieldIdPrefix}-language`
    const titleId = `${fieldIdPrefix}-title`
    const isbnId = `${fieldIdPrefix}-isbn`

    const updateTextMeta = (key: TextFieldKey, value: string) =>
        setMeta((prev) => ({ ...prev, [key]: value }))

    const normalizeIsbn = (value: string) => value.replace(/[^0-9xX]/g, '').toUpperCase().slice(0, 13)

    const isDocx = format === 'docx'
    const isEpub = format === 'epub2' || format === 'epub3'

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (!meta.title.trim()) {
            setErrorMessage(t('exportModal.titleRequired'))
            return
        }
        setErrorMessage('')
        onExport(meta, { format, embedFonts: isDocx ? false : embedFonts })
    }

    const closeLabel = t('common.close', { defaultValue: '닫기' })
    const languageLabel = t('leftPane.language', { defaultValue: '언어' })

    return (
        <div
            ref={rootRef}
            data-bookspace-modal-root="true"
            className="ds-overlay fixed inset-0 z-[90] flex items-center justify-center p-4"
            onClick={onClose}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={dialogTitleId}
                aria-describedby={dialogDescriptionId}
                tabIndex={-1}
                className="ds-modal w-full max-w-lg overflow-y-auto shadow-2xl"
                onClick={(event) => event.stopPropagation()}
            >
                <p id={dialogDescriptionId} className="sr-only">
                    {t('exportModal.description', {
                        defaultValue: '내보내기 형식과 메타데이터를 지정하세요.',
                    })}
                </p>
                <div className="flex items-center justify-between gap-2 border-b border-[var(--ds-border-neutral-subtle)] px-4 py-3">
                    <h2 id={dialogTitleId} className="text-sm font-semibold text-[var(--ds-text-neutral-primary)]">
                        {t('export.title')}
                    </h2>
                    <DsButton
                        type="button"
                        variant="ghost"
                        onClick={onClose}
                        size="sm"
                        aria-label={closeLabel}
                    >
                        {closeLabel}
                    </DsButton>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="flex flex-col gap-3 px-4 py-3">
                        <div>
                            <label
                                htmlFor="export-format"
                                className="mb-1 block text-xs text-[var(--ds-text-neutral-muted)]"
                            >
                                {t('exportModal.format')}
                            </label>
                            <DsSelect
                                id="export-format"
                                value={format}
                                onChange={(event) => setFormat(event.target.value as ExportFormat)}
                                className="w-full"
                            >
                                <option value="docx">DOCX</option>
                                <option value="epub2">{t('exportModal.epub2Option')}</option>
                                <option value="epub3">{t('exportModal.epub3Option')}</option>
                            </DsSelect>
                        </div>
                        <div>
                            <label htmlFor={titleId} className="mb-1 block text-xs text-[var(--ds-text-neutral-muted)]">
                                {t('leftPane.title')}
                            </label>
                            <DsInput
                                id={titleId}
                                value={meta.title ?? ''}
                                onChange={(event) => updateTextMeta('title', event.target.value)}
                                placeholder={t('exportModal.titlePlaceholder')}
                                className="w-full"
                                autoComplete="off"
                                maxLength={120}
                            />
                        </div>

                        {isDocx ? (
                            <p className="text-xs text-[var(--ds-text-neutral-muted)]">
                                {t('exportModal.docxHint')}
                            </p>
                        ) : (
                            <>
                                <div>
                                    <label
                                        htmlFor={subtitleId}
                                        className="mb-1 block text-xs text-[var(--ds-text-neutral-muted)]"
                                    >
                                        {t('exportModal.subtitle')}
                                    </label>
                                    <DsInput
                                        id={subtitleId}
                                        value={meta.subtitle ?? ''}
                                        onChange={(event) => updateTextMeta('subtitle', event.target.value)}
                                        placeholder={t('exportModal.subtitle')}
                                        className="w-full"
                                    />
                                </div>
                                <div>
                                    <label
                                        htmlFor={publishId}
                                        className="mb-1 block text-xs text-[var(--ds-text-neutral-muted)]"
                                    >
                                        {t('exportModal.publisher')}
                                    </label>
                                    <DsInput
                                        id={publishId}
                                        value={meta.publisher ?? ''}
                                        onChange={(event) => updateTextMeta('publisher', event.target.value)}
                                        placeholder={t('exportModal.publisher')}
                                        className="w-full"
                                    />
                                </div>
                                <div>
                                    <label
                                        htmlFor={linkInputId}
                                        className="mb-1 block text-xs text-[var(--ds-text-neutral-muted)]"
                                    >
                                        {t('exportModal.link')}
                                    </label>
                                    <DsInput
                                        id={linkInputId}
                                        value={meta.link ?? ''}
                                        onChange={(event) => updateTextMeta('link', event.target.value)}
                                        placeholder={t('exportModal.link')}
                                        className="w-full"
                                        autoComplete="url"
                                        inputMode="url"
                                    />
                                </div>
                                <div>
                                    <label
                                        htmlFor={isbnId}
                                        className="mb-1 block text-xs text-[var(--ds-text-neutral-muted)]"
                                    >
                                        {t('export.isbn', { defaultValue: 'ISBN' })}
                                    </label>
                                    <DsInput
                                        id={isbnId}
                                        value={meta.isbn ?? ''}
                                        onChange={(event) =>
                                            updateTextMeta('isbn', normalizeIsbn(event.target.value))
                                        }
                                        placeholder={t('export.isbn', { defaultValue: 'ISBN' })}
                                        inputMode="numeric"
                                        autoComplete="off"
                                        maxLength={13}
                                        className="w-full"
                                    />
                                </div>
                                <div>
                                    <label
                                        htmlFor={descriptionId}
                                        className="mb-1 block text-xs text-[var(--ds-text-neutral-muted)]"
                                    >
                                        {t('exportModal.descriptionOptional')}
                                    </label>
                                    <DsTextarea
                                        id={descriptionId}
                                        value={meta.description ?? ''}
                                        onChange={(event) => updateTextMeta('description', event.target.value)}
                                        placeholder={t('exportModal.descriptionPlaceholder')}
                                        rows={3}
                                        className="w-full resize-none"
                                    />
                                </div>
                                <div>
                                    <label
                                        htmlFor={languageId}
                                        className="mb-1 block text-xs text-[var(--ds-text-neutral-muted)]"
                                    >
                                        {languageLabel}
                                    </label>
                                    <DsSelect
                                        id={languageId}
                                        value={meta.language}
                                        onChange={(event) => updateTextMeta('language', event.target.value)}
                                        className="w-full"
                                    >
                                        <option value="ko">{t('exportModal.korean')}</option>
                                        <option value="en">{t('exportModal.english')}</option>
                                        <option value="ja">{t('exportModal.japanese')}</option>
                                    </DsSelect>
                                </div>
                            </>
                        )}

                        {isEpub ? (
                            <>
                                <label className="mt-1 flex items-center justify-between gap-3 text-xs text-[var(--ds-text-neutral-secondary)]">
                                    <span className="text-[var(--ds-text-neutral-muted)]">{t('exportModal.embedFonts')}</span>
                                    <input
                                        type="checkbox"
                                        checked={embedFonts}
                                        onChange={(event) => setEmbedFonts(event.target.checked)}
                                        className="accent-brand-500"
                                        id={embedFontsId}
                                    />
                                </label>
                                <p className="text-xs text-[var(--ds-text-neutral-muted)]">
                                    {t('exportModal.embedFontsHint')}
                                </p>
                            </>
                        ) : null}

                        {errorMessage ? (
                            <p className="rounded border border-[var(--ds-border-danger-weak)] bg-[var(--ds-fill-danger-weak)] px-2 py-1 text-xs text-[var(--ds-text-danger-default)]">
                                {errorMessage}
                            </p>
                        ) : null}
                    </div>
                    <div className="flex gap-3 border-t border-[var(--ds-border-neutral-subtle)] px-4 py-3">
                        <DsButton
                            type="button"
                            onClick={onClose}
                            variant="secondary"
                            className="flex-1"
                        >
                            {t('common.cancel')}
                        </DsButton>
                        <DsButton
                            type="submit"
                            variant="primary"
                            className="flex-1"
                        >
                            {t('export.confirm')}
                        </DsButton>
                    </div>
                </form>
            </div>
        </div>
    )
}
