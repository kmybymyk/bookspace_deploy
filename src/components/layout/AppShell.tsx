import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import TitleBar, { type TitleBarProjectTab } from './TitleBar'
import LeftPane from './LeftPane'
import CenterPane from './CenterPane'
import RightPane from './RightPane'
import VerticalToolbox from './VerticalToolbox'
import type { InspectorMode } from './inspectorMode'
import { useChapterStore } from '../../features/chapters/useChapterStore'
import { DEFAULT_SETTINGS, useDesignStore } from '../../features/design-panel/useDesignStore'
import { useEditorStore } from '../../features/chapters/useEditorStore'
import { useAuthStore } from '../../features/auth/useAuthStore'
import { useEntitlementsStore } from '../../features/subscription/useEntitlementsStore'
import { useProjectStore } from '../../store'
import { useAutoSave } from '../../hooks/useAutoSave'
import type { BookMetadata, ProjectFile } from '../../types/project'
import { showToast } from '../../utils/toast'
import { clearDraftFromLocal, serializeCurrentProject } from '../../utils/projectSnapshot'
import ConfirmDialog from '../ui/ConfirmDialog'
import ThreeWayConfirmDialog from '../ui/ThreeWayConfirmDialog'
import { nanoid } from 'nanoid'
import { isEditorOnlyRelease } from '../../config/appMode'
import { insertNote } from '../../features/chapters/utils/noteCommands'
import { useProjectFileActions } from './hooks/useProjectFileActions'
import { useHistoryLoader } from './hooks/useHistoryLoader'
import { useHistoryRestore } from './hooks/useHistoryRestore'
import { basenameCrossPlatform, promoteRecentFile } from '../../features/home/homeStorage'
import { useSaveFeedbackStore } from '../../store/saveFeedbackStore'
import { deserializeProject } from '../../utils/projectManager'
import { applyProjectToWorkspace } from '../../utils/projectWorkspace'
import { saveProjectPayload } from '../../utils/projectSave'
import { formatErrorMessage } from '../../utils/errorMessage'
import type { AutoUpdateState } from '../../../shared/autoUpdateIpc'
import { useAuthSubscriptionActions } from './hooks/useAuthSubscriptionActions'

const ExportModal = lazy(() => import('../../features/export/ExportModal'))

interface ProjectTabState {
    id: string
    title: string
    projectPath: string | null
    payload: string
    isDirty: boolean
    updatedAt: string
}

interface AppShellProps {
    onRequestHome?: () => void
}

type UpdateUiPreviewMode = 'off' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'

export default function AppShell({ onRequestHome }: AppShellProps) {
    const editorOnlyMode = isEditorOnlyRelease()
    const { t, i18n } = useTranslation()
    const [showExport, setShowExport] = useState(false)
    const [isLeftPaneCollapsed, setIsLeftPaneCollapsed] = useState(false)
    const [isRightPaneCollapsed, setIsRightPaneCollapsed] = useState(false)
    const [inspectorMode, setInspectorMode] = useState<InspectorMode>('design')
    const [lastNonCopilotMode, setLastNonCopilotMode] = useState<Exclude<InspectorMode, 'copilot'>>('design')
    const [centerMode, setCenterMode] = useState<'edit' | 'preview'>('edit')
    const [centerPreviewMode, setCenterPreviewMode] = useState<'reflow' | 'spread'>('reflow')
    const [autoUpdateState, setAutoUpdateState] = useState<AutoUpdateState>({
        phase: 'unsupported',
        currentVersion: '',
        availableVersion: null,
        downloadedVersion: null,
        progressPercent: null,
        message: null,
        checkedAt: null,
    })
    const debugUpdateUiEnabled = import.meta.env.DEV && import.meta.env.VITE_DEBUG_UPDATE_UI === '1'
    const [updateUiPreviewMode, setUpdateUiPreviewMode] = useState<UpdateUiPreviewMode>(
        debugUpdateUiEnabled ? 'available' : 'off',
    )
    const hasAutoUpdateBridge =
        typeof window !== 'undefined' &&
        typeof window.electronAPI?.getAutoUpdateState === 'function' &&
        typeof window.electronAPI?.checkForAppUpdates === 'function' &&
        typeof window.electronAPI?.downloadAppUpdate === 'function' &&
        typeof window.electronAPI?.installAppUpdate === 'function'
    const [devAiEnabledOverride, setDevAiEnabledOverride] = useState<boolean | null>(() => {
        try {
            const raw = localStorage.getItem('bookspace_dev_ai_override')
            if (raw === 'on') return true
            if (raw === 'off') return false
        } catch {
            // noop
        }
        return null
    })
    const [projectTabs, setProjectTabs] = useState<ProjectTabState[]>([])
    const [activeProjectTabId, setActiveProjectTabId] = useState<string | null>(null)
    const [inactiveClosePrompt, setInactiveClosePrompt] = useState<{
        open: boolean
        tabTitle: string
    }>({ open: false, tabTitle: '' })
    const inactiveCloseResolverRef = useRef<((value: 'save' | 'discard' | 'cancel') => void) | null>(null)
    const updatePreviewTimerRef = useRef<number[]>([])
    const manualUpdateCheckPendingRef = useRef(false)
    const shellRef = useRef<HTMLDivElement | null>(null)
    const suppressInitialTabRef = useRef(false)
    const {
        projectPath,
        isDirty,
        metadata,
        setMetadata,
        setDirty,
        setProjectPath,
        rotateProjectSessionId,
    } = useProjectStore()
    const authSession = useAuthStore((state) => state.session)
    const setAuthSession = useAuthStore((state) => state.setSession)
    const plan = useEntitlementsStore((state) => state.snapshot.plan)
    const setEntitlementSnapshot = useEntitlementsStore((state) => state.setSnapshot)
    const isSignedIn = Boolean(authSession.isAuthenticated && authSession.user)
    const signedInLabel = authSession.user?.email ?? authSession.user?.displayName ?? null
    const { authBusy, handleUpgradeClick, handleGoogleSignIn, handleSignOut } = useAuthSubscriptionActions({
        t,
        setEntitlementSnapshot,
        setAuthSession,
    })
    const editor = useEditorStore((state) => state.editor)
    const chapterCount = useChapterStore((state) => state.chapters.length)
    const hasAnyPage = chapterCount > 0
    const hasSavedProject = Boolean(projectPath)
    const aiFeaturesEnabled = editorOnlyMode ? false : (devAiEnabledOverride ?? true)
    useAutoSave(projectPath)

    const buildTabTitle = useCallback((project: ProjectFile, path: string | null) => {
        if (path) {
            return basenameCrossPlatform(path)
        }
        return t('home.newProject')
    }, [t])

    const changeInspectorMode = useCallback(
        (mode: InspectorMode, options?: { expand?: boolean }) => {
            if (mode !== 'copilot') {
                setLastNonCopilotMode(mode)
            }
            setInspectorMode(mode)
            if (options?.expand !== false) {
                setIsRightPaneCollapsed(false)
            }
        },
        [],
    )

    const createTabSnapshotFromWorkspace = useCallback((tabId?: string): ProjectTabState => {
        const payload = serializeCurrentProject()
        const project = deserializeProject(payload)
        const currentPath = useProjectStore.getState().projectPath
        const currentDirty = useProjectStore.getState().isDirty
        return {
            id: tabId ?? nanoid(),
            title: buildTabTitle(project, currentPath),
            projectPath: currentPath,
            payload,
            isDirty: currentDirty,
            updatedAt: new Date().toISOString(),
        }
    }, [buildTabTitle])

    const saveActiveTabSnapshot = useCallback(() => {
        if (!activeProjectTabId) return
        const nextSnapshot = createTabSnapshotFromWorkspace(activeProjectTabId)
        setProjectTabs((prev) =>
            prev.map((tab) => (tab.id === activeProjectTabId ? nextSnapshot : tab)),
        )
    }, [activeProjectTabId, createTabSnapshotFromWorkspace])

    const openSnapshotInWorkspace = useCallback((tab: ProjectTabState) => {
        const project = deserializeProject(tab.payload)
        applyProjectToWorkspace(tab.projectPath, project, {
            setDirty: tab.isDirty,
            clearDraft: true,
        })
        useSaveFeedbackStore.getState().clearSaveError()
        changeInspectorMode('design')
        setCenterMode('edit')
        setCenterPreviewMode('reflow')
    }, [changeInspectorMode])

    const activateProjectTab = useCallback((tabId: string) => {
        if (tabId === activeProjectTabId) return
        const target = projectTabs.find((tab) => tab.id === tabId)
        if (!target) return

        if (activeProjectTabId) {
            const nextSnapshot = createTabSnapshotFromWorkspace(activeProjectTabId)
            setProjectTabs((prev) =>
                prev.map((tab) => (tab.id === activeProjectTabId ? nextSnapshot : tab)),
            )
        }

        openSnapshotInWorkspace(target)
        setActiveProjectTabId(tabId)
    }, [activeProjectTabId, createTabSnapshotFromWorkspace, openSnapshotInWorkspace, projectTabs])

    const appendCurrentWorkspaceAsTab = useCallback(() => {
        const nextTab = createTabSnapshotFromWorkspace()
        setProjectTabs((prev) => [...prev, nextTab])
        setActiveProjectTabId(nextTab.id)
        return nextTab.id
    }, [createTabSnapshotFromWorkspace])

    const { historyLoading, historySnapshots, historyLoadedAt, loadHistory } = useHistoryLoader(
        projectPath,
        (error) =>
            showToast(
                t('appShell.toasts.historyLoadFailed', {
                    error: formatErrorMessage(error, t('common.unknownError')),
                }),
                'error',
            ),
    )

    const { handleImportFile, handleSaveProject, handleOpenProject, handleOpenProjectAtPath, handleExport } = useProjectFileActions({
        t,
        setDirty,
        setMetadata,
        setProjectPath,
        rotateProjectSessionId,
        setShowExport,
        onProjectOpened: (path) => {
            changeInspectorMode('design')
            setCenterMode('edit')
            setCenterPreviewMode('reflow')
            useSaveFeedbackStore.getState().clearSaveError()
            promoteRecentFile(path)
            void loadHistory(path)
        },
    })

    const {
        restoreMode,
        showRestoreConfirm,
        requestRestoreSnapshot,
        confirmRestore,
        cancelRestore,
    } = useHistoryRestore({
        t,
        projectPath,
        loadHistory,
        onCompleted: () => {
            changeInspectorMode('design')
            setCenterMode('edit')
            setCenterPreviewMode('reflow')
        },
    })

    useEffect(() => {
        const syncByWindowWidth = () => {
            if (window.innerWidth < 1320) {
                setIsRightPaneCollapsed(true)
            }
        }
        syncByWindowWidth()
        window.addEventListener('resize', syncByWindowWidth)
        return () => window.removeEventListener('resize', syncByWindowWidth)
    }, [])

    useEffect(() => {
        if (hasSavedProject) return
        if (inspectorMode !== 'history') return
        changeInspectorMode('design')
    }, [changeInspectorMode, hasSavedProject, inspectorMode])

    useEffect(() => {
        if (aiFeaturesEnabled) return
        if (inspectorMode !== 'copilot') return
        changeInspectorMode('design')
    }, [aiFeaturesEnabled, changeInspectorMode, inspectorMode])

    useEffect(() => {
        if (suppressInitialTabRef.current) return
        if (projectTabs.length > 0) return
        const initialTab = createTabSnapshotFromWorkspace()
        setProjectTabs([initialTab])
        setActiveProjectTabId(initialTab.id)
    }, [createTabSnapshotFromWorkspace, projectTabs.length])

    useEffect(() => {
        if (!activeProjectTabId) return
        setProjectTabs((prev) =>
            prev.map((tab) => {
                if (tab.id !== activeProjectTabId) return tab
                const nextTitle = projectPath
                    ? basenameCrossPlatform(projectPath)
                    : t('home.newProject')
                return {
                    ...tab,
                    title: nextTitle,
                    projectPath,
                    isDirty,
                }
            }),
        )
    }, [activeProjectTabId, isDirty, metadata.title, projectPath, t])

    const openVersionManager = useCallback(() => {
        changeInspectorMode('history')
        void loadHistory()
    }, [changeInspectorMode, loadHistory])

    const confirmUnsavedTransition = useCallback(async () => {
        if (!useProjectStore.getState().isDirty) return true
        const decision = await window.electronAPI.confirmUnsavedChanges()
        if (decision === 'cancel') return false
        if (decision === 'discard') return true
        const saved = await handleSaveProject()
        return saved && !useProjectStore.getState().isDirty
    }, [handleSaveProject])

    const resetWorkspaceToBlankProject = useCallback(() => {
        const initialMetadata: BookMetadata = {
            title: '',
            subtitle: '',
            authors: [{ id: nanoid(), name: '', role: 'author' }],
            identifierType: 'isbn',
            identifier: '',
            language: 'ko',
            publisher: '',
            isbn: '',
            link: '',
            description: '',
        }
        setProjectPath(null)
        setMetadata(initialMetadata)
        useChapterStore.getState().setChapters([])
        useDesignStore.getState().setSettings(DEFAULT_SETTINGS)
        setDirty(false)
        clearDraftFromLocal()
        useSaveFeedbackStore.getState().clearSaveError()
        changeInspectorMode('design')
        setCenterMode('edit')
        setCenterPreviewMode('reflow')
    }, [changeInspectorMode, setDirty, setMetadata, setProjectPath])

    const requestInactiveTabCloseDecision = useCallback(async (tabTitle: string): Promise<'save' | 'discard' | 'cancel'> => {
        return await new Promise((resolve) => {
            inactiveCloseResolverRef.current = resolve
            setInactiveClosePrompt({ open: true, tabTitle })
        })
    }, [])

    const persistInactiveTabIfNeeded = useCallback(async (tab: ProjectTabState): Promise<ProjectTabState | null> => {
        if (!tab.isDirty) return tab
        const decision = await requestInactiveTabCloseDecision(tab.title)
        if (decision === 'cancel') return null
        if (decision === 'discard') {
            return { ...tab, isDirty: false, updatedAt: new Date().toISOString() }
        }
        try {
            const result = await saveProjectPayload({
                payload: tab.payload,
                projectPath: tab.projectPath,
                t,
            })
            if (result.cancelled || !result.savePath || !result.savedAt) return null
            useSaveFeedbackStore.getState().clearSaveError()
            showToast(t('common.savedToast'), 'success')
            return {
                ...tab,
                projectPath: result.savePath,
                title: basenameCrossPlatform(result.savePath),
                isDirty: false,
                updatedAt: result.savedAt,
            }
        } catch (error) {
            showToast(
                t('appShell.toasts.saveFailed', {
                    error: formatErrorMessage(error, t('common.unknownError')),
                }),
                'error',
            )
            useSaveFeedbackStore.getState().setSaveError(t('centerPane.saveErrorPinned'), 'manual')
            return null
        }
    }, [requestInactiveTabCloseDecision, t])

    const closeProjectTab = useCallback(async (tabId: string) => {
        const tabsBefore = projectTabs
        const targetTab = tabsBefore.find((tab) => tab.id === tabId)
        if (!targetTab) return

        const isClosingActive = tabId === activeProjectTabId
        const closingPromise = isClosingActive
            ? (async () => {
                const canClose = await confirmUnsavedTransition()
                if (!canClose) return null
                return createTabSnapshotFromWorkspace(tabId)
            })()
            : persistInactiveTabIfNeeded(targetTab)

        const closingSnapshot = await closingPromise
        if (!closingSnapshot) return

        const normalizedTabs = tabsBefore.map((tab) => (tab.id === tabId ? closingSnapshot : tab))
        const remainingTabs = normalizedTabs.filter((tab) => tab.id !== tabId)

        if (remainingTabs.length === 0) {
            resetWorkspaceToBlankProject()
            if (onRequestHome) {
                suppressInitialTabRef.current = true
                setProjectTabs([])
                setActiveProjectTabId(null)
                onRequestHome()
                return
            }
            const freshTab = createTabSnapshotFromWorkspace()
            setProjectTabs([freshTab])
            setActiveProjectTabId(freshTab.id)
            return
        }

        setProjectTabs(remainingTabs)
        if (!isClosingActive) {
            const stillActive = activeProjectTabId
                ? remainingTabs.find((tab) => tab.id === activeProjectTabId) ?? null
                : null
            if (stillActive) {
                setActiveProjectTabId(stillActive.id)
                return
            }
        }

        const closedIndex = normalizedTabs.findIndex((tab) => tab.id === tabId)
        const fallbackIndex = Math.max(0, Math.min(closedIndex - 1, remainingTabs.length - 1))
        const nextActiveTab = remainingTabs[fallbackIndex] ?? remainingTabs[0] ?? null
        if (nextActiveTab) {
            openSnapshotInWorkspace(nextActiveTab)
            setActiveProjectTabId(nextActiveTab.id)
        }
    }, [
        activeProjectTabId,
        confirmUnsavedTransition,
        createTabSnapshotFromWorkspace,
        openSnapshotInWorkspace,
        persistInactiveTabIfNeeded,
        projectTabs,
        resetWorkspaceToBlankProject,
        onRequestHome,
    ])

    useEffect(() => {
        return () => {
            if (inactiveCloseResolverRef.current) {
                inactiveCloseResolverRef.current('cancel')
                inactiveCloseResolverRef.current = null
            }
        }
    }, [inactiveCloseResolverRef])

    const handleNewProject = resetWorkspaceToBlankProject

    const runNewProjectInNewTab = useCallback(async () => {
        saveActiveTabSnapshot()
        handleNewProject()
        appendCurrentWorkspaceAsTab()
    }, [appendCurrentWorkspaceAsTab, handleNewProject, saveActiveTabSnapshot])

    const runOpenProjectInTabByPath = useCallback(async (path: string) => {
        const existing = projectTabs.find((tab) => tab.projectPath === path)
        if (existing) {
            activateProjectTab(existing.id)
            return true
        }
        saveActiveTabSnapshot()
        const opened = await handleOpenProjectAtPath(path)
        if (!opened) return false
        appendCurrentWorkspaceAsTab()
        return true
    }, [
        activateProjectTab,
        appendCurrentWorkspaceAsTab,
        handleOpenProjectAtPath,
        projectTabs,
        saveActiveTabSnapshot,
    ])

    const runOpenProjectInNewTab = useCallback(async () => {
        const previousActiveId = activeProjectTabId
        const previousActiveSnapshot = previousActiveId
            ? createTabSnapshotFromWorkspace(previousActiveId)
            : null
        saveActiveTabSnapshot()
        const opened = await handleOpenProject()
        if (!opened) return false
        const openedPath = useProjectStore.getState().projectPath
        if (!openedPath) {
            appendCurrentWorkspaceAsTab()
            return true
        }
        const existing = projectTabs.find((tab) => tab.projectPath === openedPath)
        if (existing) {
            if (previousActiveSnapshot) {
                setProjectTabs((prev) =>
                    prev.map((tab) => (tab.id === previousActiveSnapshot.id ? previousActiveSnapshot : tab)),
                )
            }
            const target = previousActiveSnapshot && previousActiveSnapshot.id === existing.id
                ? previousActiveSnapshot
                : existing
            openSnapshotInWorkspace(target)
            setActiveProjectTabId(target.id)
            return true
        }
        appendCurrentWorkspaceAsTab()
        return true
    }, [
        activeProjectTabId,
        appendCurrentWorkspaceAsTab,
        createTabSnapshotFromWorkspace,
        handleOpenProject,
        openSnapshotInWorkspace,
        projectTabs,
        saveActiveTabSnapshot,
    ])

    const runGuardedImportFile = useCallback(async (format: 'epub' | 'docx' | 'md') => {
        if (!(await confirmUnsavedTransition())) return
        await handleImportFile(format)
    }, [confirmUnsavedTransition, handleImportFile])

    // Cmd+S 단축키
    const isShortcutInActiveInput = useCallback((target: EventTarget | null): boolean => {
        if (!(target instanceof HTMLElement)) return false
        if (target.closest('[data-bookspace-modal-root="true"]')) return true
        if (target.isContentEditable) return true
        const tagName = target.tagName.toLowerCase()
        return tagName === 'input' || tagName === 'textarea' || tagName === 'select'
    }, [])

    const handleGlobalShortcut = useCallback(
        (event: KeyboardEvent) => {
            if (event.defaultPrevented) return
            if (isShortcutInActiveInput(event.target)) return

            const normalizedKey = event.key.toLowerCase()
            if ((event.metaKey || event.ctrlKey) && normalizedKey === 's') {
                event.preventDefault()
                void handleSaveProject()
                return
            }
            if (
                (event.metaKey || event.ctrlKey) &&
                event.shiftKey &&
                normalizedKey === 'v'
            ) {
                event.preventDefault()
                openVersionManager()
            }
        },
        [handleSaveProject, isShortcutInActiveInput, openVersionManager],
    )

    useEffect(() => {
        document.addEventListener('keydown', handleGlobalShortcut)
        return () => {
            document.removeEventListener('keydown', handleGlobalShortcut)
        }
    }, [handleGlobalShortcut])

    const clearUpdatePreviewTimers = useCallback(() => {
        updatePreviewTimerRef.current.forEach((timerId) => window.clearTimeout(timerId))
        updatePreviewTimerRef.current = []
    }, [])

    const applyUpdateUiPreviewMode = useCallback((mode: UpdateUiPreviewMode) => {
        clearUpdatePreviewTimers()
        if (mode === 'available') {
            setAutoUpdateState({
                phase: 'available',
                currentVersion: '0.1.2',
                availableVersion: '0.1.3',
                downloadedVersion: null,
                progressPercent: null,
                message: null,
                checkedAt: new Date().toISOString(),
            })
            return
        }
        if (mode === 'downloading') {
            setAutoUpdateState({
                phase: 'downloading',
                currentVersion: '0.1.2',
                availableVersion: '0.1.3',
                downloadedVersion: null,
                progressPercent: 0,
                message: null,
                checkedAt: new Date().toISOString(),
            })
            const steps = [18, 42, 68, 87, 100]
            steps.forEach((percent, index) => {
                const timerId = window.setTimeout(() => {
                    setAutoUpdateState((prev) =>
                        percent >= 100
                            ? {
                                ...prev,
                                phase: 'downloaded',
                                progressPercent: 100,
                                downloadedVersion: prev.availableVersion ?? '0.1.3',
                            }
                            : {
                                ...prev,
                                phase: 'downloading',
                                progressPercent: percent,
                            },
                    )
                }, (index + 1) * 220)
                updatePreviewTimerRef.current.push(timerId)
            })
            return
        }
        if (mode === 'not-available') {
            setAutoUpdateState({
                phase: 'not-available',
                currentVersion: '0.1.2',
                availableVersion: null,
                downloadedVersion: null,
                progressPercent: null,
                message: null,
                checkedAt: new Date().toISOString(),
            })
            return
        }
        if (mode === 'downloaded') {
            setAutoUpdateState({
                phase: 'downloaded',
                currentVersion: '0.1.2',
                availableVersion: '0.1.3',
                downloadedVersion: '0.1.3',
                progressPercent: 100,
                message: null,
                checkedAt: new Date().toISOString(),
            })
            return
        }
        if (mode === 'error') {
            setAutoUpdateState({
                phase: 'error',
                currentVersion: '0.1.2',
                availableVersion: null,
                downloadedVersion: null,
                progressPercent: null,
                message: '테스트 오류 상태',
                checkedAt: new Date().toISOString(),
            })
        }
    }, [clearUpdatePreviewTimers])

    useEffect(() => {
        if (updateUiPreviewMode !== 'off') {
            return
        }
        if (!hasAutoUpdateBridge) {
            setAutoUpdateState((prev) =>
                prev.phase === 'unsupported'
                    ? prev
                    : {
                          ...prev,
                          phase: 'unsupported',
                          availableVersion: null,
                          downloadedVersion: null,
                          progressPercent: null,
                          message: null,
                      },
            )
            return
        }
        void window.electronAPI.getAutoUpdateState().then(setAutoUpdateState).catch(() => undefined)
        const unsubscribe = window.electronAPI.onAutoUpdateStatus?.((next) => {
            setAutoUpdateState(next)
        })
        return () => {
            unsubscribe?.()
        }
    }, [hasAutoUpdateBridge, updateUiPreviewMode])

    useEffect(() => {
        if (updateUiPreviewMode === 'off') return
        applyUpdateUiPreviewMode(updateUiPreviewMode)
        return () => {
            clearUpdatePreviewTimers()
        }
    }, [applyUpdateUiPreviewMode, clearUpdatePreviewTimers, updateUiPreviewMode])

    const handleCheckForUpdates = useCallback(() => {
        if (updateUiPreviewMode !== 'off') {
            manualUpdateCheckPendingRef.current = true
            applyUpdateUiPreviewMode('available')
            return
        }
        if (!hasAutoUpdateBridge) return
        manualUpdateCheckPendingRef.current = true
        void window.electronAPI.checkForAppUpdates().then(setAutoUpdateState).catch(() => undefined)
    }, [applyUpdateUiPreviewMode, hasAutoUpdateBridge, updateUiPreviewMode])

    const handleDownloadUpdate = useCallback(() => {
        if (updateUiPreviewMode !== 'off') {
            applyUpdateUiPreviewMode('downloading')
            return
        }
        if (!hasAutoUpdateBridge) return
        void window.electronAPI.downloadAppUpdate().then(setAutoUpdateState).catch(() => undefined)
    }, [applyUpdateUiPreviewMode, hasAutoUpdateBridge, updateUiPreviewMode])

    const handleInstallUpdate = useCallback(() => {
        if (updateUiPreviewMode !== 'off') {
            showToast(t('titleBar.updateReady'), 'success')
            return
        }
        if (!hasAutoUpdateBridge) return
        void window.electronAPI
            .installAppUpdate()
            .then((result) => {
                if (result.success) return
                if (result.reason === 'dirty-state') {
                    showToast(t('titleBar.updateDirtyStateBlocked'), 'warning')
                }
            })
            .catch(() => undefined)
    }, [hasAutoUpdateBridge, t, updateUiPreviewMode])

    useEffect(() => {
        if (!manualUpdateCheckPendingRef.current) return
        if (autoUpdateState.phase === 'checking' || autoUpdateState.phase === 'idle') return

        if (autoUpdateState.phase === 'not-available') {
            showToast(t('appShell.toasts.updateUpToDate'), 'info')
            manualUpdateCheckPendingRef.current = false
            return
        }

        if (autoUpdateState.phase === 'error') {
            showToast(
                t('appShell.toasts.updateCheckFailed', {
                    error: autoUpdateState.message ?? t('common.unknownError'),
                }),
                'error',
            )
            manualUpdateCheckPendingRef.current = false
            return
        }

        if (autoUpdateState.phase === 'available' || autoUpdateState.phase === 'downloaded') {
            manualUpdateCheckPendingRef.current = false
        }
    }, [autoUpdateState, t])

    useEffect(() => {
        if (typeof window.electronAPI.onMenuAction !== 'function') return
        const unsubscribe = window.electronAPI.onMenuAction((action) => {
            if (action === 'new-project') {
                void runNewProjectInNewTab()
                return
            }
            if (action === 'save-project') {
                void handleSaveProject()
                return
            }
            if (action === 'save-project-as') {
                void handleSaveProject(true)
                return
            }
            if (action === 'import-epub') {
                void runGuardedImportFile('epub')
                return
            }
            if (action === 'import-docx') {
                void runGuardedImportFile('docx')
                return
            }
            if (action === 'import-md') {
                void runGuardedImportFile('md')
                return
            }
            if (action === 'open-export') {
                setShowExport(true)
                return
            }
            if (action === 'open-version-manager') {
                openVersionManager()
                return
            }
            if (action === 'view-edit') {
                setCenterMode('edit')
                return
            }
            if (action === 'view-preview-reflow') {
                setCenterMode('preview')
                setCenterPreviewMode('reflow')
                return
            }
            if (action === 'view-preview-spread') {
                setCenterMode('preview')
                setCenterPreviewMode('spread')
                return
            }
            if (action === 'toggle-left-pane') {
                setIsLeftPaneCollapsed((prev) => !prev)
                return
            }
            if (action === 'toggle-right-pane') {
                setIsRightPaneCollapsed((prev) => !prev)
                return
            }
            if (action === 'check-for-updates') {
                handleCheckForUpdates()
                return
            }
            if (action === 'dev-ai-enable') {
                setDevAiEnabledOverride(true)
                try {
                    localStorage.setItem('bookspace_dev_ai_override', 'on')
                } catch {
                    // noop
                }
                return
            }
            if (action === 'dev-ai-disable') {
                setDevAiEnabledOverride(false)
                try {
                    localStorage.setItem('bookspace_dev_ai_override', 'off')
                } catch {
                    // noop
                }
                if (inspectorMode === 'copilot') {
                    changeInspectorMode('design')
                }
                return
            }
            if (action === 'dev-lang-ko') {
                void i18n.changeLanguage('ko')
                return
            }
            if (action === 'dev-lang-en') {
                void i18n.changeLanguage('en')
                return
            }
            if (action === 'update-test-reset') {
                setUpdateUiPreviewMode('off')
                return
            }
            if (action === 'update-test-available') {
                setUpdateUiPreviewMode('available')
                return
            }
            if (action === 'update-test-not-available') {
                setUpdateUiPreviewMode('not-available')
                return
            }
            if (action === 'update-test-downloading') {
                setUpdateUiPreviewMode('downloading')
                return
            }
            if (action === 'update-test-downloaded') {
                setUpdateUiPreviewMode('downloaded')
                return
            }
            if (action === 'update-test-error') {
                setUpdateUiPreviewMode('error')
            }
        })
        return unsubscribe
    }, [changeInspectorMode, openVersionManager, handleSaveProject, runGuardedImportFile, runNewProjectInNewTab, handleCheckForUpdates, i18n, inspectorMode])

    useEffect(() => {
        const unsubscribe = window.electronAPI.onFileOpened((path) => {
            void (async () => {
                const opened = await runOpenProjectInTabByPath(path)
                if (!opened) return
            })()
        })
        return unsubscribe
    }, [runOpenProjectInTabByPath])

    return (
        <div
            ref={shellRef}
            className="ds-shell ui-nonselect flex h-screen flex-col overflow-hidden"
        >
            <a
                href="#center-pane-main"
                className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-[var(--ds-surface-card)] focus:px-3 focus:py-1.5 focus:text-xs focus:text-[var(--ds-text-neutral-primary)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--ds-brand-500)_28%,transparent)]"
            >
                {t('common.skipToContent', { defaultValue: '본문으로 이동' })}
            </a>
            <TitleBar
                plan={plan}
                isSignedIn={isSignedIn}
                signedInLabel={signedInLabel}
                showSubscriptionControls={false}
                leftPaneCollapsed={isLeftPaneCollapsed}
                projectTabs={projectTabs.map<TitleBarProjectTab>((tab) => ({
                    id: tab.id,
                    title: tab.title,
                    isDirty: tab.isDirty,
                }))}
                activeProjectTabId={activeProjectTabId}
                onSelectProjectTab={activateProjectTab}
                onCreateProjectTab={() => {
                    void runNewProjectInNewTab()
                }}
                onCloseProjectTab={(tabId) => {
                    void closeProjectTab(tabId)
                }}
                autoUpdateState={autoUpdateState}
                onDownloadUpdate={handleDownloadUpdate}
                onInstallUpdate={handleInstallUpdate}
            />
            <div className="flex flex-1 overflow-hidden">
                <LeftPane
                    collapsed={isLeftPaneCollapsed}
                    onToggleCollapse={() => setIsLeftPaneCollapsed((prev) => !prev)}
                    showAccountFooter={aiFeaturesEnabled}
                    plan={plan}
                    isSignedIn={isSignedIn}
                    signedInLabel={signedInLabel}
                    authBusy={authBusy}
                    onUpgradeClick={handleUpgradeClick}
                    onGoogleSignInClick={handleGoogleSignIn}
                    onSignOutClick={handleSignOut}
                />
                <VerticalToolbox
                    activeMode={inspectorMode}
                    centerMode={centerMode}
                    onChangeMode={(mode) => {
                        if (mode === 'history') {
                            openVersionManager()
                            return
                        }
                        if (mode === 'copilot' && !aiFeaturesEnabled) {
                            return
                        }
                        changeInspectorMode(mode)
                    }}
                    onImportFile={(format) => {
                        void runGuardedImportFile(format)
                    }}
                    onExport={() => setShowExport(true)}
                    onAddFootnote={() => {
                        if (editor) insertNote(editor, 'footnote')
                    }}
                    onAddEndnote={() => {
                        if (editor) insertNote(editor, 'endnote')
                    }}
                    onOpenFindReplace={() => {
                        window.dispatchEvent(new Event('bookspace:open-find-replace'))
                    }}
                    notesDisabled={!editor}
                    showWritingTools={hasAnyPage}
                    showHistoryTool={hasSavedProject}
                    showAiTool={aiFeaturesEnabled}
                />
                <CenterPane
                    onNewProject={() => {
                        void runNewProjectInNewTab()
                    }}
                    onOpenProject={() => {
                        void runOpenProjectInNewTab()
                    }}
                    onOpenRecentProject={(path) => runOpenProjectInTabByPath(path)}
                    onSaveProject={() => {
                        void handleSaveProject()
                    }}
                    mode={centerMode}
                    onModeChange={setCenterMode}
                    previewMode={centerPreviewMode}
                    onPreviewModeChange={setCenterPreviewMode}
                />
                <RightPane
                    mode={inspectorMode}
                    lastNonCopilotMode={lastNonCopilotMode}
                    historyLoading={historyLoading}
                    projectPath={projectPath}
                    historySnapshots={historySnapshots}
                    historyLoadedAt={historyLoadedAt}
                    onRefreshHistory={() => {
                        void loadHistory()
                    }}
                    onRestoreSnapshot={requestRestoreSnapshot}
                    onSaveProject={() => {
                        void handleSaveProject()
                    }}
                    onChangeMode={(mode) => {
                        if (mode === 'history') {
                            openVersionManager()
                            return
                        }
                        if (mode === 'copilot' && !aiFeaturesEnabled) {
                            return
                        }
                        changeInspectorMode(mode)
                    }}
                    collapsed={isRightPaneCollapsed}
                    onToggleCollapse={() => setIsRightPaneCollapsed((prev) => !prev)}
                />
            </div>
            {showExport && (
                <Suspense fallback={null}>
                    <ExportModal
                        initialMetadata={metadata}
                        initialEmbedFonts={useDesignStore.getState().settings.fontEmbedMode === 'selected'}
                        onExport={handleExport}
                        onClose={() => setShowExport(false)}
                    />
                </Suspense>
            )}
            <ConfirmDialog
                open={showRestoreConfirm}
                title={
                    restoreMode === 'replace'
                        ? t('appShell.confirm.restoreReplaceTitle')
                        : t('appShell.confirm.restoreNewFileTitle')
                }
                description={
                    restoreMode === 'replace'
                        ? t('appShell.confirm.restoreReplaceDescription')
                        : t('appShell.confirm.restoreNewFileDescription')
                }
                confirmLabel={t('common.confirm')}
                cancelLabel={t('common.cancel')}
                onCancel={cancelRestore}
                onConfirm={() => {
                    void confirmRestore()
                }}
            />
            <ThreeWayConfirmDialog
                open={inactiveClosePrompt.open}
                title={t('appShell.inactiveTabClose.title', { defaultValue: '탭을 닫기 전에 저장할까요?' })}
                description={t('appShell.inactiveTabClose.description', {
                    defaultValue: `"{{title}}" 변경 사항을 저장한 후 탭을 닫습니다.`,
                    title: inactiveClosePrompt.tabTitle || t('home.newProject'),
                })}
                cancelLabel={t('common.cancel')}
                secondaryLabel={t('common.discard', { defaultValue: '폐기' })}
                primaryLabel={t('common.save', { defaultValue: '저장' })}
                onCancel={() => {
                    inactiveCloseResolverRef.current?.('cancel')
                    inactiveCloseResolverRef.current = null
                    setInactiveClosePrompt({ open: false, tabTitle: '' })
                }}
                onSecondary={() => {
                    inactiveCloseResolverRef.current?.('discard')
                    inactiveCloseResolverRef.current = null
                    setInactiveClosePrompt({ open: false, tabTitle: '' })
                }}
                onPrimary={() => {
                    inactiveCloseResolverRef.current?.('save')
                    inactiveCloseResolverRef.current = null
                    setInactiveClosePrompt({ open: false, tabTitle: '' })
                }}
            />
        </div>
    )
}
