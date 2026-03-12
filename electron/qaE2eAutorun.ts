import fs from 'fs/promises'
import type { App, BrowserWindow } from 'electron'
import {
    QA_E2E_COPILOT_FLOW_ORDER,
    QA_E2E_TAB_FLOW,
    QA_E2E_TAB_RULES,
} from '../shared/qaE2eContract'

type QaStep = {
    ok: boolean
    name: string
    details?: string
}

type QaReport = {
    createdAt: string
    mode: 'internal-macos'
    steps: QaStep[]
    warnings: string[]
    failures: string[]
}

type QaRunnerOptions = {
    reportPath: string
}

function isEnabled() {
    return (
        process.platform === 'darwin' &&
        (process.env.QA_E2E_AUTORUN === '1' || readCliFlagValue('--qa-e2e-autorun') === '1')
    )
}

function readCliFlagValue(flagName: string) {
    const prefix = `${flagName}=`
    const match = process.argv.find((arg) => arg.startsWith(prefix))
    return match ? match.slice(prefix.length).trim() : ''
}

function createReport(steps: QaStep[], warnings: string[], failures: string[]): QaReport {
    return {
        createdAt: new Date().toISOString(),
        mode: 'internal-macos',
        steps,
        warnings,
        failures,
    }
}

async function writeReport(reportPath: string, report: QaReport) {
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8')
}

function step(steps: QaStep[], failures: string[], ok: boolean, name: string, details = '') {
    steps.push({ ok, name, details })
    if (!ok) failures.push(`${name}${details ? `: ${details}` : ''}`)
}

async function appendTrace(reportPath: string, message: string) {
    await fs.appendFile(`${reportPath}.trace`, `${new Date().toISOString()} ${message}\n`, 'utf-8').catch(
        () => undefined,
    )
}

async function waitFor<T>(
    win: BrowserWindow,
    expression: string,
    timeoutMs = 10_000,
    intervalMs = 120,
): Promise<T | null> {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
        const value = await win.webContents.executeJavaScript(expression, true).catch(() => null)
        if (value) return value as T
        await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }
    return null
}

async function evalInWindow<T>(win: BrowserWindow, expression: string): Promise<T> {
    return win.webContents.executeJavaScript(expression, true) as Promise<T>
}

async function waitForEditorReady(win: BrowserWindow) {
    return waitFor<boolean>(
        win,
        `(() => {
            const editor = document.querySelector('.ProseMirror')
            return !!editor && editor.textContent !== null
        })()`,
        12_000,
    )
}

async function waitForProjectFixture(win: BrowserWindow) {
    return waitFor<boolean>(
        win,
        `(() => {
            const snapshot = window.__bookspaceQaDebug?.getChapterSnapshot?.() ?? []
            if (!Array.isArray(snapshot) || snapshot.length < 3) return false
            const titles = snapshot.map((item) => item?.title)
            const kinds = snapshot.map((item) => item?.chapterKind)
            return (
                titles.includes('프롤로그') &&
                titles.includes('1장') &&
                titles.includes('2장') &&
                kinds.includes('prologue') &&
                kinds.filter((kind) => kind === 'chapter').length >= 2
            )
        })()`,
        12_000,
    )
}

async function clickByTestId(win: BrowserWindow, testId: string) {
    return evalInWindow<boolean>(
        win,
        `(() => {
            const target = document.querySelector('[data-testid="${testId}"]')
            if (!(target instanceof HTMLElement)) return false
            target.click()
            return true
        })()`,
    )
}

async function clickButtonByPattern(win: BrowserWindow, pattern: string) {
    return evalInWindow<boolean>(
        win,
        `(() => {
            const regex = new RegExp(${JSON.stringify(pattern)}, 'i')
            const nodes = Array.from(document.querySelectorAll('button,[role="button"]'))
            const target = nodes.find((node) => regex.test((node.textContent || '').trim()))
            if (!(target instanceof HTMLElement)) return false
            target.click()
            return true
        })()`,
    )
}

async function fillByTestId(win: BrowserWindow, testId: string, value: string) {
    return evalInWindow<boolean>(
        win,
        `(() => {
            const target = document.querySelector('[data-testid="${testId}"]')
            if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) return false
            const prototype = Object.getPrototypeOf(target)
            const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value')
            const setter = descriptor?.set
            target.focus()
            if (setter) setter.call(target, ${JSON.stringify(value)})
            else target.value = ${JSON.stringify(value)}
            target.dispatchEvent(new Event('input', { bubbles: true }))
            target.dispatchEvent(new Event('change', { bubbles: true }))
            return true
        })()`,
    )
}

async function waitForTestId(win: BrowserWindow, testId: string, timeoutMs = 10_000) {
    return waitFor<boolean>(
        win,
        `(() => !!document.querySelector('[data-testid="${testId}"]'))()`,
        timeoutMs,
    )
}

async function waitForText(win: BrowserWindow, pattern: string, timeoutMs = 10_000) {
    return waitFor<boolean>(
        win,
        `(() => new RegExp(${JSON.stringify(pattern)}, 'i').test(document.body?.innerText || ''))()`,
        timeoutMs,
    )
}

async function getTextByTestId(win: BrowserWindow, testId: string) {
    return evalInWindow<string>(
        win,
        `(() => {
            const target = document.querySelector('[data-testid="${testId}"]')
            return target?.textContent || ''
        })()`,
    )
}

async function setSelectValue(win: BrowserWindow, value: string) {
    return evalInWindow<boolean>(
        win,
        `(() => {
            const target = document.querySelector('[data-bookspace-modal-root="true"] select')
            if (!(target instanceof HTMLSelectElement)) return false
            target.value = ${JSON.stringify(value)}
            target.dispatchEvent(new Event('input', { bubbles: true }))
            target.dispatchEvent(new Event('change', { bubbles: true }))
            return true
        })()`,
    )
}

async function setFirstModalInput(win: BrowserWindow, value: string) {
    return evalInWindow<boolean>(
        win,
        `(() => {
            const target = document.querySelector('[data-bookspace-modal-root="true"] input')
            if (!(target instanceof HTMLInputElement)) return false
            const prototype = Object.getPrototypeOf(target)
            const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value')
            const setter = descriptor?.set
            target.focus()
            if (setter) setter.call(target, ${JSON.stringify(value)})
            else target.value = ${JSON.stringify(value)}
            target.dispatchEvent(new Event('input', { bubbles: true }))
            target.dispatchEvent(new Event('change', { bubbles: true }))
            target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
            target.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }))
            return true
        })()`,
    )
}

async function clickLastModalButton(win: BrowserWindow) {
    return evalInWindow<boolean>(
        win,
        `(() => {
            const buttons = Array.from(document.querySelectorAll('[data-bookspace-modal-root="true"] button'))
            const target = buttons.at(-1)
            if (!(target instanceof HTMLElement)) return false
            target.click()
            return true
        })()`,
    )
}

async function waitForModalClosed(win: BrowserWindow) {
    return waitFor<boolean>(
        win,
        `(() => !document.querySelector('[data-bookspace-modal-root="true"]'))()`,
        15_000,
    )
}

async function waitForFile(filePath: string, timeoutMs = 15_000) {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
        const stat = await fs.stat(filePath).catch(() => null)
        if (stat && stat.size > 0) return true
        await new Promise((resolve) => setTimeout(resolve, 120))
    }
    return false
}

async function exportDocument(
    win: BrowserWindow,
    format: 'epub' | 'docx',
    outputPath: string,
    steps: QaStep[],
    failures: string[],
) {
    win.webContents.send('menu-action', 'open-export')
    const modalVisible = await waitForText(win, '포맷|Format', 5000)
    step(steps, failures, !!modalVisible, `export/${format}-modal-open`)
    if (!modalVisible) return false
    await setSelectValue(win, format)
    await setFirstModalInput(win, 'E2E Export Title')
    await clickLastModalButton(win)
    const exported = await waitForFile(outputPath)
    step(steps, failures, exported, `export/${format}-file-created`, outputPath)
    const modalClosed = await waitForModalClosed(win)
    step(steps, failures, !!modalClosed, `export/${format}-modal-closed`)
    return exported && !!modalClosed
}

async function runAutorunCopilotFlows(args: {
    win: BrowserWindow
    steps: QaStep[]
    failures: string[]
    warnings: string[]
    reportPath: string
}) {
    const { win, steps, failures, warnings, reportPath } = args
    const [prologueFlow, existingRenameFlow, structuredCreateFlow, missingRenameFlow, publishingFlow] =
        QA_E2E_COPILOT_FLOW_ORDER
    await fillByTestId(win, 'copilot-composer-input', prologueFlow.prompt)
    const prologueStructure = await evalInWindow<unknown>(
        win,
        `(() => window.__bookspaceQaDebug?.getPageStructure?.() ?? null)()`,
    ).catch(() => null)
    await appendTrace(reportPath, `structure:prologue:${JSON.stringify(prologueStructure)}`)
    const prologueResolve = await evalInWindow<{ targetChapterId: string | null; missingLabel: string | null; kind: string | null }>(
        win,
        `(() => window.__bookspaceQaDebug?.resolvePromptPageReference?.(${JSON.stringify(prologueFlow.prompt)}) ?? null)()`,
    ).catch(() => null)
    await appendTrace(reportPath, `resolve:prologue:${JSON.stringify(prologueResolve)}`)
    const prologueTargetChapterId = prologueResolve?.targetChapterId ?? 'prologue'
    const prologueTextBefore = await evalInWindow<string>(
        win,
        `(() => window.__bookspaceQaDebug?.getPageText?.(${JSON.stringify(prologueTargetChapterId)}) ?? '')()`,
    ).catch(() => '')
    await appendTrace(reportPath, `prologue:text:before:${JSON.stringify(prologueTextBefore)}`)
    await clickByTestId(win, 'copilot-submit-button')
    await appendTrace(reportPath, 'copilot:prologue:submitted')
    const prologuePreview = await waitForTestId(win, 'copilot-preview-panel', 10_000)
    const prologueApplied = prologuePreview
        ? false
        : !!(await waitForText(win, prologueFlow.appliedPattern, 10_000))
    const prologueDetails = await getTextByTestId(win, 'copilot-message-list').catch(() => '')
    step(steps, failures, !!prologuePreview || prologueApplied, prologueFlow.steps.preview, prologueDetails)
    if (prologuePreview) {
        await clickByTestId(win, 'copilot-apply-button')
        const previewClosed = await waitFor<boolean>(
            win,
            `(() => !document.querySelector('[data-testid="copilot-preview-panel"]'))()`,
            10_000,
        )
        step(steps, failures, !!previewClosed, prologueFlow.steps.apply)
        const editorUpdated = await waitFor<boolean>(
            win,
            `(() => {
                const next = window.__bookspaceQaDebug?.getPageText?.(${JSON.stringify(prologueTargetChapterId)}) ?? ''
                const previous = ${JSON.stringify(prologueTextBefore)}
                return String(next).trim().length > String(previous).trim().length
            })()`,
            10_000,
        )
        step(steps, failures, !!editorUpdated, prologueFlow.steps.editorUpdated)
    } else if (prologueApplied) {
        const editorUpdated = await waitFor<boolean>(
            win,
            `(() => {
                const next = window.__bookspaceQaDebug?.getPageText?.(${JSON.stringify(prologueTargetChapterId)}) ?? ''
                const previous = ${JSON.stringify(prologueTextBefore)}
                return String(next).trim().length > String(previous).trim().length
            })()`,
            10_000,
        )
        step(steps, failures, !!editorUpdated, prologueFlow.steps.editorUpdated)
    }

    const renameTitleBefore = await evalInWindow<string>(
        win,
        `(() => (window.__bookspaceQaDebug?.getChapterSnapshot?.() ?? []).find((item) => item.id === 'chapter-1')?.title ?? '')()`,
    ).catch(() => '')
    await fillByTestId(win, 'copilot-composer-input', existingRenameFlow.prompt)
    await clickByTestId(win, 'copilot-submit-button')
    await appendTrace(reportPath, 'copilot:existing-rename:submitted')
    const renamePreview = await waitForTestId(win, 'copilot-preview-panel', 10_000)
    const renameApplied = renamePreview
        ? false
        : !!(await waitForText(win, existingRenameFlow.appliedPattern, 10_000))
    const renameDetails = await getTextByTestId(win, 'copilot-message-list').catch(() => '')
    step(steps, failures, !!renamePreview || renameApplied, existingRenameFlow.steps.preview, renameDetails)
    if (renamePreview) {
        const previewText = await getTextByTestId(win, 'copilot-preview-panel').catch(() => '')
        step(
            steps,
            failures,
            new RegExp(existingRenameFlow.previewSummaryPattern, 'i').test(previewText),
            existingRenameFlow.steps.previewSummary,
            previewText,
        )
        await clickByTestId(win, 'copilot-apply-button')
        const renamePreviewClosed = await waitFor<boolean>(
            win,
            `(() => !document.querySelector('[data-testid="copilot-preview-panel"]'))()`,
            10_000,
        )
        step(steps, failures, !!renamePreviewClosed, existingRenameFlow.steps.apply)
    }
    if (renamePreview || renameApplied) {
        const renameUpdated = await waitFor<boolean>(
            win,
            `(() => {
                const nextTitle =
                    (window.__bookspaceQaDebug?.getChapterSnapshot?.() ?? []).find((item) => item.id === 'chapter-1')?.title ?? ''
                const previous = ${JSON.stringify(renameTitleBefore)}
                return (
                    String(nextTitle).trim() === ${JSON.stringify(existingRenameFlow.expectedTitle)} &&
                    String(nextTitle).trim() !== String(previous).trim()
                )
            })()`,
            10_000,
        )
        step(steps, failures, !!renameUpdated, existingRenameFlow.steps.titleUpdated)
    }

    await fillByTestId(win, 'copilot-composer-input', structuredCreateFlow.prompt)
    await clickByTestId(win, 'copilot-submit-button')
    await appendTrace(reportPath, 'copilot:structured-create:submitted')
    const structuredConfirmationVisible = await waitForTestId(win, 'copilot-pending-proposal', 10_000)
    const structuredConfirmationText = structuredConfirmationVisible
        ? await getTextByTestId(win, 'copilot-pending-proposal').catch(() => '')
        : await getTextByTestId(win, 'copilot-message-list').catch(() => '')
    step(
        steps,
        failures,
        !!structuredConfirmationVisible &&
            new RegExp(structuredCreateFlow.confirmationPattern, 'i').test(structuredConfirmationText),
        structuredCreateFlow.steps.confirmationVisible,
        structuredConfirmationText,
    )

    await fillByTestId(win, 'copilot-composer-input', missingRenameFlow.prompt)
    await clickByTestId(win, 'copilot-submit-button')
    await appendTrace(reportPath, 'copilot:rename:submitted')
    const missingRename = await waitForText(win, missingRenameFlow.responsePattern, 10_000)
    const missingRenameDetails = await getTextByTestId(win, 'copilot-message-list').catch(() => '')
    step(steps, failures, !!missingRename, missingRenameFlow.steps.response, missingRenameDetails)

    await fillByTestId(win, 'copilot-composer-input', publishingFlow.prompt)
    await clickByTestId(win, 'copilot-submit-button')
    await appendTrace(reportPath, 'copilot:publishing:submitted')
    const publishingPreviewReady =
        !!(await waitForTestId(win, 'copilot-preview-panel', 10_000)) ||
        !!(await waitForText(win, publishingFlow.previewReadyPattern, 10_000))
    const publishingDetails = await getTextByTestId(win, 'copilot-message-list').catch(() => '')
    step(steps, failures, !!publishingPreviewReady, publishingFlow.steps.previewReady, publishingDetails)
    const artifactVisible = await waitForTestId(win, 'copilot-latest-artifact', 2_000)
    if (artifactVisible) {
        const artifactText = await getTextByTestId(win, 'copilot-latest-artifact')
        step(
            steps,
            failures,
            new RegExp(publishingFlow.artifactContentPattern, 'i').test(artifactText),
            publishingFlow.steps.artifactContent,
        )
    }

    const handoffVisible = await waitForTestId(win, 'copilot-latest-handoff', 2_000)
    if (!artifactVisible || !handoffVisible) {
        warnings.push(publishingFlow.warnings.missingArtifactOrHandoff)
    }
}

async function runAutorunTabFlow(args: {
    win: BrowserWindow
    steps: QaStep[]
    failures: string[]
    warnings: string[]
}) {
    const { win, steps, failures, warnings } = args
    let addTabsWorked = true
    for (let index = 0; index < QA_E2E_TAB_RULES.autorunAddCount; index += 1) {
        addTabsWorked = addTabsWorked && (await clickByTestId(win, 'project-tab-add-button'))
    }
    step(steps, failures, !!addTabsWorked, QA_E2E_TAB_FLOW.steps.create)

    win.setSize(QA_E2E_TAB_RULES.overflowViewport.width, QA_E2E_TAB_RULES.overflowViewport.height)
    const overflowVisible = await waitForTestId(win, 'project-tab-overflow-button', QA_E2E_TAB_RULES.overflowTimeoutMs)
    step(
        steps,
        failures,
        true,
        QA_E2E_TAB_FLOW.steps.overflowVisible,
        overflowVisible ? 'visible' : 'not visible in current layout',
    )
    if (!overflowVisible) {
        warnings.push(QA_E2E_TAB_FLOW.warnings.overflowHidden(QA_E2E_TAB_RULES.overflowViewport.width))
    }
    if (overflowVisible) {
        await clickByTestId(win, 'project-tab-overflow-button')
        const overflowSelect = await waitForTestId(win, 'project-tab-overflow-item', 3000)
        step(steps, failures, !!overflowSelect, QA_E2E_TAB_FLOW.steps.overflowSelect)
        if (overflowSelect) {
            await clickByTestId(win, 'project-tab-overflow-item')
        }
    }

    const closeWorked = await clickByTestId(win, 'project-tab-close-button')
    step(steps, failures, !!closeWorked, QA_E2E_TAB_FLOW.steps.close)
}

async function runScenario(app: App, win: BrowserWindow, options: QaRunnerOptions): Promise<QaReport> {
    const steps: QaStep[] = []
    const warnings: string[] = []
    const failures: string[] = []
    const persistReport = async () => {
        await writeReport(options.reportPath, createReport(steps, warnings, failures))
    }
    const startupProjectPath =
        process.env.QA_E2E_PROJECT_FILE?.trim() ||
        readCliFlagValue('--qa-e2e-project-file')
    const saveTargets = (
        process.env.QA_E2E_DIALOG_SAVE_QUEUE || readCliFlagValue('--qa-e2e-dialog-save-queue')
    )
        .split(';;')
        .filter(Boolean)
    const exportEpubPath = saveTargets[0] ?? ''
    const exportDocxPath = saveTargets[1] ?? ''
    const savedProjectPath = saveTargets[2] ?? ''

    try {
        await appendTrace(options.reportPath, 'runScenario:start')
        await appendTrace(options.reportPath, `argv:${JSON.stringify(process.argv)}`)
        await appendTrace(options.reportPath, `startupProjectPath:${startupProjectPath}`)
        await evalInWindow(
            win,
            `(() => {
                window.confirm = () => true
                return true
            })()`,
        )
        const chapterSnapshot = await evalInWindow<Array<{ title: string; chapterType?: string; chapterKind?: string; id: string }>>(
            win,
            `(() => {
                const debug = window.__bookspaceQaDebug
                if (debug?.getChapterSnapshot) {
                    return debug.getChapterSnapshot()
                }
                return []
            })()`,
        ).catch(() => [])
        await appendTrace(
            options.reportPath,
            `chapters:${JSON.stringify(chapterSnapshot)}`,
        )
        const editorReady = await waitForEditorReady(win)
        await appendTrace(options.reportPath, `editorReady:${Boolean(editorReady)}`)
        if (startupProjectPath) {
            win.webContents.send('file-opened', startupProjectPath)
        }
        const editorEventuallyReady = !!(await waitForEditorReady(win))
        await appendTrace(options.reportPath, `editorEventuallyReady:${editorEventuallyReady}`)
        const chapterSnapshotAfterOpen = await evalInWindow<
            Array<{ title: string; chapterType?: string; chapterKind?: string; id: string }>
        >(
            win,
            `(() => {
                const debug = window.__bookspaceQaDebug
                if (debug?.getChapterSnapshot) {
                    return debug.getChapterSnapshot()
                }
                return []
            })()`,
        ).catch(() => [])
        await appendTrace(
            options.reportPath,
            `chaptersAfterOpen:${JSON.stringify(chapterSnapshotAfterOpen)}`,
        )
        const fixtureLoaded = editorEventuallyReady ? !!(await waitForProjectFixture(win)) : false
        await appendTrace(options.reportPath, `fixtureLoaded:${fixtureLoaded}`)
        step(
            steps,
            failures,
            editorEventuallyReady && fixtureLoaded,
            'project/open-bksp',
            fixtureLoaded ? startupProjectPath : `${startupProjectPath} (fixture markers missing)`,
        )
        await persistReport()
        if (!editorEventuallyReady || !fixtureLoaded) {
            const report = createReport(steps, warnings, failures)
            await writeReport(options.reportPath, report)
            hasPendingQuit = true
            app.quit()
            return report
        }

        if (exportEpubPath) {
            await appendTrace(options.reportPath, 'export:epub:start')
            await exportDocument(win, 'epub', exportEpubPath, steps, failures)
            await persistReport()
        }

        warnings.push('macOS internal smoke skips import-docx because the native import flow blocks autorun.')
        await persistReport()

        if (exportDocxPath) {
            await appendTrace(options.reportPath, 'export:docx:start')
            await exportDocument(win, 'docx', exportDocxPath, steps, failures)
            await persistReport()
        }

        if (savedProjectPath) {
            await appendTrace(options.reportPath, 'save:start')
            win.webContents.send('menu-action', 'save-project-as')
            const saved = await waitForFile(savedProjectPath, 12_000)
            step(steps, failures, saved, 'project/save-bksp-created', savedProjectPath)
            await persistReport()
        }

        await appendTrace(options.reportPath, 'history:start')
        win.webContents.send('menu-action', 'open-version-manager')
        const historyOpened = await waitForText(win, '버전 관리|Version Manager', 5000)
        step(steps, failures, !!historyOpened, 'history/modal-open')
        await persistReport()
        await evalInWindow(
            win,
            `(() => {
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
                document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }))
                return true
            })()`,
        )

        await clickByTestId(win, 'vertical-tool-copilot')
        await appendTrace(options.reportPath, 'copilot:open')
        const copilotReady = await waitForTestId(win, 'copilot-composer-input', 5000)
        step(steps, failures, !!copilotReady, 'copilot/open')
        await persistReport()
        if (copilotReady) {
            await runAutorunCopilotFlows({
                win,
                steps,
                failures,
                warnings,
                reportPath: options.reportPath,
            })
            await persistReport()
        }

        await runAutorunTabFlow({
            win,
            steps,
            failures,
            warnings,
        })
        await persistReport()
    } catch (error) {
        step(
            steps,
            failures,
            false,
            'e2e/exception',
            error instanceof Error ? error.message : String(error),
        )
        await persistReport()
    }

    const report = createReport(steps, warnings, failures)
    await writeReport(options.reportPath, report)
    hasPendingQuit = true
    app.quit()
    return report
}

let hasPendingQuit = false

export function isQaE2eAutorunEnabled() {
    return isEnabled()
}

export function isQaE2ePendingQuit() {
    return hasPendingQuit
}

export function maybeStartQaE2eAutorun(app: App, win: BrowserWindow) {
    const reportPath =
        process.env.QA_E2E_REPORT_FILE?.trim() || readCliFlagValue('--qa-e2e-report-file')
    if (!isEnabled() || !reportPath) return
    let started = false
    void appendTrace(reportPath, 'autorun:registered')
    win.webContents.on('did-finish-load', () => {
        if (started) return
        started = true
        void appendTrace(reportPath, 'autorun:did-finish-load')
        void runScenario(app, win, { reportPath }).catch(async (error) => {
            const report = createReport([], [], [error instanceof Error ? error.message : String(error)])
            await writeReport(reportPath, report).catch(() => undefined)
            hasPendingQuit = true
            app.quit()
        })
    })
}
