import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SubscriptionPlan } from '../../../shared/entitlements'
import type { AutoUpdateState } from '../../../shared/autoUpdateIpc'
import DsButton from '../ui/ds/DsButton'

export interface TitleBarProjectTab {
    id: string
    title: string
    isDirty: boolean
}

const UNSUPPORTED_UPDATE_STATE: AutoUpdateState = {
    phase: 'unsupported',
    currentVersion: '',
    availableVersion: null,
    downloadedVersion: null,
    progressPercent: null,
    message: null,
    checkedAt: null,
}

const LEFT_PANE_COLLAPSED_WIDTH = 56
const LEFT_PANE_EXPANDED_WIDTH = 272
const VERTICAL_TOOLBOX_WIDTH = 56
const TITLEBAR_HORIZONTAL_PADDING = 16
const TAB_AREA_HORIZONTAL_PADDING = 12
const FIRST_TAB_DIVIDER_OFFSET = 2
const TAB_MIN_WIDTH = 132
const TAB_MAX_WIDTH = 238
const TAB_TEXT_PADDING = 62
const TAB_GAP_WIDTH = 5
const PLUS_BUTTON_WIDTH = 36
const OVERFLOW_BUTTON_WIDTH = 30
const TAB_FALLBACK_FONT =
    '500 14px Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'

interface TabLayoutInput {
    projectTabs: TitleBarProjectTab[]
    activeProjectTabId?: string | null
    tabAreaWidth: number
    estimateTabWidth: (tab: TitleBarProjectTab) => number
}

interface TabLayoutResult {
    visibleTabs: TitleBarProjectTab[]
    hiddenTabs: TitleBarProjectTab[]
}

function getProjectTabLayout({
    projectTabs,
    activeProjectTabId,
    tabAreaWidth,
    estimateTabWidth,
}: TabLayoutInput): TabLayoutResult {
    if (projectTabs.length === 0) {
        return {
            visibleTabs: [],
            hiddenTabs: [],
        }
    }

    const availableWidth = Math.max(0, tabAreaWidth - PLUS_BUTTON_WIDTH)
    const tabWidths = projectTabs.map((tab) => estimateTabWidth(tab))
    const totalEstimated =
        tabWidths.reduce((sum, width) => sum + width, 0) + Math.max(0, tabWidths.length - 1) * TAB_GAP_WIDTH

    if (totalEstimated <= availableWidth) {
        return {
            visibleTabs: projectTabs,
            hiddenTabs: [],
        }
    }

    const effectiveWidth = Math.max(0, availableWidth - OVERFLOW_BUTTON_WIDTH)
    const nextVisible: TitleBarProjectTab[] = []
    let usedWidth = 0

    for (let index = 0; index < projectTabs.length; index += 1) {
        const width = tabWidths[index] ?? TAB_MIN_WIDTH
        const needed = width + (nextVisible.length > 0 ? TAB_GAP_WIDTH : 0)

        if (usedWidth + needed > effectiveWidth && nextVisible.length > 0) break
        if (usedWidth === 0 && needed > effectiveWidth && nextVisible.length === 0) {
            nextVisible.push(projectTabs[index])
            break
        }
        if (usedWidth + needed > effectiveWidth) break

        nextVisible.push(projectTabs[index])
        usedWidth += needed
    }

    const activeTab = projectTabs.find((tab) => tab.id === activeProjectTabId) ?? null
    if (activeTab && !nextVisible.some((tab) => tab.id === activeTab.id)) {
        if (nextVisible.length === 0) {
            nextVisible.push(activeTab)
        } else {
            nextVisible[nextVisible.length - 1] = activeTab
        }
    }

    const visibleIds = new Set(nextVisible.map((tab) => tab.id))
    return {
        visibleTabs: nextVisible,
        hiddenTabs: projectTabs.filter((tab) => !visibleIds.has(tab.id)),
    }
}

function measureTextWidth(text: string, targetRef: HTMLDivElement | null, canvasRef: CanvasRenderingContext2D | null): number {
    if (typeof document === 'undefined') {
        return text.length * 9
    }

    if (!canvasRef) return text.length * 9

    const target = targetRef
    const computedFont = target ? getComputedStyle(target).font : TAB_FALLBACK_FONT
    canvasRef.font = computedFont || TAB_FALLBACK_FONT
    return canvasRef.measureText(text).width
}

interface TitleBarProps {
    plan: SubscriptionPlan
    showSubscriptionControls?: boolean
    onUpgradeClick?: () => void
    isSignedIn: boolean
    signedInLabel?: string | null
    authBusy?: boolean
    onGoogleSignInClick?: () => void
    onSignOutClick?: () => void
    projectTabs?: TitleBarProjectTab[]
    activeProjectTabId?: string | null
    onSelectProjectTab?: (tabId: string) => void
    onCreateProjectTab?: () => void
    onCloseProjectTab?: (tabId: string) => void
    leftPaneCollapsed?: boolean
    autoUpdateState?: AutoUpdateState
    onDownloadUpdate?: () => void
    onInstallUpdate?: () => void
}

export default function TitleBar({
    plan,
    showSubscriptionControls = true,
    onUpgradeClick,
    isSignedIn,
    signedInLabel,
    authBusy = false,
    onGoogleSignInClick,
    onSignOutClick,
    projectTabs = [],
    activeProjectTabId = null,
    onSelectProjectTab,
    onCreateProjectTab,
    onCloseProjectTab,
    leftPaneCollapsed = false,
    autoUpdateState,
    onDownloadUpdate,
    onInstallUpdate,
}: TitleBarProps) {
    const { t } = useTranslation()
    const [showOverflowMenu, setShowOverflowMenu] = useState(false)
    const overflowMenuId = useId()
    const [tabAreaWidth, setTabAreaWidth] = useState(0)
    const overflowRef = useRef<HTMLDivElement | null>(null)
    const tabMeasureRef = useRef<HTMLDivElement | null>(null)
    const tabMeasureCanvasRef = useRef<CanvasRenderingContext2D | null>(null)
    const planLabel = plan === 'PRO' ? t('titleBar.planPro') : plan === 'PRO_LITE' ? t('titleBar.planProLite') : t('titleBar.planFree')
    const effectiveUpdateState = autoUpdateState ?? UNSUPPORTED_UPDATE_STATE
    const updateAction = useMemo(() => {
        if (effectiveUpdateState.phase === 'unsupported') return null
        if (
            effectiveUpdateState.phase !== 'available' &&
            effectiveUpdateState.phase !== 'downloading' &&
            effectiveUpdateState.phase !== 'downloaded'
        ) {
            return null
        }
        if (effectiveUpdateState.phase === 'available') {
            return {
                label: t('titleBar.updateDownload'),
                hint: t('titleBar.updateAvailable', {
                    version: effectiveUpdateState.availableVersion ?? '',
                }),
                onClick: onDownloadUpdate,
                disabled: false,
            }
        }
        if (effectiveUpdateState.phase === 'downloading') {
            const percent = Math.round(effectiveUpdateState.progressPercent ?? 0)
            return {
                label: t('titleBar.updateDownloading', { percent }),
                hint: t('titleBar.updateDownloadingHint'),
                onClick: undefined,
                disabled: true,
            }
        }
        if (effectiveUpdateState.phase === 'downloaded') {
            return {
                label: t('titleBar.updateInstall'),
                hint: t('titleBar.updateReady'),
                onClick: onInstallUpdate,
                disabled: false,
            }
        }
        if (effectiveUpdateState.phase === 'checking') {
            return {
                label: t('titleBar.updateChecking'),
                hint: t('titleBar.updateChecking'),
                onClick: undefined,
                disabled: true,
            }
        }
        return null
    }, [effectiveUpdateState, onDownloadUpdate, onInstallUpdate, t])
    const updateButtonClass = useMemo(() => {
        if (effectiveUpdateState.phase === 'available') {
            return '!px-3.5 border-[var(--ds-accent-amber-border)] bg-[var(--ds-accent-amber-bg)] text-[var(--ds-accent-amber-text)] hover:bg-[var(--ds-fill-warning-weak)] shadow-[0_0_0_1px_rgba(245,158,11,0.25)]'
        }
        if (effectiveUpdateState.phase === 'downloaded') {
            return '!px-3.5 border-[var(--ds-accent-emerald-border)] bg-[var(--ds-accent-emerald-bg)] text-[var(--ds-accent-emerald-text)] hover:bg-[var(--ds-fill-success-weak)] shadow-[0_0_0_1px_rgba(16,185,129,0.25)]'
        }
        if (effectiveUpdateState.phase === 'downloading') {
            return '!px-3 border-[var(--ds-border-brand-weak)] bg-[var(--ds-fill-info-weak)] text-[var(--ds-text-info-default)]'
        }
        return '!px-2.5'
    }, [effectiveUpdateState.phase])
    const leftAnchorWidth = useMemo(() => {
        const leftPaneWidth = leftPaneCollapsed ? LEFT_PANE_COLLAPSED_WIDTH : LEFT_PANE_EXPANDED_WIDTH
        const dividerTargetX = leftPaneWidth + VERTICAL_TOOLBOX_WIDTH
        return dividerTargetX - TITLEBAR_HORIZONTAL_PADDING - TAB_AREA_HORIZONTAL_PADDING - FIRST_TAB_DIVIDER_OFFSET
    }, [leftPaneCollapsed])

    const measureTabTextWidth = useCallback((text: string): number => {
        if (typeof document === 'undefined') {
            return text.length * 9
        }
        if (!tabMeasureCanvasRef.current) {
            const canvas = document.createElement('canvas')
            tabMeasureCanvasRef.current = canvas.getContext('2d')
        }

        const context = tabMeasureCanvasRef.current
        const contextWidth = measureTextWidth(text, tabMeasureRef.current, context)
        return contextWidth
    }, [])

    const estimateTabWidth = useCallback((tab: TitleBarProjectTab): number => {
        const title = String(tab.title ?? '').trim() || t('home.untitled', { defaultValue: 'Untitled' })
        const textWidth = measureTabTextWidth(title)
        const dirtyPadding = tab.isDirty ? 14 : 0
        const estimated = Math.round(TAB_TEXT_PADDING + textWidth + dirtyPadding)
        return Math.max(TAB_MIN_WIDTH, Math.min(TAB_MAX_WIDTH, estimated))
    }, [measureTabTextWidth, t])

    const { visibleTabs, hiddenTabs } = useMemo(() => {
        return getProjectTabLayout({
            projectTabs,
            activeProjectTabId,
            tabAreaWidth,
            estimateTabWidth,
        })
    }, [activeProjectTabId, estimateTabWidth, projectTabs, tabAreaWidth])

    useEffect(() => {
        const target = tabMeasureRef.current
        if (!target) return

        const updateWidth = () => {
            setTabAreaWidth(target.getBoundingClientRect().width)
        }

        updateWidth()
        const observer = new ResizeObserver(updateWidth)
        observer.observe(target)

        return () => observer.disconnect()
    }, [])

    useEffect(() => {
        if (!showOverflowMenu) return

        const onPointerDown = (event: MouseEvent) => {
            const target = event.target as Node | null
            if (!target) return
            if (overflowRef.current?.contains(target)) return
            setShowOverflowMenu(false)
        }

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setShowOverflowMenu(false)
        }

        document.addEventListener('mousedown', onPointerDown)
        document.addEventListener('keydown', onKeyDown)
        return () => {
            document.removeEventListener('mousedown', onPointerDown)
            document.removeEventListener('keydown', onKeyDown)
        }
    }, [showOverflowMenu])

    useEffect(() => {
        if (hiddenTabs.length > 0) return
        setShowOverflowMenu(false)
    }, [hiddenTabs.length])

    return (
        <div
            className="ds-panel-header flex h-12 shrink-0 select-none items-center px-4"
            style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
            <div className="shrink-0 flex items-center gap-2" style={{ width: `${leftAnchorWidth}px` }}>
                {/* macOS 트래픽 라이트 공간 확보 */}
                <div className="w-16" />
            </div>
            <div
                ref={tabMeasureRef}
                data-testid="project-tab-strip"
                className="flex-1 min-w-0 flex items-center justify-start px-3"
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
                <div className="inline-flex min-w-0 max-w-full items-stretch gap-1">
                    <div className="flex flex-1 min-w-0 items-end gap-0.5 overflow-hidden">
                        {visibleTabs.map((tab, index) => {
                            const active = activeProjectTabId === tab.id
                            const computedWidth = estimateTabWidth(tab)
                            return (
                                <div key={tab.id} className="group relative flex items-end">
                                    <span
                                        aria-hidden="true"
                                        data-first-tab-divider={index === 0 ? 'true' : undefined}
                                        className="mx-0.5 mb-2 h-4 w-px bg-[var(--ds-border-neutral-subtle)]"
                                    />
                                    <button
                                        type="button"
                                        data-testid="project-tab-button"
                                        onClick={() => onSelectProjectTab?.(tab.id)}
                                        style={{ width: `${computedWidth}px` }}
                                        className={`inline-flex h-9 shrink-0 items-center justify-start gap-1.5 overflow-hidden border-b-2 px-3 pr-7 text-left text-sm font-normal transition-colors ${
                                            active
                                                ? 'border-[var(--ds-border-brand)] bg-[var(--ds-surface-panel)] text-[var(--ds-text-neutral-primary)]'
                                                : 'border-transparent text-[var(--ds-text-neutral-muted)] hover:text-[var(--ds-text-neutral-secondary)]'
                                        }`}
                                        title={tab.title}
                                    >
                                        <span className="min-w-0 flex-1 truncate">{tab.title}</span>
                                        {tab.isDirty ? (
                                            <span className="text-[var(--ds-accent-amber-text)]">*</span>
                                        ) : null}
                                    </button>
                                    <button
                                        type="button"
                                        data-testid="project-tab-close-button"
                                        aria-label={t('titleBar.closeTab', { defaultValue: 'Close tab' })}
                                        onClick={(event) => {
                                            event.stopPropagation()
                                            onCloseProjectTab?.(tab.id)
                                        }}
                                        className="absolute right-1 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-xs text-[var(--ds-text-neutral-muted)] opacity-80 transition-colors transition-opacity hover:bg-[var(--ds-fill-neutral-control)] hover:text-[var(--ds-text-neutral-secondary)] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--ds-brand-500)_30%,transparent)] group-hover:opacity-100"
                                        title={t('titleBar.closeTab', { defaultValue: 'Close tab' })}
                                    >
                                        ×
                                    </button>
                                </div>
                            )
                        })}
                    </div>
                    {hiddenTabs.length > 0 ? (
                        <div className="relative shrink-0" ref={overflowRef}>
                            <button
                                type="button"
                                data-testid="project-tab-overflow-button"
                                onClick={() => setShowOverflowMenu((prev) => !prev)}
                                className="inline-flex h-9 items-center border-b-2 border-transparent px-2 text-sm font-semibold text-[var(--ds-text-neutral-muted)] transition-colors hover:text-[var(--ds-text-neutral-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--ds-brand-500)_30%,transparent)]"
                                aria-haspopup="menu"
                                aria-expanded={showOverflowMenu}
                                aria-controls={overflowMenuId}
                                aria-label={t('titleBar.moreTabs', { defaultValue: 'More tabs' })}
                                title={t('titleBar.moreTabs', { defaultValue: 'More tabs' })}
                            >
                                ...
                            </button>
                            {showOverflowMenu ? (
                                <div
                                    id={overflowMenuId}
                                    role="menu"
                                    aria-label={t('titleBar.moreTabs', { defaultValue: 'More tabs' })}
                                    data-testid="project-tab-overflow-menu"
                                    className="absolute left-0 top-full z-40 mt-1 w-56 rounded-md border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-card)] py-1 shadow-xl"
                                >
                                    {hiddenTabs.map((tab) => (
                                        <button
                                            key={tab.id}
                                            type="button"
                                            data-testid="project-tab-overflow-item"
                                            role="menuitem"
                                            onClick={() => {
                                                onSelectProjectTab?.(tab.id)
                                                setShowOverflowMenu(false)
                                            }}
                                            className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-sm text-[var(--ds-text-neutral-secondary)] transition-colors hover:bg-[var(--ds-fill-neutral-control)]"
                                            title={tab.title}
                                        >
                                            <span className="truncate">{tab.title}</span>
                                            {tab.isDirty ? (
                                                <span className="text-[var(--ds-accent-amber-text)]">*</span>
                                            ) : null}
                                        </button>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                    <button
                        type="button"
                        data-testid="project-tab-add-button"
                        onClick={onCreateProjectTab}
                        className="inline-flex h-9 shrink-0 items-center border-b-2 border-transparent px-2.5 text-lg font-medium text-[var(--ds-text-neutral-muted)] transition-colors hover:text-[var(--ds-text-neutral-secondary)]"
                        title={t('home.newProject')}
                    >
                        +
                    </button>
                </div>
            </div>
            <div className="ml-2 shrink-0 flex items-center justify-end">
                {updateAction ? (
                    <DsButton
                        onClick={updateAction.onClick}
                        disabled={updateAction.disabled}
                        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                        size="sm"
                        className={`mr-2 ${updateButtonClass}`}
                        title={updateAction.hint}
                    >
                        {updateAction.label}
                    </DsButton>
                ) : null}
                {showSubscriptionControls ? (
                    <>
                        {isSignedIn ? (
                            <>
                                <span
                                    className="ds-badge ds-badge--emerald mr-2"
                                    style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                                    title={t('titleBar.signedInHint')}
                                >
                                    {signedInLabel || t('titleBar.signedIn')}
                                </span>
                                <DsButton
                                    onClick={onSignOutClick}
                                    disabled={authBusy}
                                    style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                                    size="sm"
                                    className="mr-2 !px-2.5"
                                    title={t('titleBar.signOutHint')}
                                >
                                    {authBusy ? t('titleBar.signOutBusy') : t('titleBar.signOut')}
                                </DsButton>
                            </>
                        ) : (
                            <DsButton
                                onClick={onGoogleSignInClick}
                                disabled={authBusy}
                                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                                size="sm"
                                className="mr-2 !px-2.5"
                                title={t('titleBar.signInGoogleHint')}
                            >
                                {authBusy ? t('titleBar.signInGoogleBusy') : t('titleBar.signInGoogle')}
                            </DsButton>
                        )}
                        <span
                            className={`ds-badge mr-2 ${plan === 'FREE' ? 'ds-badge--amber' : 'ds-badge--sky'}`}
                            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                        >
                            {planLabel}
                        </span>
                        {plan === 'FREE' ? (
                            <DsButton
                                onClick={onUpgradeClick}
                                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                                size="sm"
                                className="mr-2 !px-2.5"
                                title={t('titleBar.upgradeHint')}
                            >
                                {t('titleBar.upgrade')}
                            </DsButton>
                        ) : null}
                    </>
                ) : null}
            </div>
        </div>
    )
}
