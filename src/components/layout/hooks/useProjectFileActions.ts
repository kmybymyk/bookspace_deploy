import { useCallback, useRef } from 'react'
import { nanoid } from 'nanoid'
import type { TFunction } from 'i18next'
import type { BookMetadata, ExportFormat, EpubExportVersion } from '../../../types/project'
import { PROJECT_FILE_FILTER } from '../../../../shared/filePolicy'
import { useChapterStore } from '../../../features/chapters/useChapterStore'
import { useDesignStore } from '../../../features/design-panel/useDesignStore'
import { useProjectStore } from '../../../store'
import { showToast } from '../../../utils/toast'
import { clearDraftFromLocal, serializeCurrentProject } from '../../../utils/projectSnapshot'
import { applyProjectToWorkspace, loadProjectFromPath } from '../../../utils/projectWorkspace'
import { useSaveFeedbackStore } from '../../../store/saveFeedbackStore'
import { saveProjectPayload } from '../../../utils/projectSave'
import { formatErrorMessage } from '../../../utils/errorMessage'

interface UseProjectFileActionsArgs {
    t: TFunction
    setDirty: (dirty: boolean) => void
    setMetadata: (metadata: BookMetadata) => void
    setProjectPath: (path: string | null) => void
    rotateProjectSessionId: () => void
    setShowExport: (open: boolean) => void
    onProjectOpened?: (path: string) => void
}

export function useProjectFileActions({
    t,
    setDirty,
    setMetadata,
    setProjectPath,
    rotateProjectSessionId,
    setShowExport,
    onProjectOpened,
}: UseProjectFileActionsArgs) {
    const saveInFlightRef = useRef(false)
    const saveRequestRef = useRef(0)

    const handleImportFile = useCallback(async (format: 'epub' | 'docx' | 'md') => {
        try {
            const { chapters } = useChapterStore.getState()
            const { projectPath, metadata } = useProjectStore.getState()
            const hasWorkspaceContent =
                Boolean(projectPath)
                || chapters.length > 0
                || Boolean(
                    metadata.title?.trim()
                    || metadata.subtitle?.trim()
                    || metadata.description?.trim()
                    || metadata.coverImage
                    || metadata.backCoverImage,
                )
            if (hasWorkspaceContent) {
                const proceed = window.confirm(t('appShell.confirm.importReplacePrompt'))
                if (!proceed) return
            }

            const importExtensions = format === 'md' ? ['md', 'markdown'] : [format]
            const selected = await window.electronAPI.showOpenDialog({
                filters: [{ name: format === 'md' ? 'MARKDOWN' : format.toUpperCase(), extensions: importExtensions }],
                properties: ['openFile'],
            })
            if (!selected) return

            const ext = selected.split('.').pop()?.toLowerCase()
            const fileName = selected.replace(/\\/g, '/').split('/').pop() ?? t('editor.untitled')

            if (ext === 'md' || ext === 'markdown') {
                const rawMarkdown = await window.electronAPI.readFile(selected)
                const { importMarkdown } = await import('../../../features/export/markdownImporter')
                const { resolveMarkdownImageSources } = await import('../../../features/export/markdownImageResolver')
                const result = importMarkdown(rawMarkdown)
                const imageWarnings = await resolveMarkdownImageSources(
                    result.chapters,
                    selected,
                    window.electronAPI.readFileBinary,
                )
                const warnings = [...result.warnings, ...imageWarnings]
                if (result.chapters.length === 0) {
                    throw new Error(t('appShell.errors.markdownBodyNotFound'))
                }
                const fallbackTitle = fileName.replace(/\.(md|markdown)$/i, '') || t('editor.untitled')
                const currentMeta = useProjectStore.getState().metadata
                useChapterStore.getState().setChapters(result.chapters)
                useDesignStore.getState().applyTheme('novel')
                rotateProjectSessionId()
                setProjectPath(null)
                setMetadata({
                    ...currentMeta,
                    title: result.metadata.title?.trim() || fallbackTitle,
                    authors:
                        result.metadata.authors && result.metadata.authors.length > 0
                            ? result.metadata.authors
                            : [{ id: nanoid(), name: '', role: 'author' }],
                    language: result.metadata.language?.trim() || 'ko',
                    publisher: result.metadata.publisher ?? currentMeta.publisher,
                    description: result.metadata.description ?? currentMeta.description,
                })
                setDirty(true)
                showToast(t('appShell.toasts.markdownImportCompleted', { path: selected }), 'success')
                if (warnings.length > 0) {
                    const first = warnings[0]
                    const sample = first.chapterTitle
                        ? `L${first.line} [${first.chapterTitle}] ${first.message}`
                        : `L${first.line} ${first.message}`
                    showToast(
                        t('appShell.toasts.markdownImportWarnings', {
                            count: warnings.length,
                            sample,
                        }),
                        'info',
                    )
                }
                return
            }

            const binary = await window.electronAPI.readFileBinary(selected)

            if (ext === 'docx') {
                const { importDocx } = await import('../../../features/export/docxImporter')
                const result = await importDocx(binary)
                if (result.chapters.length === 0) {
                    throw new Error(t('appShell.errors.docxBodyNotFound'))
                }
                const fallbackTitle = fileName.replace(/\.docx$/i, '') || t('editor.untitled')
                const currentMeta = useProjectStore.getState().metadata
                useChapterStore.getState().setChapters(result.chapters)
                useDesignStore.getState().applyTheme('novel')
                rotateProjectSessionId()
                setProjectPath(null)
                setMetadata({
                    ...currentMeta,
                    title: result.metadata.title?.trim() || fallbackTitle,
                    authors:
                        result.metadata.authors && result.metadata.authors.length > 0
                            ? result.metadata.authors
                            : [{ id: nanoid(), name: '', role: 'author' }],
                    language: result.metadata.language?.trim() || 'ko',
                })
                setDirty(true)
                showToast(t('appShell.toasts.docxImportCompleted', { path: selected }), 'success')
                return
            }

            const { importEpub } = await import('../../../features/export/epubImporter')
            const result = await importEpub(binary)
            if (result.chapters.length === 0) {
                throw new Error(t('appShell.errors.epubBodyChapterNotFound'))
            }

            const fallbackTitle = fileName.replace(/\.epub$/i, '') || t('editor.untitled')
            const currentMeta = useProjectStore.getState().metadata

            useChapterStore.getState().setChapters(result.chapters)
            useDesignStore.getState().applyTheme('novel')
            rotateProjectSessionId()
            setProjectPath(null)
            setMetadata({
                ...currentMeta,
                title: result.metadata.title?.trim() || fallbackTitle,
                authors:
                    result.metadata.authors && result.metadata.authors.length > 0
                        ? result.metadata.authors
                        : currentMeta.authors,
                language: result.metadata.language?.trim() || currentMeta.language || 'ko',
                publisher: result.metadata.publisher ?? currentMeta.publisher,
                publishDate: result.metadata.publishDate ?? currentMeta.publishDate,
                identifier: result.metadata.identifier ?? currentMeta.identifier,
                identifierType: result.metadata.identifierType ?? currentMeta.identifierType,
                isbn: result.metadata.isbn ?? currentMeta.isbn,
                coverImage: result.metadata.coverImage ?? currentMeta.coverImage,
            })
            setDirty(true)
            showToast(t('appShell.toasts.epubImportCompleted', { path: selected }), 'success')
            if (result.diagnostics.warnings.length > 0) {
                showToast(
                    `EPUB import warning: ${result.diagnostics.warnings[0]}`,
                    'info',
                )
            }
        } catch (e) {
            showToast(
                t('appShell.toasts.importFailed', { error: formatErrorMessage(e, t('common.unknownError')) }),
                'error',
            )
        }
    }, [rotateProjectSessionId, setDirty, setMetadata, setProjectPath, t])

    const handleExport = useCallback(async (
        metadata: BookMetadata,
        options: { format: ExportFormat; embedFonts: boolean },
    ) => {
        const { chapters } = useChapterStore.getState()
        const { settings } = useDesignStore.getState()
        try {
            const isDocx = options.format === 'docx'
            const extension = isDocx ? 'docx' : 'epub'
            const fileTypeLabel =
                options.format === 'docx'
                    ? 'DOCX'
                    : options.format === 'epub2'
                        ? 'EPUB 2.0'
                        : 'EPUB 3.0'
            const savePath = await window.electronAPI.showSaveDialog({
                filters: [{ name: fileTypeLabel, extensions: [extension] }],
                defaultPath: `${metadata.title || t('appShell.defaults.bookTitle')}.${extension}`,
            })
            if (!savePath) return

            if (isDocx) {
                const { exportDocx } = await import('../../../features/export/docxExporter')
                const blob = await exportDocx(
                    chapters,
                    metadata,
                    (key, params) => t(key, params as Record<string, unknown>) as string,
                )
                await window.electronAPI.saveFileBinary(await blob.arrayBuffer(), savePath)
                showToast(t('appShell.toasts.docxExportCompleted', { path: savePath }), 'success')
            } else {
                const { exportEpub } = await import('../../../features/export/epubExporter')
                const exportSettings = {
                    ...settings,
                    fontEmbedMode: options.embedFonts ? 'selected' : 'none',
                } as typeof settings
                const version: EpubExportVersion = options.format === 'epub2' ? '2.0' : '3.0'
                const { blob, warnings } = await exportEpub(chapters, metadata, exportSettings, { version })
                await window.electronAPI.saveFileBinary(await blob.arrayBuffer(), savePath)
                showToast(t('appShell.toasts.epubExportCompleted', { path: savePath }), 'success')
                if (warnings.length > 0) {
                    showToast(
                        t('appShell.toasts.epubExportWarnings', {
                            count: warnings.length,
                            sample: warnings[0],
                        }),
                        'info',
                    )
                }
            }

            setMetadata(metadata)
            setShowExport(false)
        } catch (e) {
            showToast(
                t('appShell.toasts.exportFailed', { error: formatErrorMessage(e, t('common.unknownError')) }),
                'error',
            )
        }
    }, [setMetadata, setShowExport, t])

    const openProjectByPath = useCallback(async (selected: string) => {
        try {
            const project = await loadProjectFromPath(selected)
            applyProjectToWorkspace(selected, project, {
                setDirty: false,
                clearDraft: true,
            })
            onProjectOpened?.(selected)
            return true
        } catch (error) {
            showToast(
                t('appShell.toasts.projectOpenFailed', {
                    error: formatErrorMessage(error, t('common.unknownError')),
                }),
                'error',
            )
            return false
        }
    }, [onProjectOpened, t])

    const handleOpenProject = useCallback(async () => {
        try {
            const selected = await window.electronAPI.showOpenDialog({
                filters: [PROJECT_FILE_FILTER],
                properties: ['openFile'],
            })
            if (!selected) return false
            return await openProjectByPath(selected)
        } catch {
            return false
        }
    }, [openProjectByPath])

    const handleSaveProject = useCallback(async (forceChoosePath = false): Promise<boolean> => {
        if (saveInFlightRef.current) return false
        const savePathSource = useProjectStore.getState().projectPath
        const requestId = ++saveRequestRef.current
        saveInFlightRef.current = true

        try {
            const initialProjectPath = useProjectStore.getState().projectPath

            const data = serializeCurrentProject()
            if (requestId !== saveRequestRef.current) return false
            const result = await saveProjectPayload({
                payload: data,
                projectPath: savePathSource,
                t,
                forceChoosePath,
            })
            if (result.cancelled || !result.savePath) return false
            if (requestId !== saveRequestRef.current) return false

            const activeProjectPath = useProjectStore.getState().projectPath
            if (activeProjectPath === initialProjectPath) {
                setProjectPath(result.savePath)
                setDirty(false)
                clearDraftFromLocal()
                showToast(t('common.savedToast'), 'success')
                useSaveFeedbackStore.getState().clearSaveError()
            } else {
                useSaveFeedbackStore.getState().clearSaveError()
            }
            return true
        } catch (error) {
            showToast(
                t('appShell.toasts.saveFailed', {
                    error: formatErrorMessage(error, t('common.unknownError')),
                }),
                'error',
            )
            useSaveFeedbackStore
                .getState()
                .setSaveError(t('centerPane.saveErrorPinned'), 'manual')
            return false
        } finally {
            saveInFlightRef.current = false
        }
    }, [setDirty, setProjectPath, t])

    return {
        handleImportFile,
        handleExport,
        handleOpenProject,
        handleOpenProjectAtPath: openProjectByPath,
        handleSaveProject,
    }
}
