import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import HomeHelpModal from './HomeHelpModal'
import {
  basenameCrossPlatform,
  dirnameCrossPlatform,
  getLastManualSaveProject,
  getRecentProjectFiles,
  promoteRecentFile,
  removeRecentFile,
} from './homeStorage'
import { PROJECT_FILE_FILTER } from '../../../shared/filePolicy'
import DsButton from '../../components/ui/ds/DsButton'
import DsCard from '../../components/ui/ds/DsCard'
import { CircleHelp, Clock3, FolderOpen, History, Lightbulb, PenSquare, Sparkles } from 'lucide-react'
import fileIcon from '../../../file.png'
import { showToast } from '../../utils/toast'

interface HomeScreenProps {
  onNewProject: () => void
  onNewTemplateProject: () => void
  onOpenProject: (path: string) => Promise<boolean>
  onResumeLastSaved: (path?: string) => Promise<void>
  editorOnlyMode?: boolean
  openHelpSignal?: number
}

export default function HomeScreen({
  onNewProject,
  onNewTemplateProject,
  onOpenProject,
  onResumeLastSaved,
  editorOnlyMode = false,
  openHelpSignal = 0,
}: HomeScreenProps) {
  const { t } = useTranslation()
  const [showHelp, setShowHelp] = useState(false)
  const [pendingAction, setPendingAction] = useState<'new' | 'quick' | 'open' | 'resume' | null>(null)
  const [openingRecentPath, setOpeningRecentPath] = useState<string | null>(null)
  const [recentFiles, setRecentFiles] = useState<string[]>([])
  const [resumePath, setResumePath] = useState<string | null>(null)
  const [showResumeUnavailableHint, setShowResumeUnavailableHint] = useState(false)

  const canReadProjectFile = async (path: string) => {
    try {
      await window.electronAPI.readFile(path)
      return true
    } catch {
      return false
    }
  }

  useEffect(() => {
    if (openHelpSignal <= 0) return
    setShowHelp(true)
  }, [openHelpSignal])

  useEffect(() => {
    let mounted = true
    const refreshTargets = async () => {
      const recent = getRecentProjectFiles()
      const validatedRecent: string[] = []
      for (const path of recent) {
        if (await canReadProjectFile(path)) {
          validatedRecent.push(path)
        } else {
          removeRecentFile(path)
        }
      }
      const lastManual = getLastManualSaveProject()
      const validResumePath =
        lastManual?.path && (await canReadProjectFile(lastManual.path)) ? lastManual.path : null
      if (!mounted) return
      setRecentFiles(validatedRecent)
      setResumePath(validResumePath)
    }
    void refreshTargets()
    return () => {
      mounted = false
    }
  }, [])

  const syncRecentFiles = async () => {
    const recent = getRecentProjectFiles()
    const validatedRecent: string[] = []
    for (const path of recent) {
      if (await canReadProjectFile(path)) {
        validatedRecent.push(path)
      } else {
        removeRecentFile(path)
      }
    }
    const lastManual = getLastManualSaveProject()
    const validResumePath =
      lastManual?.path && (await canReadProjectFile(lastManual.path)) ? lastManual.path : null
    setRecentFiles(validatedRecent)
    setResumePath(validResumePath)
    if (validResumePath) {
      setShowResumeUnavailableHint(false)
    }
  }

  const handleOpen = async () => {
    setPendingAction('open')
    const path = await window.electronAPI.showOpenDialog({
      filters: [PROJECT_FILE_FILTER],
      properties: ['openFile'],
    })
    if (!path) {
      setPendingAction(null)
      return
    }

    const opened = await onOpenProject(path)
    if (opened) {
      promoteRecentFile(path)
      await syncRecentFiles()
    }
    setPendingAction(null)
  }

  const quickSteps = [
    {
      id: '01',
      badge: t('home.step1Badge'),
      title: t('home.stepPlanTitle'),
      description: t('home.stepPlanDesc'),
    },
    {
      id: '02',
      badge: t('home.step2Badge'),
      title: t('home.stepWriteTitle'),
      description: t('home.stepWriteDesc'),
    },
    {
      id: '03',
      badge: t('home.step3Badge'),
      title: t('home.stepPublishTitle'),
      description: t('home.stepPublishDesc'),
    },
  ]
  return (
    <div className="ui-nonselect flex h-screen flex-col overflow-hidden bg-[var(--ds-surface-canvas)] text-[var(--ds-text-primary)] md:flex-row">
      <div className="flex min-h-0 flex-1 flex-col justify-center gap-6 bg-gradient-to-b from-[var(--ds-surface-canvas)] to-[var(--ds-surface-panel)] px-5 py-6 md:gap-8 md:px-12 md:py-8 lg:px-16">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 md:gap-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="mb-2 text-3xl font-bold tracking-tight md:text-5xl">{t('common.appName')}</div>
              <p className="ds-text-body text-[var(--ds-text-muted)]">
                {editorOnlyMode ? t('home.heroSubtitleEditorOnly') : t('home.heroSubtitle')}
              </p>
            </div>
            <DsButton onClick={() => setShowHelp(true)} size="sm" className="inline-flex items-center gap-1.5">
              <CircleHelp size={14} />
              {t('home.help')}
            </DsButton>
          </div>

          <div className="rounded-lg border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-card-subtle)] p-3.5 md:p-4">
            <div className="mb-2 inline-flex items-center gap-1.5 ds-label uppercase tracking-wider text-[var(--ds-text-muted)]">
              <Lightbulb size={13} />
              {t('home.tipsLabel')}
            </div>
            <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-stretch">
              {quickSteps.map((step, index) => (
                <div key={step.id} className="contents">
                  <div
                    className="flex flex-col rounded-md border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-panel)] px-4 py-3 transition-transform duration-200 ease-out"
                    style={{ transitionDelay: `${index * 60}ms` }}
                  >
                    <div className="ds-badge w-fit border-[var(--ds-border-default)]/60 bg-[var(--ds-surface-canvas)]/90 tracking-wide text-[var(--ds-text-muted)]">
                      {step.badge}
                    </div>
                    <div className="mt-3 ds-text-section text-[var(--ds-text-secondary)]">{step.title}</div>
                    <div className="mt-2 max-w-[36ch] ds-text-body text-[var(--ds-text-muted)]">{step.description}</div>
                  </div>
                  {index < quickSteps.length - 1 ? (
                    <div className="hidden items-center justify-center ds-hint font-medium text-[var(--ds-text-muted)]/40 md:flex" aria-hidden="true">
                      →
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <div className="grid w-full grid-cols-1 gap-3 md:grid-cols-3">
            <DsButton
              onClick={() => {
                setPendingAction('new')
                onNewProject()
              }}
              loading={pendingAction === 'new'}
              variant="primary"
              className="w-full rounded-md py-3 inline-flex items-center justify-center gap-1.5"
            >
              <Sparkles size={16} />
              {pendingAction === 'new' ? t('common.loading') : t('home.newProject')}
            </DsButton>
            <DsButton
              onClick={() => {
                setPendingAction('quick')
                onNewTemplateProject()
              }}
              loading={pendingAction === 'quick'}
              className="w-full rounded-md py-3 inline-flex items-center justify-center gap-1.5"
            >
              <PenSquare size={16} />
              {pendingAction === 'quick' ? t('common.loading') : t('home.quickStart')}
            </DsButton>
            <DsButton onClick={handleOpen} loading={pendingAction === 'open'} className="w-full rounded-md py-3 inline-flex items-center justify-center gap-1.5">
              <FolderOpen size={16} />
              {pendingAction === 'open' ? t('common.loading') : t('home.openFile')}
            </DsButton>
            <DsButton
              onClick={async () => {
                if (!resumePath) {
                  setShowResumeUnavailableHint(true)
                  return
                }
                setShowResumeUnavailableHint(false)
                setPendingAction('resume')
                await onResumeLastSaved(resumePath)
                setPendingAction(null)
              }}
              loading={pendingAction === 'resume'}
              aria-disabled={!resumePath}
              className={`md:col-span-3 w-full rounded-md border-[var(--ds-accent-emerald-border)] bg-[var(--ds-accent-emerald-bg)] py-3 text-[var(--ds-accent-emerald-text)] inline-flex items-center justify-center gap-1.5 ${
                resumePath ? 'hover:bg-[var(--ds-fill-success-weak)]' : 'opacity-50'
              }`}
            >
              <History size={16} />
              {pendingAction === 'resume'
                ? t('common.loading')
                : resumePath
                  ? t('home.resumeWorkWithFile', { fileName: basenameCrossPlatform(resumePath) })
                  : t('home.resumeWorkNoTime')}
            </DsButton>
            {!resumePath && showResumeUnavailableHint && (
              <p className="md:col-span-3 -mt-1 text-center ds-hint text-[var(--ds-text-muted)]">{t('home.resumeUnavailable')}</p>
            )}
          </div>

          <DsCard className="w-full rounded-md px-4 py-3">
            <div className="ds-label text-[var(--ds-text-muted)]">{t('home.supportedFormats')}</div>
            <div className="mt-1 ds-text-body text-[var(--ds-text-secondary)]">{t('home.quickStartHint')}</div>
            <div className="mt-1 ds-hint text-[var(--ds-text-muted)]">{t('home.safetyHint')}</div>
          </DsCard>
        </div>
      </div>

      {recentFiles.length > 0 && (
        <div className="flex max-h-[38vh] min-h-0 flex-col border-t border-[var(--ds-border-subtle)] bg-[var(--ds-surface-panel)] p-4 md:max-h-none md:w-80 md:min-w-80 md:border-l md:border-t-0">
          <h2 className="mb-3 inline-flex items-center gap-1.5 ds-label uppercase tracking-widest text-[var(--ds-text-muted)]">
            <Clock3 size={13} />
            {t('home.recentFiles')}
          </h2>
          <div className="flex flex-col gap-1.5 overflow-y-auto pr-1">
            {recentFiles.map((filePath) => {
              const name = basenameCrossPlatform(filePath)
              const parentPath = dirnameCrossPlatform(filePath)
              return (
                <button
                  key={filePath}
                  onClick={async () => {
                    setOpeningRecentPath(filePath)
                    const opened = await onOpenProject(filePath)
                    if (opened) {
                      promoteRecentFile(filePath)
                      await syncRecentFiles()
                    } else {
                      removeRecentFile(filePath)
                      await syncRecentFiles()
                      showToast(t('centerPane.recentFileRemoved'), 'info')
                    }
                    setOpeningRecentPath(null)
                  }}
                  className="group cursor-pointer rounded-md border border-transparent px-3 py-2.5 text-left transition-colors duration-200 hover:border-[var(--ds-border-default)] hover:bg-[var(--ds-surface-control)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-border-brand-weak)]"
                >
                  <div className="inline-flex w-full items-center gap-1.5 truncate ds-text-body text-[var(--ds-text-secondary)] group-hover:text-[var(--ds-text-primary)]">
                    <img src={fileIcon} alt="" className="h-4 w-4 shrink-0 rounded-[4px] object-cover opacity-90" />
                    {openingRecentPath === filePath ? `${name} · ${t('common.loading')}` : name}
                  </div>
                  <div className="mt-0.5 w-full truncate pl-[22px] ds-hint text-[var(--ds-text-muted)]">
                    <span className="truncate">{parentPath}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <HomeHelpModal
        open={showHelp}
        onClose={() => setShowHelp(false)}
        onQuickStart={onNewTemplateProject}
        onOpenFile={handleOpen}
        onNewProject={onNewProject}
      />
    </div>
  )
}
