import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type ChangeEvent,
    type DragEvent,
    type KeyboardEvent,
} from 'react'
import DesignPanel from '../../features/design-panel/DesignPanel'
import { ImagePlus, PanelRightClose, PanelRightOpen, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useProjectStore } from '../../store/projectStore'
import { showToast } from '../../utils/toast'
import {
    isPreferredImageMime,
    loadImageDimensions,
    MAX_IMAGE_FILE_BYTES,
    MAX_IMAGE_DIMENSION_PX,
    normalizeImageMime,
    resolveFileMime,
} from '../../utils/imagePolicy'
import { nanoid } from 'nanoid'
import type { InspectorMode } from './inspectorMode'
import type { BookIdentifierType, ContributorRole } from '../../types/project'
import type { HistorySnapshotEntry, RestoreMode } from '../../types/history'
import DsButton from '../ui/ds/DsButton'
import DsCard from '../ui/ds/DsCard'
import DsField from '../ui/ds/DsField'
import DsInput from '../ui/ds/DsInput'
import DsSelect from '../ui/ds/DsSelect'
import { formatDateTimeForUi } from '../../utils/dateTimeFormat'
import DsTextarea from '../ui/ds/DsTextarea'
import CopilotInspector from '../../features/copilot/CopilotInspector'
import { useChapterStore } from '../../features/chapters/useChapterStore'

interface RightPaneProps {
    mode: InspectorMode
    lastNonCopilotMode: Exclude<InspectorMode, 'copilot'>
    historyLoading: boolean
    projectPath: string | null
    historySnapshots: HistorySnapshotEntry[]
    historyLoadedAt: string | null
    onRefreshHistory: () => void
    onRestoreSnapshot: (snapshotId: string, mode: RestoreMode) => void
    onSaveProject: () => void
    onChangeMode: (mode: InspectorMode) => void
    collapsed?: boolean
    onToggleCollapse?: () => void
}

function buildInspectorSummary(mode: InspectorMode, t: (key: string, options?: Record<string, unknown>) => string, activePageTitle: string | null) {
    if (mode === 'design') {
        return {
            eyebrow: '',
            title: t('design.title'),
            description: t('rightPane.workspaceDescriptionDesign'),
            targetLabel: t('rightPane.targetCurrentSection'),
            targetValue: activePageTitle ?? t('rightPane.targetNoPage'),
        }
    }
    if (mode === 'history') {
        return {
            eyebrow: '',
            title: t('historyModal.title'),
            description: t('rightPane.workspaceDescriptionHistory'),
            targetLabel: t('rightPane.targetProject'),
            targetValue: t('rightPane.targetProjectValue'),
        }
    }
    if (mode === 'copilot') {
        return {
            eyebrow: '',
            title: t('centerPane.aiCopilot'),
            description: t('rightPane.workspaceDescriptionCopilot'),
            targetLabel: t('rightPane.targetCurrentManuscript'),
            targetValue: activePageTitle ?? t('rightPane.targetNoPage'),
        }
    }
    if (mode === 'cover') {
        return {
            eyebrow: '',
            title: t('rightPane.coverAssetsTitle'),
            description: t('rightPane.workspaceDescriptionCover'),
            targetLabel: t('rightPane.targetBookAssets'),
            targetValue: t('rightPane.targetBookAssetsValue'),
        }
    }
    return {
        eyebrow: '',
        title: t('rightPane.bookInfoTitle'),
        description: t('rightPane.workspaceDescriptionBookInfo'),
        targetLabel: t('rightPane.targetBookMetadata'),
        targetValue: t('rightPane.targetBookMetadataValue'),
    }
}

type SaveState = 'idle' | 'saving' | 'saved'

function reasonLabel(reason: HistorySnapshotEntry['reason'], t: (key: string) => string) {
    if (reason === 'manual') return t('historyModal.reasons.manual')
    if (reason === 'autosave') return t('historyModal.reasons.autosave')
    if (reason === 'before-restore') return t('historyModal.reasons.beforeRestore')
    return t('historyModal.reasons.snapshot')
}

function formatLoadedAt(value: string, language: string | undefined) {
    return formatDateTimeForUi(value, language, 'historyLoadedAt')
}

function formatHistoryCardDateParts(value: string, language: string | undefined) {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
        return {
            dateLabel: value,
            timeLabel: '',
        }
    }

    const normalized = String(language ?? '')
        .toLowerCase()
        .trim()
    const isKorean = normalized.startsWith('ko')
    const year = String(date.getFullYear())
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hour24 = date.getHours()
    const minute = String(date.getMinutes()).padStart(2, '0')
    const ampm = hour24 < 12 ? 'AM' : 'PM'
    const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
    const hour = String(hour12).padStart(2, '0')

    if (isKorean) {
        return {
            dateLabel: `${year}년 ${month}월 ${day}일`,
            timeLabel: `${ampm} ${hour}:${minute}`,
        }
    }

    return {
        dateLabel: `${month}/${day}/${year}`,
        timeLabel: `${ampm} ${hour}:${minute}`,
    }
}

function normalizeIsbn(value: string) {
    return value.replace(/[^0-9xX]/g, '').toUpperCase().slice(0, 13)
}

function normalizeIdentifierValue(type: BookIdentifierType, value: string) {
    const trimmed = value.trim()
    if (!trimmed) return ''
    if (type === 'isbn') return normalizeIsbn(trimmed)
    if (type === 'issn') return trimmed.replace(/[^0-9xX]/g, '').toUpperCase().slice(0, 8)
    if (type === 'doi') return trimmed.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    return trimmed
}

function normalizeLanguageTag(value: string) {
    return value
        .trim()
        .replace(/_/g, '-')
        .replace(/\s+/g, '-')
        .toLowerCase()
        .replace(/^-+|-+$/g, '')
}

function isLikelyBcp47Tag(value: string) {
    if (!value) return false
    return /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(value)
}

function AssetCard({
    title,
    currentImage,
    aspectClass,
    minWidth,
    minHeight,
    accept,
    onSelect,
    onRemove,
    previewClass,
}: {
    title: string
    currentImage?: string
    aspectClass: string
    minWidth: number
    minHeight: number
    accept?: string
    onSelect: (value: string) => void
    onRemove: () => void
    previewClass?: string
}) {
    const { t } = useTranslation()
    const inputRef = useRef<HTMLInputElement>(null)
    const [isDragOver, setIsDragOver] = useState(false)
    const acceptedTypes = useMemo(
        () =>
            new Set(
                (accept ?? 'image/jpeg,image/png,image/webp,image/gif')
                    .split(',')
                    .map((item) => normalizeImageMime(item))
                    .filter((item) => item.includes('/')),
            ),
        [accept],
    )

    const processFile = async (file: File) => {
        if (file.size > MAX_IMAGE_FILE_BYTES) {
            showToast(
                t('rightPane.imageMaxFileSize', {
                    sizeMB: Math.floor(MAX_IMAGE_FILE_BYTES / (1024 * 1024)),
                }),
                'error',
            )
            return
        }

        const mime = normalizeImageMime(resolveFileMime(file))

        if (!mime || (acceptedTypes.size > 0 && !acceptedTypes.has(mime))) {
            showToast(t('rightPane.unsupportedImageType'), 'error')
            return
        }

        if (!isPreferredImageMime(mime)) {
            showToast(t('rightPane.imagePreferredFormatHint'), 'info')
        }

        const size = await loadImageDimensions(file)
        if (!size) {
            showToast(t('rightPane.unsupportedImageType'), 'error')
            return
        }

        if (size.width > MAX_IMAGE_DIMENSION_PX || size.height > MAX_IMAGE_DIMENSION_PX) {
            showToast(
                t('rightPane.imageMaxDimensions', {
                    width: size.width,
                    height: size.height,
                    max: MAX_IMAGE_DIMENSION_PX,
                }),
                'error',
            )
            return
        }

        if (size.width < minWidth || size.height < minHeight) {
            showToast(
                t('rightPane.imageMinDimensions', {
                    label: title,
                    width: size.width,
                    height: size.height,
                    minWidth,
                    minHeight,
                }),
                'info',
            )
        }

        const reader = new FileReader()
        reader.onload = () => {
            onSelect(reader.result as string)
        }
        reader.readAsDataURL(file)
    }

    const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (file) {
            void processFile(file)
        }
        event.target.value = ''
    }

    const handleDrop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault()
        setIsDragOver(false)
        const file = event.dataTransfer.files?.[0]
        if (file) {
            void processFile(file)
        }
    }

    const handlePreviewKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            inputRef.current?.click()
        }
    }

    return (
        <DsCard>
            <div className="space-y-3.5">
                <div className="space-y-1">
                    <p className="text-sm font-semibold text-[var(--ds-text-neutral-secondary)]">{title}</p>
                    <div className="mt-1 space-y-0.5 text-xs text-[color-mix(in_srgb,var(--ds-text-neutral-muted)_80%,transparent)]">
                        <p className="break-keep">{t('rightPane.imagePolicyPreferred')}</p>
                        <p className="break-keep">
                            {t('rightPane.imagePolicyRange', {
                                minWidth,
                                minHeight,
                                max: MAX_IMAGE_DIMENSION_PX,
                            })}
                        </p>
                    </div>
                </div>
                <input
                    ref={inputRef}
                    type="file"
                    accept={accept ?? 'image/jpeg,image/png,image/webp,image/gif'}
                    className="hidden"
                    onChange={handleFileChange}
                />
                <div
                    role="button"
                    tabIndex={0}
                    onClick={() => inputRef.current?.click()}
                    onKeyDown={handlePreviewKeyDown}
                    onDragOver={(event) => {
                        event.preventDefault()
                        setIsDragOver(true)
                    }}
                    onDragEnter={(event) => {
                        event.preventDefault()
                        setIsDragOver(true)
                    }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={handleDrop}
                    className={`cursor-pointer overflow-hidden rounded-2xl border border-dashed bg-[linear-gradient(180deg,rgba(29,33,41,0.94),rgba(18,21,27,0.98))] transition-colors hover:border-[var(--ds-border-neutral-strong)] hover:bg-[var(--ds-fill-neutral-control)] ${
                        isDragOver
                            ? 'border-[var(--ds-border-brand-default)] bg-[color-mix(in_srgb,var(--ds-fill-neutral-card)_70%,var(--ds-fill-brand-weak))] ring-1 ring-[var(--ds-border-brand-default)]/60'
                            : 'border-[var(--ds-border-neutral-default)]'
                    }`}
                    aria-label={t('rightPane.coverDropHint')}
                >
                    <div className={`${aspectClass} grid w-full place-items-center bg-[linear-gradient(180deg,rgba(25,28,34,0.94),rgba(16,19,25,0.98))] px-4 text-center`}>
                        {currentImage ? (
                            <img src={currentImage} alt={title} className={`h-full w-full ${previewClass ?? 'object-contain'}`} />
                        ) : (
                            <div className="flex flex-col items-center gap-2 text-[var(--ds-text-neutral-muted)]">
                                <span className="grid h-10 w-10 place-items-center rounded-full border border-[var(--ds-border-neutral-subtle)] bg-[var(--ds-fill-neutral-control)]">
                                    <ImagePlus size={18} />
                                </span>
                                <p className="max-w-[18ch] break-keep text-xs leading-snug">{t('rightPane.coverDropHint')}</p>
                            </div>
                        )}
                    </div>
                </div>
                {currentImage ? (
                    <div className="flex items-center justify-end">
                        <DsButton size="sm" variant="danger-ghost" onClick={onRemove}>
                            {t('leftPane.remove')}
                        </DsButton>
                    </div>
                ) : null}
            </div>
        </DsCard>
    )
}

function CoverAssetsInspector() {
    const { t } = useTranslation()
    const { metadata, setCoverImage, setBackCoverImage, setPublisherLogo } = useProjectStore()

    return (
        <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto bg-[radial-gradient(circle_at_top,rgba(20,184,166,0.05),transparent_28%),linear-gradient(180deg,rgba(11,14,18,0.95),rgba(9,11,15,0.98))] p-4">
            <AssetCard
                title={t('rightPane.coverAssets.frontCover')}
                currentImage={metadata.coverImage}
                aspectClass="aspect-[5/7]"
                minWidth={1400}
                minHeight={2000}
                onSelect={setCoverImage}
                onRemove={() => setCoverImage(undefined)}
                previewClass="object-contain"
            />
            <AssetCard
                title={t('rightPane.coverAssets.backCover')}
                currentImage={metadata.backCoverImage}
                aspectClass="aspect-[5/7]"
                minWidth={1400}
                minHeight={2000}
                onSelect={setBackCoverImage}
                onRemove={() => setBackCoverImage(undefined)}
                previewClass="object-contain"
            />
            <AssetCard
                title={t('rightPane.coverAssets.publisherLogo')}
                currentImage={metadata.publisherLogo}
                aspectClass="h-24"
                minWidth={600}
                minHeight={200}
                onSelect={setPublisherLogo}
                onRemove={() => setPublisherLogo(undefined)}
                accept="image/jpeg,image/png,image/webp,image/gif"
                previewClass="object-contain"
            />
        </div>
    )
}

function BookInfoInspector() {
    const { t } = useTranslation()
    const { metadata, setMetadata } = useProjectStore()
    const [draft, setDraft] = useState(metadata)
    const [saveState, setSaveState] = useState<SaveState>('idle')
    const [showValidationHint, setShowValidationHint] = useState(false)
    const [validationMessage, setValidationMessage] = useState('')
    const savedResetRef = useRef<number>()
    const savedStateRef = useRef<number>()

    useEffect(() => {
        setDraft(metadata)
    }, [metadata])

    useEffect(() => {
        return () => {
            if (savedResetRef.current) {
                window.clearTimeout(savedResetRef.current)
            }
            if (savedStateRef.current) {
                window.clearTimeout(savedStateRef.current)
            }
        }
    }, [])

    const contributorRoleOptions = useMemo<Array<{ value: ContributorRole; label: string }>>(
        () => [
            { value: 'author', label: t('leftPane.roles.author') },
            { value: 'co-author', label: t('leftPane.roles.coAuthor') },
            { value: 'editor', label: t('leftPane.roles.editor') },
            { value: 'translator', label: t('leftPane.roles.translator') },
            { value: 'illustrator', label: t('leftPane.roles.illustrator') },
            { value: 'narrator', label: t('leftPane.roles.narrator') },
            { value: 'compiler', label: t('leftPane.roles.compiler') },
            { value: 'adapter', label: t('leftPane.roles.adapter') },
            { value: 'other', label: t('leftPane.roles.other') },
        ],
        [t],
    )
    const languageOptions = useMemo<Array<{ value: string; label: string }>>(
        () => [
            { value: 'ko', label: t('leftPane.langKo') },
            { value: 'en', label: t('leftPane.langEn') },
            { value: 'ja', label: t('leftPane.langJa') },
            { value: 'zh-Hans', label: '中文(简体)' },
            { value: 'zh-Hant', label: '中文(繁體)' },
            { value: 'fr', label: 'Francais' },
            { value: 'de', label: 'Deutsch' },
            { value: 'es', label: 'Espanol' },
        ],
        [t],
    )
    const identifierTypeOptions = useMemo<Array<{ value: BookIdentifierType; label: string }>>(
        () => [
            { value: 'isbn', label: t('rightPane.identifierTypes.isbn') },
            { value: 'issn', label: t('rightPane.identifierTypes.issn') },
            { value: 'uuid', label: t('rightPane.identifierTypes.uuid') },
            { value: 'asin', label: t('rightPane.identifierTypes.asin') },
            { value: 'doi', label: t('rightPane.identifierTypes.doi') },
        ],
        [t],
    )
    const normalizedDraftLanguage = normalizeLanguageTag(draft.language ?? '')
    const isPresetLanguage = languageOptions.some((option) => option.value === normalizedDraftLanguage)
    const selectedLanguageValue = isPresetLanguage ? normalizedDraftLanguage : 'custom'

    const primaryAuthorName = draft.authors.find((author) => author.name.trim())?.name.trim() ?? ''
    const hasRequiredBookInfo = (draft.title ?? '').trim().length > 0 && primaryAuthorName.length > 0

    const updateAuthor = (
        id: string,
        patch: Partial<{ name: string; role: ContributorRole; customRole?: string }>,
    ) => {
        setDraft((prev) => {
            const nextAuthors = prev.authors.map((author) =>
                author.id === id ? { ...author, ...patch } : author,
            )
            return { ...prev, authors: nextAuthors }
        })
    }

    const addAuthor = () => {
        setDraft((prev) => ({
            ...prev,
            authors: [...prev.authors, { id: nanoid(), name: '', role: 'author', customRole: '' }],
        }))
    }

    const removeAuthor = (id: string) => {
        setDraft((prev) => {
            const filtered = prev.authors.filter((author) => author.id !== id)
            return {
                ...prev,
                authors:
                    filtered.length > 0
                        ? filtered
                        : [{ id: nanoid(), name: '', role: 'author', customRole: '' }],
            }
        })
    }

    const handleSave = () => {
        if (!hasRequiredBookInfo) {
            setShowValidationHint(true)
            const message = t('rightPane.bookInfoValidationRequired')
            setValidationMessage(message)
            showToast(message, 'error')
            return
        }
        const normalizedLanguage = normalizeLanguageTag(draft.language || '')
        if (!normalizedLanguage) {
            setShowValidationHint(true)
            const message = t('rightPane.bookInfoLanguageRequired')
            setValidationMessage(message)
            showToast(message, 'error')
            return
        }
        if (!isLikelyBcp47Tag(normalizedLanguage)) {
            setShowValidationHint(true)
            const message = t('rightPane.bookInfoLanguageValidation')
            setValidationMessage(message)
            showToast(message, 'error')
            return
        }

        const identifierType = (draft.identifierType ?? 'isbn') as BookIdentifierType
        const normalizedIdentifier = normalizeIdentifierValue(
            identifierType,
            draft.identifier ?? draft.isbn ?? '',
        )

        setMetadata({
            ...draft,
            title: (draft.title ?? '').trim(),
            subtitle: draft.subtitle,
            identifierType,
            identifier: normalizedIdentifier,
            isbn: identifierType === 'isbn' ? normalizedIdentifier : '',
            language: normalizedLanguage,
        })
        setShowValidationHint(false)
        setValidationMessage('')
        showToast(t('rightPane.bookInfoSavedToast'), 'success')
        setSaveState('saving')
        if (savedResetRef.current) {
            window.clearTimeout(savedResetRef.current)
        }
        if (savedStateRef.current) {
            window.clearTimeout(savedStateRef.current)
        }
        savedResetRef.current = window.setTimeout(() => setSaveState('saved'), 300)
        savedStateRef.current = window.setTimeout(() => setSaveState('idle'), 2000)
    }

    return (
        <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto bg-[radial-gradient(circle_at_top,rgba(20,184,166,0.05),transparent_28%),linear-gradient(180deg,rgba(11,14,18,0.95),rgba(9,11,15,0.98))] p-4 [scrollbar-gutter:stable]">
            <DsCard>
                <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ds-text-neutral-muted)]">
                        {t('rightPane.bookInfoSection.basic')}
                    </p>
                    <DsField label={t('leftPane.title')}>
                        <DsInput
                            value={draft.title ?? ''}
                            onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
                            placeholder={t('leftPane.titlePlaceholder')}
                        />
                    </DsField>
                    <DsField label={t('leftPane.subtitle')}>
                        <DsInput
                            value={draft.subtitle ?? ''}
                            onChange={(e) => setDraft((prev) => ({ ...prev, subtitle: e.target.value }))}
                            placeholder={t('leftPane.subtitlePlaceholder')}
                        />
                    </DsField>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between gap-4">
                            <span className="ds-label">{t('leftPane.authors')}</span>
                            <DsButton size="sm" onClick={addAuthor}>
                                {t('leftPane.addAuthor')}
                            </DsButton>
                        </div>
                        <div className="space-y-2">
                            {draft.authors.map((author, index) => (
                                <div
                                    key={author.id}
                                    className="space-y-2.5 rounded-2xl border border-[var(--ds-border-neutral-default)] bg-[linear-gradient(180deg,rgba(22,25,32,0.9),rgba(14,17,22,0.96))] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-medium text-[var(--ds-text-muted)]">
                                            {t('leftPane.authors')} {index + 1}
                                        </span>
                                        {draft.authors.length > 1 ? (
                                            <DsButton
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => removeAuthor(author.id)}
                                            >
                                                {t('common.delete')}
                                            </DsButton>
                                        ) : null}
                                    </div>
                                    <DsInput
                                        value={author.name}
                                        onChange={(e) => updateAuthor(author.id, { name: e.target.value })}
                                        placeholder={t('leftPane.namePlaceholder')}
                                    />
                                    <DsSelect
                                        value={author.role}
                                        onChange={(e) =>
                                            updateAuthor(author.id, {
                                                role: e.target.value as ContributorRole,
                                                customRole: e.target.value === 'other' ? author.customRole ?? '' : '',
                                            })
                                        }
                                    >
                                        {contributorRoleOptions.map((option) => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </DsSelect>
                                    {author.role === 'other' ? (
                                        <DsInput
                                            value={author.customRole ?? ''}
                                            onChange={(e) =>
                                                updateAuthor(author.id, {
                                                    customRole: e.target.value,
                                                })
                                            }
                                            placeholder={t('leftPane.customRolePlaceholder')}
                                        />
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="my-1 border-t border-[var(--ds-border-neutral-subtle)]" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ds-text-neutral-muted)]">
                        {t('rightPane.bookInfoSection.publishing')}
                    </p>
                    <DsField label={t('export.language')}>
                        <DsSelect
                            value={selectedLanguageValue}
                            onChange={(e) => {
                                const next = e.target.value
                                if (next === 'custom') {
                                    setDraft((prev) => ({
                                        ...prev,
                                        language: isPresetLanguage ? '' : prev.language,
                                    }))
                                    return
                                }
                                setDraft((prev) => ({ ...prev, language: next }))
                            }}
                        >
                            {languageOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                            <option value="custom">{t('rightPane.languageCustomOption')}</option>
                        </DsSelect>
                    </DsField>
                    {!isPresetLanguage ? (
                        <>
                            <DsField label={t('rightPane.languageCustomLabel')}>
                                <DsInput
                                    value={draft.language ?? ''}
                                    onChange={(e) =>
                                        setDraft((prev) => ({
                                            ...prev,
                                            language: e.target.value,
                                        }))
                                    }
                                    placeholder={t('rightPane.languagePlaceholder')}
                                />
                            </DsField>
                            <p className="ds-hint">{t('rightPane.languageBcp47Hint')}</p>
                        </>
                    ) : null}
                    <DsField label={t('leftPane.publisher')}>
                        <DsInput
                            value={draft.publisher ?? ''}
                            onChange={(e) => setDraft((prev) => ({ ...prev, publisher: e.target.value }))}
                            placeholder={t('leftPane.publisher')}
                        />
                    </DsField>
                    <DsField label={t('rightPane.identifier')}>
                        <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-2.5">
                            <DsSelect
                                value={draft.identifierType ?? 'isbn'}
                                onChange={(e) => {
                                    const nextType = e.target.value as BookIdentifierType
                                    setDraft((prev) => ({
                                        ...prev,
                                        identifierType: nextType,
                                        identifier: normalizeIdentifierValue(
                                            nextType,
                                            prev.identifier ?? prev.isbn ?? '',
                                        ),
                                    }))
                                }}
                                className="w-[96px]"
                            >
                                {identifierTypeOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                        {option.label}
                                    </option>
                                ))}
                            </DsSelect>
                            <DsInput
                                value={draft.identifier ?? draft.isbn ?? ''}
                                onChange={(e) =>
                                    setDraft((prev) => ({
                                        ...prev,
                                        identifier: normalizeIdentifierValue(
                                            (prev.identifierType ?? 'isbn') as BookIdentifierType,
                                            e.target.value,
                                        ),
                                    }))
                                }
                                placeholder={t('rightPane.identifierPlaceholder')}
                                autoComplete="off"
                                inputMode={
                                    (draft.identifierType ?? 'isbn') === 'isbn' ||
                                        (draft.identifierType ?? 'isbn') === 'issn'
                                        ? 'numeric'
                                        : undefined
                                }
                            />
                        </div>
                    </DsField>
                    <DsField label={t('leftPane.link')}>
                        <DsInput
                            value={draft.link ?? ''}
                            onChange={(e) => setDraft((prev) => ({ ...prev, link: e.target.value }))}
                            placeholder={t('leftPane.linkPlaceholder')}
                        />
                    </DsField>
                    <DsField label={t('leftPane.descriptionOptional')}>
                        <DsTextarea
                            value={draft.description ?? ''}
                            onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
                            placeholder={t('leftPane.descriptionPlaceholder')}
                            rows={3}
                            className="resize-none max-h-56 overflow-y-auto"
                        />
                    </DsField>
                </div>
            </DsCard>

            <div className="flex flex-col items-end gap-2">
                {showValidationHint ? (
                    <p className="w-full text-sm font-medium text-[var(--ds-text-warning-default)]">
                        {validationMessage || t('rightPane.bookInfoValidationRequired')}
                    </p>
                ) : null}
                <DsButton
                    size="sm"
                    variant="primary"
                    onClick={handleSave}
                    disabled={saveState === 'saving'}
                    className="px-3"
                >
                    {saveState === 'saved' ? t('common.saved') : t('common.save')}
                </DsButton>
            </div>
        </div>
    )
}

function HistoryInspector({
    loading,
    projectPath,
    snapshots,
    loadedAt,
    onRefresh,
    onRestore,
    onSaveProject,
}: {
    loading: boolean
    projectPath: string | null
    snapshots: HistorySnapshotEntry[]
    loadedAt: string | null
    onRefresh: () => void
    onRestore: (snapshotId: string, mode: RestoreMode) => void
    onSaveProject: () => void
}) {
    const { t, i18n } = useTranslation()
    const canUseHistory = Boolean(projectPath)
    const [pendingRestoreId, setPendingRestoreId] = useState<string | null>(null)

    const ordered = useMemo(() => {
        return [...snapshots].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    }, [snapshots])

    const handleRestore = async (snapshotId: string, mode: RestoreMode) => {
        if (pendingRestoreId) return
        try {
            setPendingRestoreId(snapshotId)
            await Promise.resolve(onRestore(snapshotId, mode))
        } finally {
            setPendingRestoreId(null)
        }
    }

    if (!canUseHistory) {
        return (
            <div className="flex h-full min-h-0 items-center justify-center bg-[radial-gradient(circle_at_top,rgba(20,184,166,0.05),transparent_28%),linear-gradient(180deg,rgba(11,14,18,0.95),rgba(9,11,15,0.98))] p-6">
                <div className="max-w-[240px] rounded-2xl border border-[var(--ds-border-neutral-subtle)] bg-[linear-gradient(180deg,rgba(20,184,166,0.08),rgba(18,22,29,0.96)_55%,rgba(13,16,21,0.98))] px-4 py-4 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ds-text-neutral-muted)]">
                        History
                    </div>
                    <p className="mx-auto max-w-[18ch] break-keep text-sm leading-snug text-[var(--ds-text-neutral-muted)]">
                        {t('historyModal.savedProjectOnly')}
                    </p>
                    <DsButton onClick={onSaveProject} className="mt-4 w-full" variant="primary">
                        {t('historyModal.saveAction')}
                    </DsButton>
                </div>
            </div>
        )
    }

    return (
        <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto bg-[radial-gradient(circle_at_top,rgba(20,184,166,0.05),transparent_28%),linear-gradient(180deg,rgba(11,14,18,0.95),rgba(9,11,15,0.98))] p-4 [scrollbar-gutter:stable]">
            <div className="rounded-2xl border border-[var(--ds-border-neutral-subtle)] bg-[linear-gradient(180deg,rgba(20,184,166,0.08),rgba(18,22,29,0.96)_55%,rgba(13,16,21,0.98))] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 text-xs leading-5 text-[var(--ds-text-neutral-muted)]">
                        {loadedAt
                            ? t('historyModal.loadedAt', { time: formatLoadedAt(loadedAt, i18n.language) })
                            : t('historyModal.loadedAtEmpty')}
                    </div>
                    <DsButton
                        onClick={onRefresh}
                        size="sm"
                        variant="ghost"
                        disabled={loading}
                        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-[var(--ds-fill-neutral-control)] px-3 font-normal transition-colors hover:bg-[color-mix(in_srgb,var(--ds-fill-neutral-control)_88%,var(--ds-fill-neutral-card))] hover:text-[var(--ds-text-neutral-secondary)]"
                    >
                        <RefreshCw size={14} />
                        {t('historyModal.refresh')}
                    </DsButton>
                </div>
            </div>
            {loading ? (
                <div className="space-y-3 py-2" aria-live="polite">
                    <div className="h-24 animate-pulse rounded-2xl border border-[var(--ds-border-neutral-subtle)] bg-[linear-gradient(180deg,rgba(29,33,41,0.94),rgba(18,21,27,0.98))]" />
                    <div className="h-24 animate-pulse rounded-2xl border border-[var(--ds-border-neutral-subtle)] bg-[linear-gradient(180deg,rgba(29,33,41,0.94),rgba(18,21,27,0.98))]" />
                    <p className="pt-1 text-sm text-[var(--ds-text-neutral-secondary)]">{t('historyModal.loading')}</p>
                </div>
            ) : ordered.length === 0 ? (
                <div className="rounded-2xl border border-[var(--ds-border-neutral-subtle)] bg-[linear-gradient(180deg,rgba(22,25,32,0.9),rgba(14,17,22,0.96))] px-4 py-6 text-sm text-[var(--ds-text-neutral-muted)]">
                    {snapshots.length === 0 ? t('historyModal.empty') : t('historyModal.noFilterResult')}
                </div>
            ) : (
                <div className="space-y-3">
                    {ordered.map((snapshot) => {
                        const { dateLabel, timeLabel } = formatHistoryCardDateParts(snapshot.createdAt, i18n.language)
                        const cardToneClass =
                            snapshot.reason === 'manual'
                                ? 'bg-[linear-gradient(135deg,rgba(35,43,63,0.9),rgba(27,34,52,0.88))] border-[rgba(113,141,191,0.34)]'
                                : snapshot.reason === 'autosave'
                                    ? 'bg-[linear-gradient(135deg,rgba(47,42,29,0.9),rgba(37,33,23,0.88))] border-[rgba(170,142,78,0.36)]'
                                    : 'bg-[linear-gradient(135deg,rgba(30,45,43,0.9),rgba(24,36,35,0.88))] border-[rgba(104,150,138,0.34)]'
                        return (
                            <div
                                key={snapshot.id}
                                className={`space-y-3 rounded-2xl border px-3.5 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] ${cardToneClass}`}
                            >
                                <p className="flex items-start justify-between gap-2">
                                    <span className="flex min-w-0 flex-col text-sm font-semibold leading-tight text-[var(--ds-text-neutral-primary)]">
                                        <span>{dateLabel}</span>
                                        {timeLabel ? <span className="mt-1">{timeLabel}</span> : null}
                                    </span>
                                    <span className="shrink-0 whitespace-nowrap rounded-full border border-white/10 bg-black/10 px-2 py-0.5 text-[11px] font-normal text-[var(--ds-text-neutral-muted)]">
                                        {reasonLabel(snapshot.reason, t)}
                                    </span>
                                </p>
                                <div className="flex flex-col gap-2">
                                    <DsButton
                                        onClick={() => {
                                            void handleRestore(snapshot.id, 'new-file')
                                        }}
                                        size="sm"
                                        variant="secondary"
                                        loading={pendingRestoreId === snapshot.id}
                                        disabled={Boolean(pendingRestoreId)}
                                        className="w-full rounded-xl px-2.5 py-2 text-center font-normal text-[var(--ds-text-neutral-muted)]"
                                    >
                                        {pendingRestoreId === snapshot.id ? t('common.loading') : t('historyModal.openAsNew')}
                                    </DsButton>
                                    <DsButton
                                        onClick={() => {
                                            void handleRestore(snapshot.id, 'replace')
                                        }}
                                        size="sm"
                                        variant="secondary"
                                        loading={pendingRestoreId === snapshot.id}
                                        disabled={Boolean(pendingRestoreId)}
                                        className="w-full rounded-xl px-2.5 py-2 text-center font-normal text-[var(--ds-text-neutral-secondary)]"
                                    >
                                        {pendingRestoreId === snapshot.id ? t('common.loading') : t('historyModal.restoreCurrent')}
                                    </DsButton>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

export default function RightPane({
    mode,
    lastNonCopilotMode,
    historyLoading,
    projectPath,
    historySnapshots,
    historyLoadedAt,
    onRefreshHistory,
    onRestoreSnapshot,
    onSaveProject,
    onChangeMode,
    collapsed = false,
    onToggleCollapse,
}: RightPaneProps) {
    const { t } = useTranslation()
    const chapters = useChapterStore((state) => state.chapters)
    const activeChapterId = useChapterStore((state) => state.activeChapterId)
    const activePageTitle =
        activeChapterId ? chapters.find((chapter) => chapter.id === activeChapterId)?.title ?? null : null

    const returnInspectorLabel =
        lastNonCopilotMode === 'design'
            ? t('toolbox.design')
            : lastNonCopilotMode === 'bookInfo'
                ? t('toolbox.bookInfo')
                : lastNonCopilotMode === 'cover'
                    ? t('toolbox.coverAssets')
                    : t('toolbox.versionManager')

    const paneSummary = buildInspectorSummary(mode, t, activePageTitle)
    const shouldShowTargetSummary = mode === 'design' || mode === 'copilot'

    return (
        <aside
            className={`ds-panel overflow-hidden select-none ${
                collapsed ? 'w-14 min-w-14' : 'flex w-[300px] min-w-[300px] flex-col'
            }`}
        >
            <div className={collapsed ? 'flex h-full w-full' : 'hidden'}>
                <button
                    type="button"
                    onClick={onToggleCollapse}
                    className="flex h-full w-full flex-col items-center justify-center gap-3 transition-colors hover:bg-[var(--ds-fill-neutral-control)] focus-visible:bg-[var(--ds-fill-neutral-control)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--ds-brand-500)_30%,transparent)]"
                    title={t('rightPane.expandDesignPanel')}
                    aria-label={t('rightPane.expandDesignPanel')}
                >
                    <span className="ds-icon-button h-9 w-9 transition-transform duration-200 ease-out hover:scale-[1.03]">
                        <PanelRightOpen size={18} />
                    </span>
                    <span className="text-[11px] font-medium text-[var(--ds-text-neutral-muted)]">{t('rightPane.workspaceShort')}</span>
                </button>
            </div>
            <div className={collapsed ? 'hidden' : 'flex h-full min-h-0 w-[300px] min-w-[300px] shrink-0 flex-col'}>
                <div className="ds-panel-header flex shrink-0 flex-col gap-2 px-3 py-3">
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--ds-text-neutral-muted)]">
                                {paneSummary.eyebrow}
                            </div>
                            <div className="mt-1 text-base font-semibold text-[var(--ds-text-neutral-secondary)]">
                                {paneSummary.title}
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {mode === 'copilot' ? (
                                <button
                                    type="button"
                                    onClick={() => onChangeMode(lastNonCopilotMode)}
                                    className="rounded border border-[var(--ds-border-neutral-default)] bg-[var(--ds-fill-neutral-control)] px-2 py-1 text-[11px] text-[var(--ds-text-neutral-secondary)] transition-colors hover:bg-[color-mix(in_srgb,var(--ds-fill-neutral-control)_88%,var(--ds-fill-neutral-card))]"
                                >
                                    {t('rightPane.returnToInspector', { inspector: returnInspectorLabel })}
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => onChangeMode('copilot')}
                                    className="rounded border border-[var(--ds-border-neutral-default)] bg-[var(--ds-fill-neutral-control)] px-2 py-1 text-[11px] text-[var(--ds-text-neutral-secondary)] transition-colors hover:bg-[color-mix(in_srgb,var(--ds-fill-neutral-control)_88%,var(--ds-fill-neutral-card))]"
                                >
                                    {t('rightPane.openCopilot')}
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={onToggleCollapse}
                                className="ds-icon-button h-7 px-2 transition-transform duration-200 ease-out hover:scale-[1.03] focus-visible:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--ds-brand-500)_30%,transparent)]"
                                title={t('rightPane.collapseDesignPanel')}
                                aria-label={t('rightPane.collapseDesignPanel')}
                            >
                                <PanelRightClose size={16} />
                            </button>
                        </div>
                    </div>
                    {shouldShowTargetSummary ? (
                        <div className="rounded-lg border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-card-subtle)] px-2.5 py-2 text-xs">
                            <div className="flex items-center justify-between gap-2 rounded-md border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-panel)] px-2.5 py-2">
                                <span className="text-[10px] uppercase tracking-[0.1em] text-[var(--ds-text-neutral-muted)]">
                                    {paneSummary.targetLabel}
                                </span>
                                <span className="max-w-[150px] truncate font-medium text-[var(--ds-text-neutral-secondary)]">
                                    {paneSummary.targetValue}
                                </span>
                            </div>
                        </div>
                    ) : null}
                </div>
                <div className="min-h-0 flex-1">
                    {mode === 'design' ? (
                        <DesignPanel />
                    ) : mode === 'history' ? (
                        <HistoryInspector
                            loading={historyLoading}
                            projectPath={projectPath}
                            snapshots={historySnapshots}
                            loadedAt={historyLoadedAt}
                            onRefresh={onRefreshHistory}
                            onRestore={onRestoreSnapshot}
                            onSaveProject={onSaveProject}
                        />
                    ) : mode === 'copilot' ? (
                        <CopilotInspector onRequestInspector={onChangeMode} />
                    ) : mode === 'bookInfo' ? (
                        <BookInfoInspector />
                    ) : (
                        <CoverAssetsInspector />
                    )}
                </div>
            </div>
        </aside>
    )
}
