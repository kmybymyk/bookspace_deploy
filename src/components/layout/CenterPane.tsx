import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import BookEditor from '../../features/chapters/BookEditor'
import PreviewPane from '../../features/preview/PreviewPane'
import { useDesignStore } from '../../features/design-panel/useDesignStore'
import { ChevronDown, Eye, FolderOpen, FilePlus2, Save, SlidersHorizontal, SquarePen } from 'lucide-react'
import { useSaveFeedbackStore } from '../../store/saveFeedbackStore'
import { basenameCrossPlatform, getRecentProjectFiles, MAX_RECENT_FILES, removeRecentFile } from '../../features/home/homeStorage'
import { showToast } from '../../utils/toast'

interface Props {
    onNewProject: () => void
    onOpenProject: () => void
    onOpenRecentProject: (path: string) => Promise<boolean>
    onSaveProject: () => void
    mode: 'edit' | 'preview'
    onModeChange: (mode: 'edit' | 'preview') => void
    previewMode: 'reflow' | 'spread'
    onPreviewModeChange: (mode: 'reflow' | 'spread') => void
}

type ToolbarSliderProps = {
    label: string
    value: number
    min: number
    max: number
    step: number
    unit?: string
    onChange: (value: number) => void
}

function ToolbarSlider({ label, value, min, max, step, unit = '', onChange }: ToolbarSliderProps) {
    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--ds-text-neutral-muted)]">{label}</span>
                <span className="font-mono text-[var(--ds-text-neutral-secondary)]">
                    {value}
                    {unit}
                </span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(event) => onChange(Number(event.target.value))}
                className="h-1.5 w-full cursor-pointer appearance-none rounded bg-[var(--ds-fill-neutral-control-hover)] accent-[var(--ds-brand-500)]"
            />
        </div>
    )
}

export default function CenterPane({
    onNewProject,
    onOpenProject,
    onOpenRecentProject,
    onSaveProject,
    mode,
    onModeChange,
    previewMode,
    onPreviewModeChange,
}: Props) {
    const { t } = useTranslation()
    const [showCommonSettings, setShowCommonSettings] = useState(false)
    const [showRecentFiles, setShowRecentFiles] = useState(false)
    const [recentFiles, setRecentFiles] = useState<string[]>([])
    const [openingRecentPath, setOpeningRecentPath] = useState<string | null>(null)
    const commonSettingsRef = useRef<HTMLDivElement | null>(null)
    const recentFilesRef = useRef<HTMLDivElement | null>(null)
    const { settings, updateSetting } = useDesignStore()
    const saveErrorMessage = useSaveFeedbackStore((state) => state.errorMessage)
    const clearSaveError = useSaveFeedbackStore((state) => state.clearSaveError)
    useEffect(() => {
        if (!showCommonSettings) return

        const onPointerDown = (event: MouseEvent) => {
            const target = event.target as Node | null
            if (!target) return
            if (commonSettingsRef.current?.contains(target)) return
            setShowCommonSettings(false)
        }

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setShowCommonSettings(false)
            }
        }

        document.addEventListener('mousedown', onPointerDown)
        document.addEventListener('keydown', onKeyDown)
        return () => {
            document.removeEventListener('mousedown', onPointerDown)
            document.removeEventListener('keydown', onKeyDown)
        }
    }, [showCommonSettings])

    useEffect(() => {
        if (!showRecentFiles) return
        const onPointerDown = (event: MouseEvent) => {
            const target = event.target as Node | null
            if (!target) return
            if (recentFilesRef.current?.contains(target)) return
            setShowRecentFiles(false)
        }
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setShowRecentFiles(false)
            }
        }
        document.addEventListener('mousedown', onPointerDown)
        document.addEventListener('keydown', onKeyDown)
        return () => {
            document.removeEventListener('mousedown', onPointerDown)
            document.removeEventListener('keydown', onKeyDown)
        }
    }, [showRecentFiles])

    const topActionClass =
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium text-[var(--ds-text-neutral-muted)] transition-colors hover:bg-[var(--ds-fill-neutral-control)] hover:text-[var(--ds-text-neutral-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--ds-brand-500)_30%,transparent)] active:translate-y-px'
    const editModeLabel = t('centerPane.edit')
    const previewModeLabel = t('common.preview')
    const reflowLabel = t('centerPane.previewReflow')
    const spreadLabel = t('centerPane.previewSpread')
    const openRecentLabel = t('centerPane.openRecent')
    const openRecentId = 'center-pane-open-recent'
    const recentDialogId = 'center-pane-recent-projects'
    const newProjectLabel = t('titleBar.newProject')
    const openProjectLabel = t('titleBar.openProject')
    const saveProjectLabel = t('titleBar.saveProject')
    const commonSettingsLabel = t('designPanel.commonSettings')
    const retrySaveLabel = t('centerPane.retrySave')
    const closeLabel = t('common.close')

    return (
        <main id="center-pane-main" className="flex-1 min-w-0 flex flex-col overflow-hidden bg-[var(--ds-surface-canvas)]">
            <div className="relative flex h-11 shrink-0 items-center gap-2 border-b border-[var(--ds-border-subtle)] bg-[var(--ds-surface-panel)] px-3">
                <div className="ds-segmented shrink-0">
                    <button
                        type="button"
                        onClick={() => onModeChange('edit')}
                        aria-label={editModeLabel}
                        className="ds-tab inline-flex items-center gap-1.5 whitespace-nowrap"
                        data-active={mode === 'edit'}
                        title={t('centerPane.edit')}
                    >
                        <SquarePen size={13} />
                        <span className="max-[1400px]:hidden">{t('centerPane.edit')}</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => onModeChange('preview')}
                        aria-label={previewModeLabel}
                        className="ds-tab inline-flex items-center gap-1.5 whitespace-nowrap"
                        data-active={mode === 'preview'}
                        title={t('common.preview')}
                    >
                        <Eye size={13} />
                        <span className="max-[1400px]:hidden">{t('common.preview')}</span>
                    </button>
                </div>

                {mode === 'preview' && (
                    <div className="ds-segmented">
                        <button
                            type="button"
                            onClick={() => onPreviewModeChange('reflow')}
                            aria-label={reflowLabel}
                            className="ds-tab"
                            data-active={previewMode === 'reflow'}
                        >
                            {reflowLabel}
                        </button>
                        <button
                            type="button"
                            onClick={() => onPreviewModeChange('spread')}
                            aria-label={spreadLabel}
                            className="ds-tab"
                            data-active={previewMode === 'spread'}
                        >
                            {spreadLabel}
                        </button>
                    </div>
                )}

                {mode === 'preview' && (
                    <span className="text-sm text-[var(--ds-text-muted)]">
                        {previewMode === 'reflow'
                            ? t('centerPane.previewReflowHint')
                            : t('centerPane.previewSpreadHint')}
                    </span>
                )}

                <div className="flex-1 min-w-0" />

                <div className="flex shrink-0 items-center gap-2">
                    <div className="flex items-center gap-1 rounded-lg border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-card-subtle)] p-1">
                        <button
                            type="button"
                            onClick={onNewProject}
                            aria-label={newProjectLabel}
                            className={topActionClass}
                            title={t('titleBar.newProject')}
                        >
                            <FilePlus2 size={16} strokeWidth={1.75} />
                            <span className="max-[1400px]:hidden">{t('titleBar.newProject')}</span>
                        </button>

                        <div className="relative" ref={recentFilesRef}>
                            <div
                                className={`inline-flex overflow-hidden rounded-md border border-transparent ${
                                    showRecentFiles ? 'bg-[var(--ds-fill-neutral-control)] text-[var(--ds-text-neutral-secondary)]' : ''
                                }`}
                            >
                                <button
                                    type="button"
                                    onClick={onOpenProject}
                                    aria-label={openProjectLabel}
                                    className={`${topActionClass} rounded-r-none pr-2`}
                                    title={t('titleBar.openProject')}
                                >
                                    <FolderOpen size={16} strokeWidth={1.75} />
                                    <span className="max-[1400px]:hidden">{t('titleBar.openProject')}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!showRecentFiles) {
                                            setRecentFiles(getRecentProjectFiles().slice(0, MAX_RECENT_FILES))
                                        }
                                        setShowRecentFiles((prev) => !prev)
                                    }}
                                    aria-label={openRecentLabel}
                                    aria-expanded={showRecentFiles}
                                    aria-controls={recentDialogId}
                                    id={openRecentId}
                                    className={`${topActionClass} rounded-l-none border-l border-[var(--ds-border-neutral-subtle)] px-2 ${
                                        showRecentFiles ? 'bg-[var(--ds-fill-neutral-control)] text-[var(--ds-text-neutral-secondary)]' : ''
                                    }`}
                                    title={t('centerPane.openRecent')}
                                >
                                    <ChevronDown
                                        size={16}
                                        strokeWidth={1.75}
                                        className={showRecentFiles ? 'rotate-180 transition-transform' : 'transition-transform'}
                                    />
                                </button>
                            </div>
                            {showRecentFiles ? (
                                <div
                                    id={recentDialogId}
                                    aria-labelledby={openRecentId}
                                    className="absolute right-0 z-30 mt-1 w-80 rounded-lg border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-card)] p-1.5 shadow-xl"
                                >
                                    <p className="px-2.5 pb-1 pt-0.5 text-[11px] font-semibold tracking-wide text-[var(--ds-text-neutral-muted)]">
                                        {t('centerPane.openRecent')}
                                    </p>
                                    {recentFiles.length === 0 ? (
                                        <p className="px-2 py-2 text-xs text-[var(--ds-text-neutral-muted)]">{t('centerPane.noRecentFiles')}</p>
                                    ) : (
                                        <div className="max-h-72 overflow-y-auto">
                                            {recentFiles.map((path) => (
                                                <button
                                                    key={path}
                                                    type="button"
                                                    aria-label={basenameCrossPlatform(path)}
                                                    onClick={async () => {
                                                        setOpeningRecentPath(path)
                                                        const opened = await onOpenRecentProject(path)
                                                        if (opened) {
                                                            setShowRecentFiles(false)
                                                        } else {
                                                            removeRecentFile(path)
                                                            setRecentFiles(getRecentProjectFiles().slice(0, MAX_RECENT_FILES))
                                                            showToast(t('centerPane.recentFileRemoved'), 'info')
                                                        }
                                                        setOpeningRecentPath(null)
                                                    }}
                                                    className="flex w-full flex-col rounded-md px-2.5 py-2 text-left transition-colors hover:bg-[var(--ds-fill-neutral-control)]"
                                                >
                                                    <span className="truncate text-xs font-medium text-[var(--ds-text-neutral-secondary)]">
                                                        {basenameCrossPlatform(path)}
                                                        {openingRecentPath === path ? ` · ${t('common.loading')}` : ''}
                                                    </span>
                                                    <span className="truncate text-[11px] text-[var(--ds-text-neutral-muted)]">{path}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    <div className="my-1 h-px bg-[var(--ds-border-neutral-subtle)]" />
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowRecentFiles(false)
                                            onOpenProject()
                                        }}
                                        aria-label={t('centerPane.openFileDialog')}
                                        className="w-full rounded-md px-2.5 py-2 text-left text-xs font-medium text-[var(--ds-text-neutral-secondary)] transition-colors hover:bg-[var(--ds-fill-neutral-control)]"
                                    >
                                        {t('centerPane.openFileDialog')}
                                    </button>
                                </div>
                            ) : null}
                        </div>

                        <button
                            type="button"
                            onClick={onSaveProject}
                            aria-label={saveProjectLabel}
                            className={topActionClass}
                            title={t('titleBar.saveProject')}
                        >
                            <Save size={16} strokeWidth={1.75} />
                            <span className="max-[1400px]:hidden">{t('titleBar.saveProject')}</span>
                        </button>
                    </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                    <div className="relative" ref={commonSettingsRef}>
                        <button
                            type="button"
                            onClick={() => setShowCommonSettings((prev) => !prev)}
                            aria-label={commonSettingsLabel}
                            className={`${topActionClass} ${showCommonSettings ? 'bg-[var(--ds-fill-neutral-control)] text-[var(--ds-text-neutral-secondary)]' : ''}`}
                            title={t('designPanel.commonSettings')}
                        >
                            <SlidersHorizontal size={16} strokeWidth={1.75} />
                            <span className="max-[1400px]:hidden">{t('designPanel.commonSettings')}</span>
                        </button>
                    {showCommonSettings ? (
                        <div className="absolute right-0 z-20 mt-1 w-64 rounded-lg border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-card)] p-3 shadow-xl">
                            <div className="mb-2 text-xs font-medium text-[var(--ds-text-neutral-secondary)]">
                                {t('designPanel.commonSettings')}
                            </div>
                            <div className="flex flex-col gap-2.5">
                                <ToolbarSlider
                                    label={t('design.lineHeight')}
                                    value={settings.lineHeight}
                                    min={1.2}
                                    max={2.5}
                                    step={0.1}
                                    onChange={(value) => updateSetting('lineHeight', value)}
                                />
                                <ToolbarSlider
                                    label={t('design.letterSpacing')}
                                    value={settings.letterSpacing}
                                    min={-0.05}
                                    max={0.15}
                                    step={0.01}
                                    unit="em"
                                    onChange={(value) => updateSetting('letterSpacing', value)}
                                />
                                <ToolbarSlider
                                    label={t('designPanel.paragraphSpacing')}
                                    value={settings.paragraphSpacing}
                                    min={0}
                                    max={3}
                                    step={0.1}
                                    unit="em"
                                    onChange={(value) => updateSetting('paragraphSpacing', value)}
                                />
                                <ToolbarSlider
                                    label={t('designPanel.imageMaxWidth')}
                                    value={settings.imageMaxWidth}
                                    min={40}
                                    max={100}
                                    step={2}
                                    unit="%"
                                    onChange={(value) => updateSetting('imageMaxWidth', value)}
                                />
                            </div>
                        </div>
                    ) : null}
                    </div>
                </div>
            </div>

            {saveErrorMessage ? (
                <div className="flex min-h-10 items-center justify-between gap-3 border-b border-[var(--ds-border-danger-weak)] bg-[var(--ds-fill-danger-weak)] px-3">
                    <p className="truncate text-xs font-medium text-[var(--ds-text-danger-default)]" title={saveErrorMessage}>
                        {saveErrorMessage}
                    </p>
                    <div className="flex shrink-0 items-center gap-2">
                        <button
                            type="button"
                            onClick={onSaveProject}
                            aria-label={retrySaveLabel}
                            className="rounded-md border border-[var(--ds-border-danger-weak)] px-2 py-1 text-xs font-semibold text-[var(--ds-text-danger-default)] transition-colors hover:bg-[rgba(239,68,68,0.16)]"
                        >
                            {retrySaveLabel}
                        </button>
                        <button
                            type="button"
                            onClick={clearSaveError}
                            className="rounded-md px-2 py-1 text-xs text-[var(--ds-text-danger-default)] transition-colors hover:bg-[rgba(239,68,68,0.16)]"
                            aria-label={closeLabel}
                            title={t('common.close')}
                        >
                            ×
                        </button>
                    </div>
                </div>
            ) : null}

            {mode === 'edit' ? <BookEditor /> : <PreviewPane embedded viewMode={previewMode} />}
        </main>
    )
}
