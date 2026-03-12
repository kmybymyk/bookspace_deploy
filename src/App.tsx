import { useState, useEffect, useCallback, lazy, Suspense, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { nanoid } from 'nanoid'
import ErrorBoundary from './components/ErrorBoundary'
import ToastViewport from './components/ui/ToastViewport'
import HomeScreen from './features/home/HomeScreen'
import { useProjectStore } from './store'
import { useChapterStore } from './features/chapters/useChapterStore'
import { useDesignStore } from './features/design-panel/useDesignStore'
import { useEntitlementsStore } from './features/subscription/useEntitlementsStore'
import { subscriptionApi } from './features/subscription/subscriptionApi'
import { useAuthStore } from './features/auth/useAuthStore'
import { authApi } from './features/auth/authApi'
import { showToast } from './utils/toast'
import { formatErrorMessage } from './utils/errorMessage'
import { applyProjectToWorkspace, loadProjectFromPath } from './utils/projectWorkspace'
import { createEmptyMetadata, createQuickStartTemplate } from './features/home/quickStartTemplate'
import { getLastManualSaveProject, promoteRecentFile } from './features/home/homeStorage'
import { isImportExtension, isProjectExtension } from '../shared/filePolicy'
import { isEditorOnlyRelease } from './config/appMode'
import { registerBookspaceQaDebug } from './features/qa/bookspaceQaDebug'
import type { SubscriptionPlan } from '../shared/entitlements'

const AppShell = lazy(() => import('./components/layout/AppShell'))

function readDevPlanOverride(): SubscriptionPlan | null {
  try {
    const raw = localStorage.getItem('bookspace_dev_plan_override')
    return raw === 'FREE' || raw === 'PRO_LITE' || raw === 'PRO' ? raw : null
  } catch {
    return null
  }
}

export default function App() {
  const editorOnlyMode = isEditorOnlyRelease()
  const { t, i18n } = useTranslation()
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
  const [devPlanOverride, setDevPlanOverride] = useState<SubscriptionPlan | null>(() => readDevPlanOverride())
  const { projectPath } = useProjectStore()
  const setEntitlementSnapshot = useEntitlementsStore((state) => state.setSnapshot)
  const updateEntitlementSnapshot = useEntitlementsStore((state) => state.updateSnapshot)
  const authSession = useAuthStore((state) => state.session)
  const setAuthSession = useAuthStore((state) => state.setSession)
  const authUserId = authSession.user?.userId ?? null
  const [isEditing, setIsEditing] = useState(false)
  const [homeHelpSignal, setHomeHelpSignal] = useState(0)
  const openProjectRequestRef = useRef(0)
  const showEditor = isEditing || !!projectPath
  const aiFeaturesEnabled = editorOnlyMode ? false : (devAiEnabledOverride ?? true)

  const handleReturnHome = useCallback(() => {
    useProjectStore.getState().setProjectPath(null)
    setIsEditing(false)
  }, [])

  const handleNewProject = useCallback(() => {
    useProjectStore.getState().rotateProjectSessionId()
    useProjectStore.getState().setProjectPath(null)
    useProjectStore.getState().setMetadata(createEmptyMetadata(nanoid))
    useChapterStore.getState().setChapters([])
    useDesignStore.getState().applyTheme('novel')
    useProjectStore.getState().setDirty(false)
    setIsEditing(true)
  }, [])

  const handleNewTemplateProject = useCallback(() => {
    const template = createQuickStartTemplate(nanoid, (key, defaultValue) =>
      t(key, { defaultValue }) as string,
    )
    useProjectStore.getState().rotateProjectSessionId()
    useProjectStore.getState().setProjectPath(null)
    useProjectStore.getState().setMetadata(template.metadata)
    useChapterStore.getState().setChapters(template.chapters)
    useDesignStore.getState().applyTheme('novel')
    useProjectStore.getState().setDirty(true)
    setIsEditing(true)
  }, [t])

  const openProject = useCallback(async (path: string) => {
    const requestId = ++openProjectRequestRef.current
    try {
      const extension = path.split('.').pop()?.toLowerCase()
      if (requestId !== openProjectRequestRef.current) {
        return false
      }

      if (isProjectExtension(extension)) {
        const project = await loadProjectFromPath(path)
        if (requestId !== openProjectRequestRef.current) {
            return false
        }
        applyProjectToWorkspace(path, project, { setDirty: false })
        setIsEditing(true)
        return true
      }

      if (isImportExtension(extension)) {
        if (requestId !== openProjectRequestRef.current) return false
        throw new Error(t('home.errors.useImportForExternal'))
      }

      if (requestId !== openProjectRequestRef.current) return false
      throw new Error(t('home.errors.unsupportedOpenType'))
    } catch (error) {
      if (requestId !== openProjectRequestRef.current) return false
      showToast(t('home.errors.openFailed', { error: formatErrorMessage(error, t('common.unknownError')) }), 'error')
      return false
    }
  }, [t])

  const handleResumeLastSaved = useCallback(async (path?: string) => {
    const targetPath = path ?? getLastManualSaveProject()?.path
    if (!targetPath) {
      showToast(t('home.errors.resumeNotFound'), 'error')
      return
    }
    const opened = await openProject(targetPath)
    if (!opened) return
    promoteRecentFile(targetPath)
  }, [openProject, t])

  useEffect(() => {
    return registerBookspaceQaDebug()
  }, [])

  useEffect(() => {
    if (showEditor) return
    let disposed = false
    const openFromPath = async (path: string) => {
      if (disposed) return
      const opened = await openProject(path)
      if (!opened || disposed) return
      promoteRecentFile(path)
    }
    const unsubscribe = window.electronAPI.onFileOpened((path) => {
      void openFromPath(path)
    })
    if (typeof window.electronAPI.consumeStartupOpenFile === 'function') {
      void (async () => {
        const startupPath = await window.electronAPI.consumeStartupOpenFile()
        if (!startupPath) return
        await openFromPath(startupPath)
      })()
    }
    return () => {
      disposed = true
      unsubscribe()
    }
  }, [openProject, showEditor])

  useEffect(() => {
    if (!aiFeaturesEnabled) {
      setAuthSession({
        user: null,
        isAuthenticated: false,
        fetchedAt: new Date().toISOString(),
      })
      return
    }
    let mounted = true
    const syncAuthSession = async () => {
      try {
        const result = await authApi.getAuthSession()
        if (!mounted) return
        setAuthSession(result)
      } catch (error) {
        console.warn('[Auth] auth session sync failed:', error)
      }
    }
    void syncAuthSession()
    return () => {
      mounted = false
    }
  }, [aiFeaturesEnabled, setAuthSession])

  useEffect(() => {
    if (!aiFeaturesEnabled) {
      updateEntitlementSnapshot({
        plan: devPlanOverride ?? 'FREE',
        aiCreditsRemaining: null,
      })
      return
    }
    if (devPlanOverride) {
      updateEntitlementSnapshot({
        plan: devPlanOverride,
        aiCreditsRemaining: null,
      })
      return
    }
    let mounted = true
    const syncEntitlements = async () => {
      try {
        const result = await subscriptionApi.getEntitlementsSnapshot()
        if (!mounted) return
        setEntitlementSnapshot(result.snapshot)
      } catch (error) {
        console.warn('[Subscription] entitlements sync failed:', error)
      }
    }
    void syncEntitlements()
    return () => {
      mounted = false
    }
  }, [aiFeaturesEnabled, authUserId, devPlanOverride, setEntitlementSnapshot, updateEntitlementSnapshot])

  useEffect(() => {
    if (typeof window.electronAPI.onMenuAction !== 'function') return
    const unsubscribe = window.electronAPI.onMenuAction((action) => {
      if (action === 'new-project' && !showEditor) {
        handleNewProject()
        return
      }
      if (action === 'open-help') {
        if (showEditor) {
          showToast(t('home.helpTitle'), 'info')
          return
        }
        setHomeHelpSignal((prev) => prev + 1)
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
      if (action === 'dev-ai-enable') {
        try {
          localStorage.setItem('bookspace_dev_ai_override', 'on')
          setDevAiEnabledOverride(true)
        } catch {
          // noop
        }
        return
      }
      if (action === 'dev-ai-disable') {
        try {
          localStorage.setItem('bookspace_dev_ai_override', 'off')
          setDevAiEnabledOverride(false)
        } catch {
          // noop
        }
        return
      }
      if (action === 'dev-plan-free' || action === 'dev-plan-pro-lite' || action === 'dev-plan-pro') {
        const nextPlan: SubscriptionPlan =
          action === 'dev-plan-free' ? 'FREE' : action === 'dev-plan-pro-lite' ? 'PRO_LITE' : 'PRO'
        try {
          localStorage.setItem('bookspace_dev_plan_override', nextPlan)
        } catch {
          // noop
        }
        setDevPlanOverride(nextPlan)
        updateEntitlementSnapshot({
          plan: nextPlan,
          aiCreditsRemaining: null,
        })
        return
      }
    })
    return unsubscribe
  }, [handleNewProject, i18n, showEditor, t, updateEntitlementSnapshot])

  useEffect(() => {
    const sync = (dirty: boolean) => {
      void window.electronAPI.setDirtyState(dirty)
    }
    sync(useProjectStore.getState().isDirty)
    const unsubscribe = useProjectStore.subscribe((state) => {
      sync(state.isDirty)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    const report = (payload: { message: string; stack?: string; source?: string; extra?: string; level?: 'error' | 'warn' }) => {
      void window.electronAPI.reportError(payload).catch(() => undefined)
    }

    const onError = (event: ErrorEvent) => {
      report({
        level: 'error',
        message: event.message || 'Unhandled renderer error',
        stack: event.error?.stack,
        source: event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : 'window.onerror',
      })
    }

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason
      report({
        level: 'error',
        message: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
        source: 'unhandledrejection',
        extra: typeof reason === 'string' ? reason : undefined,
      })
    }

    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  return (
        <ErrorBoundary>
          <>
        {!showEditor ? (
          <HomeScreen
            onNewProject={handleNewProject}
            onNewTemplateProject={handleNewTemplateProject}
            onOpenProject={openProject}
            onResumeLastSaved={handleResumeLastSaved}
            editorOnlyMode={editorOnlyMode}
            openHelpSignal={homeHelpSignal}
          />
        ) : (
          <Suspense fallback={<div className="h-screen bg-neutral-900" />}>
            <AppShell onRequestHome={handleReturnHome} />
          </Suspense>
        )}
        <ToastViewport />
      </>
    </ErrorBoundary>
  )
}
