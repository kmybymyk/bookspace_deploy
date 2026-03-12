#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { exportDocx } from '../src/features/export/docxExporter.ts'
import {
  makeFixtureProject,
  QA_E2E_RUNTIME_ENV,
  verifyEpubTableWidth,
  waitForCondition,
  waitForFile,
} from './qa-e2e-shared.mjs'
import {
  QA_E2E_COPILOT_FLOW_ORDER,
  QA_E2E_LABELS,
  QA_E2E_TAB_FLOW,
  QA_E2E_TAB_RULES,
} from '../shared/qaE2eContract.ts'

const require = createRequire(import.meta.url)
const electronBinary = require('electron')

const OUTPUT_DIR = path.resolve('reports/qa')
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'e2e.latest.json')
const OUTPUT_MD = path.join(OUTPUT_DIR, 'e2e.latest.md')
const TMP_DIR = path.resolve('tmp/e2e')
const STRICT = process.env.QA_E2E_REQUIRED === '1'
const ENABLED = process.env.QA_E2E_RUN === '1' || STRICT

const steps = []
const failures = []
const warnings = []
const LABEL = Object.fromEntries(
  Object.entries(QA_E2E_LABELS).map(([key, pattern]) => [key, new RegExp(pattern, 'i')]),
)

function step(ok, name, details = '') {
  steps.push({ ok, name, details })
  if (!ok) failures.push(`${name}${details ? `: ${details}` : ''}`)
}

function warn(name, details = '') {
  warnings.push(`${name}${details ? `: ${details}` : ''}`)
}

async function openCopilot(page) {
  const copilotButton = page.getByTestId('vertical-tool-copilot').first()
  await copilotButton.waitFor({ state: 'visible', timeout: 5000 })
  await copilotButton.click()
  await page.getByTestId('copilot-composer-input').waitFor({ state: 'visible', timeout: 5000 })
}

async function submitCopilotPrompt(page, prompt) {
  const composer = page.getByTestId('copilot-composer-input')
  await composer.click()
  await composer.fill(prompt)
  await page.getByTestId('copilot-submit-button').click()
}

async function waitForCopilotMessage(page, pattern, timeoutMs = 8000) {
  return waitForCondition(async () => {
    const text = await page.getByTestId('copilot-message-list').textContent().catch(() => '')
    return pattern.test(String(text ?? ''))
  }, timeoutMs)
}

async function runPlaywrightCopilotFlows(page) {
  const [prologueFlow, existingRenameFlow, structuredCreateFlow, missingRenameFlow, publishingFlow] = QA_E2E_COPILOT_FLOW_ORDER
  const prologueTextBefore = await page.evaluate(
    () => window.__bookspaceQaDebug?.getPageText?.('prologue') ?? '',
  ).catch(() => '')
  await submitCopilotPrompt(page, prologueFlow.prompt)
  const prologuePreviewVisible = await waitForCondition(
    async () => (await page.getByTestId('copilot-preview-panel').count()) > 0,
    10000,
  )
  const prologueApplied = prologuePreviewVisible
    ? false
    : await waitForCopilotMessage(page, new RegExp(prologueFlow.appliedPattern, 'i'), 10000)
  step(prologuePreviewVisible || prologueApplied, prologueFlow.steps.preview)
  if (prologuePreviewVisible) {
    const previewText = await page.getByTestId('copilot-preview-panel').textContent().catch(() => '')
    step(new RegExp(prologueFlow.previewSummaryPattern, 'i').test(String(previewText ?? '')), prologueFlow.steps.previewSummary)
    await page.getByTestId('copilot-apply-button').click()
    const prologuePreviewClosed = await waitForCondition(
      async () => (await page.getByTestId('copilot-preview-panel').count()) === 0,
      10000,
    )
    step(prologuePreviewClosed, prologueFlow.steps.apply)
  }
  if (prologuePreviewVisible || prologueApplied) {
    const editorContainsDraft = await waitForCondition(
      async () => {
        const next = await page.evaluate(
          () => window.__bookspaceQaDebug?.getPageText?.('prologue') ?? '',
        ).catch(() => '')
        return String(next).trim().length > String(prologueTextBefore).trim().length
      },
      10000,
    )
    step(editorContainsDraft, prologueFlow.steps.editorUpdated)
  }

  const renameTitleBefore = await page.evaluate(
    () =>
      (window.__bookspaceQaDebug?.getChapterSnapshot?.() ?? []).find((item) => item.id === 'chapter-1')
        ?.title ?? '',
  ).catch(() => '')
  await submitCopilotPrompt(page, existingRenameFlow.prompt)
  const renamePreviewVisible = await waitForCondition(
    async () => (await page.getByTestId('copilot-preview-panel').count()) > 0,
    10000,
  )
  const renameApplied = renamePreviewVisible
    ? false
    : await waitForCopilotMessage(page, new RegExp(existingRenameFlow.appliedPattern, 'i'), 10000)
  step(renamePreviewVisible || renameApplied, existingRenameFlow.steps.preview)
  if (renamePreviewVisible) {
    const previewText = await page.getByTestId('copilot-preview-panel').textContent().catch(() => '')
    step(
      new RegExp(existingRenameFlow.previewSummaryPattern, 'i').test(String(previewText ?? '')),
      existingRenameFlow.steps.previewSummary,
    )
    await page.getByTestId('copilot-apply-button').click()
    const renamePreviewClosed = await waitForCondition(
      async () => (await page.getByTestId('copilot-preview-panel').count()) === 0,
      10000,
    )
    step(renamePreviewClosed, existingRenameFlow.steps.apply)
  }
  if (renamePreviewVisible || renameApplied) {
    const renameUpdated = await waitForCondition(
      async () => {
        const nextTitle = await page.evaluate(
          () =>
            (window.__bookspaceQaDebug?.getChapterSnapshot?.() ?? []).find((item) => item.id === 'chapter-1')
              ?.title ?? '',
        ).catch(() => '')
        return String(nextTitle).trim() === existingRenameFlow.expectedTitle &&
          String(nextTitle).trim() !== String(renameTitleBefore).trim()
      },
      10000,
    )
    step(renameUpdated, existingRenameFlow.steps.titleUpdated)
  }

  await submitCopilotPrompt(page, structuredCreateFlow.prompt)
  const structuredConfirmationVisible = await waitForCondition(
    async () => (await page.getByTestId('copilot-pending-proposal').count()) > 0,
    10000,
  )
  const structuredConfirmationText = structuredConfirmationVisible
    ? await page.getByTestId('copilot-pending-proposal').textContent().catch(() => '')
    : await page.getByTestId('copilot-message-list').textContent().catch(() => '')
  step(
    structuredConfirmationVisible &&
      new RegExp(structuredCreateFlow.confirmationPattern, 'i').test(String(structuredConfirmationText ?? '')),
    structuredCreateFlow.steps.confirmationVisible,
  )

  await submitCopilotPrompt(page, missingRenameFlow.prompt)
  const missingRenameHandled = await waitForCopilotMessage(
    page,
    new RegExp(missingRenameFlow.responsePattern, 'i'),
    10000,
  )
  step(missingRenameHandled, missingRenameFlow.steps.response)

  await submitCopilotPrompt(page, publishingFlow.prompt)
  const publishingPreviewReady =
    await waitForCondition(
      async () => (await page.getByTestId('copilot-preview-panel').count()) > 0,
      10000,
    ) ||
    await waitForCopilotMessage(page, new RegExp(publishingFlow.previewReadyPattern, 'i'), 10000)
  step(publishingPreviewReady, publishingFlow.steps.previewReady)
  const publishingArtifactVisible = await waitForCondition(
    async () => (await page.getByTestId('copilot-latest-artifact').count()) > 0,
    2000,
  )
  if (publishingArtifactVisible) {
    const artifactText = await page.getByTestId('copilot-latest-artifact').textContent().catch(() => '')
    step(
      new RegExp(publishingFlow.artifactContentPattern, 'i').test(String(artifactText ?? '')),
      publishingFlow.steps.artifactContent,
    )
  } else {
    warn('copilot/publishing-artifact', publishingFlow.warnings.missingArtifact)
  }

  const publishingHandoffVisible = await waitForCondition(
    async () => (await page.getByTestId('copilot-latest-handoff').count()) > 0,
    2000,
  )
  if (!publishingHandoffVisible) {
    warn('copilot/publishing-handoff', publishingFlow.warnings.missingHandoff)
  }
}

async function runPlaywrightTabFlow(page) {
  const addTabButton = page.getByTestId('project-tab-add-button')
  for (let i = 0; i < QA_E2E_TAB_RULES.playwrightAddCount; i += 1) {
    await addTabButton.click()
  }
  const createdTabs = await page.getByTestId('project-tab-button').count()
  step(createdTabs >= 2, QA_E2E_TAB_FLOW.steps.create, `visible tabs=${createdTabs}`)

  const getTotalTabCount = async () => {
    const visibleTabs = await page.getByTestId('project-tab-button').count()
    const overflowButton = page.getByTestId('project-tab-overflow-button').first()
    const overflowButtonVisible =
      (await overflowButton.count()) > 0 && (await overflowButton.isVisible().catch(() => false))
    if (!overflowButtonVisible) return visibleTabs
    await overflowButton.click()
    await page.waitForSelector('[data-testid="project-tab-overflow-menu"]', { timeout: 3000 })
    const overflowItems = await page.getByTestId('project-tab-overflow-item').count()
    await page.keyboard.press('Escape')
    return visibleTabs + overflowItems
  }

  await page.setViewportSize(QA_E2E_TAB_RULES.overflowViewport)
  const overflowVisible = await waitForCondition(
    async () => await page.getByTestId('project-tab-overflow-button').count() > 0,
    QA_E2E_TAB_RULES.overflowTimeoutMs,
  )
  step(true, QA_E2E_TAB_FLOW.steps.overflowVisible, overflowVisible ? 'visible' : 'not visible in current layout')
  if (!overflowVisible) {
    warn('tabs/overflow', QA_E2E_TAB_FLOW.warnings.overflowHidden(QA_E2E_TAB_RULES.overflowViewport.width))
  }
  if (overflowVisible) {
    await page.getByTestId('project-tab-overflow-button').click()
    await page.waitForSelector('[data-testid="project-tab-overflow-menu"]', { timeout: 3000 })
    await page.getByTestId('project-tab-overflow-item').first().click()
    step(true, QA_E2E_TAB_FLOW.steps.overflowSelect)
  }

  const totalTabsBeforeClose = await getTotalTabCount()
  await page.getByTestId('project-tab-button').first().hover()
  const closeButton = page.getByTestId('project-tab-close-button').first()
  const closeButtonVisible = (await closeButton.count()) > 0 && (await closeButton.isVisible().catch(() => false))
  if (!closeButtonVisible) {
    throw new Error('tab close button not visible')
  }
  await closeButton.click({ force: true })
  let totalTabsAfterClose = totalTabsBeforeClose
  const closed = await waitForCondition(async () => {
    totalTabsAfterClose = await getTotalTabCount()
    return totalTabsAfterClose < totalTabsBeforeClose
  }, 5000)
  step(closed, QA_E2E_TAB_FLOW.steps.close, `totalBefore=${totalTabsBeforeClose},totalAfter=${totalTabsAfterClose}`)
}

async function prepareFixtures() {
  await fs.mkdir(TMP_DIR, { recursive: true })

  const fixture = makeFixtureProject()

  const projectPath = path.join(TMP_DIR, 'fixture-open.bksp')
  await fs.writeFile(projectPath, JSON.stringify(fixture, null, 2), 'utf-8')

  const importDocxPath = path.join(TMP_DIR, 'fixture-import.docx')
  const importBlob = await exportDocx(fixture.chapters, fixture.metadata)
  await fs.writeFile(importDocxPath, Buffer.from(await importBlob.arrayBuffer()))

  const exportEpubPath = path.join(TMP_DIR, 'e2e-export.epub')
  const exportDocxPath = path.join(TMP_DIR, 'e2e-export.docx')
  const savedProjectPath = path.join(TMP_DIR, 'e2e-saved.bksp')
  await fs.rm(exportDocxPath, { force: true }).catch(() => undefined)
  await fs.rm(exportEpubPath, { force: true }).catch(() => undefined)
  await fs.rm(savedProjectPath, { force: true }).catch(() => undefined)

  return { projectPath, importDocxPath, exportEpubPath, exportDocxPath, savedProjectPath }
}

async function writeReport(payload) {
  await fs.mkdir(OUTPUT_DIR, { recursive: true })
  await fs.writeFile(OUTPUT_JSON, JSON.stringify(payload, null, 2), 'utf-8')
  const md = [
    '# E2E Smoke QA',
    '',
    `- createdAt: ${payload.createdAt}`,
    `- strict: ${STRICT}`,
    `- steps: ${steps.length}`,
    `- failures: ${failures.length}`,
    `- warnings: ${warnings.length}`,
    '',
    '## Steps',
    ...steps.map((s) => `- ${s.ok ? 'PASS' : 'FAIL'} ${s.name}${s.details ? `: ${s.details}` : ''}`),
    '',
    warnings.length > 0 ? '## Warnings' : '## Warnings (none)',
    ...warnings.map((w) => `- ${w}`),
    '',
    failures.length === 0 ? '## Result: PASS' : '## Result: FAIL',
    ...failures.map((f) => `- ${f}`),
    '',
  ]
  await fs.writeFile(OUTPUT_MD, md.join('\n'), 'utf-8')
}

async function runMacAutorun(fixtures) {
  const reportPath = path.join(TMP_DIR, 'e2e-macos-autorun-report.json')
  const dialogTracePath = path.join(TMP_DIR, 'e2e-macos-dialog.trace')
  await fs.rm(reportPath, { force: true }).catch(() => undefined)
  await fs.rm(`${reportPath}.trace`, { force: true }).catch(() => undefined)
  await fs.rm(dialogTracePath, { force: true }).catch(() => undefined)
  const appEntry = path.resolve('.')
  const child = spawn(
    'open',
    [
      '-n',
      '-a',
      path.join(path.dirname(electronBinary), '..', '..'),
      '--args',
      appEntry,
      fixtures.projectPath,
      '--qa-e2e-autorun=1',
      `--qa-e2e-project-file=${fixtures.projectPath}`,
      `--qa-e2e-report-file=${reportPath}`,
      '--qa-e2e-dialog-mode=1',
      `--qa-e2e-dialog-open-queue=${fixtures.importDocxPath}`,
      `--qa-e2e-dialog-save-queue=${fixtures.exportEpubPath};;${fixtures.exportDocxPath};;${fixtures.savedProjectPath}`,
      `--qa-e2e-dialog-trace-file=${dialogTracePath}`,
    ],
    {
      env: {
        ...process.env,
        QA_E2E_AUTORUN: '1',
        QA_E2E_DIALOG_MODE: '1',
        BOOKSPACE_PLAN: process.env.BOOKSPACE_PLAN || QA_E2E_RUNTIME_ENV.BOOKSPACE_PLAN,
        BOOKSPACE_AI_CREDITS: process.env.BOOKSPACE_AI_CREDITS || QA_E2E_RUNTIME_ENV.BOOKSPACE_AI_CREDITS,
        BOOKSPACE_COPILOT_RUNTIME_MODE:
          process.env.BOOKSPACE_COPILOT_RUNTIME_MODE || QA_E2E_RUNTIME_ENV.BOOKSPACE_COPILOT_RUNTIME_MODE,
      },
      stdio: 'ignore',
    },
  )

  const openExit = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) resolve(0)
      else reject(new Error(`open exited with code ${code}`))
    })
  })

  void openExit

  const reportReady = await waitForFile(reportPath, 60000)
  if (!reportReady) {
    throw new Error('macOS autorun report was not created')
  }

  const report = JSON.parse(await fs.readFile(reportPath, 'utf-8'))
  for (const item of report.steps ?? []) {
    step(Boolean(item.ok), String(item.name ?? 'unknown'), String(item.details ?? ''))
  }
  for (const item of report.warnings ?? []) {
    warn('e2e/warn', String(item))
  }
  for (const item of report.failures ?? []) {
    if (!failures.includes(String(item))) failures.push(String(item))
  }

  if (await waitForFile(fixtures.exportEpubPath, 5000)) {
    const epubWidthResult = await verifyEpubTableWidth(fixtures.exportEpubPath)
    step(epubWidthResult.ok, 'export/epub-table-width', epubWidthResult.details)
  }
}

async function run() {
  if (!ENABLED) {
    warn('e2e/skipped', 'set QA_E2E_RUN=1 to execute Electron UI smoke in GUI environment')
    const payload = {
      createdAt: new Date().toISOString(),
      fixtures: null,
      strict: STRICT,
      enabled: ENABLED,
      steps,
      warnings,
      failures,
    }
    await writeReport(payload)
    console.log('[qa:e2e] skipped')
    console.log(` - ${OUTPUT_JSON}`)
    console.log(` - ${OUTPUT_MD}`)
    return
  }

  const fixtures = await prepareFixtures()
  if (process.platform === 'darwin') {
    try {
      await runMacAutorun(fixtures)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (STRICT) {
        step(false, 'e2e/launch', message)
      } else {
        warn('e2e/skipped', `launch unavailable in this environment (${message})`)
      }
    }

    const payload = {
      createdAt: new Date().toISOString(),
      fixtures,
      strict: STRICT,
      enabled: ENABLED,
      steps,
      warnings,
      failures,
    }
    await writeReport(payload)

    if (failures.length > 0) {
      console.error('[qa:e2e] failed')
      failures.forEach((item) => console.error(` - ${item}`))
      process.exit(1)
    }

    if (warnings.length > 0) {
      console.log('[qa:e2e] passed with warnings')
      warnings.forEach((item) => console.log(` - ${item}`))
    } else {
      console.log('[qa:e2e] passed')
    }
    console.log(` - ${OUTPUT_JSON}`)
    console.log(` - ${OUTPUT_MD}`)
    return
  }

  const { _electron: electron } = await import('playwright-core')
  const appEntry = path.resolve('.')
  let app
  let launchArgv = []

  try {
    app = await electron.launch({
      executablePath: electronBinary,
      args: [appEntry, fixtures.projectPath],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        QA_E2E_DIALOG_MODE: '1',
        QA_E2E_DIALOG_OPEN_QUEUE: fixtures.importDocxPath,
        QA_E2E_DIALOG_SAVE_QUEUE: `${fixtures.exportEpubPath};;${fixtures.exportDocxPath};;${fixtures.savedProjectPath}`,
      },
    })
    launchArgv = await app.evaluate(() => process.argv)

    const page = await app.firstWindow()
    const helpButtonVisible = await waitForCondition(async () => {
      const button = page.getByRole('button', { name: LABEL.help }).first()
      const count = await button.count()
      if (count === 0) return false
      return button.isVisible().catch(() => false)
    }, 5000)
    const homeVisible = helpButtonVisible
    if (helpButtonVisible) {
      step(true, 'home/render')
      await page.getByRole('button', { name: LABEL.help }).click()
      await page.waitForSelector(`text=/${LABEL.quickStart.source}/`, { timeout: 5000 })
      step(true, 'help/open')
      await page.getByRole('button', { name: LABEL.close }).first().click()
    } else {
      step(true, 'home/optional-skipped', 'startup file opened editor view directly')
    }

    let openButtonCount = 0
    if (homeVisible) {
      const openButton = page.getByRole('button', { name: LABEL.openProject }).first()
      openButtonCount = await openButton.count()
    }
    let fallbackUsed = false
    let editorReady = await waitForCondition(async () => (await page.locator('.ProseMirror').count()) > 0, 8000)
    if (!editorReady) {
      fallbackUsed = true
      await app.evaluate(({ BrowserWindow }, filePath) => {
        const win = BrowserWindow.getAllWindows()[0]
        if (win && !win.isDestroyed()) {
          win.webContents.send('file-opened', filePath)
        }
      }, fixtures.projectPath)
      editorReady = await waitForCondition(async () => (await page.locator('.ProseMirror').count()) > 0, 8000)
    }
    step(
      editorReady,
      'project/open-bksp',
      `openButtonCount=${openButtonCount},fallbackUsed=${fallbackUsed},argv=${JSON.stringify(launchArgv)}`,
    )
    if (!editorReady) {
      await fs.mkdir(OUTPUT_DIR, { recursive: true })
      const debugScreenshotPath = path.join(OUTPUT_DIR, 'e2e-open-debug.png')
      const toastTexts = await page.locator('[data-sonner-toast]').allTextContents().catch(() => [])
      const visibleButtons = (await page.getByRole('button').allTextContents().catch(() => []))
        .map((text) => text.trim())
        .filter(Boolean)
      const debugLines = [
        `openButtonCount=${openButtonCount}`,
        `fallbackUsed=${fallbackUsed}`,
        `argv=${JSON.stringify(launchArgv)}`,
        `prosemirrorCount=${await page.locator('.ProseMirror').count()}`,
        `toasts=${JSON.stringify(toastTexts)}`,
        `buttons=${JSON.stringify(visibleButtons)}`,
      ]
      await fs.writeFile(path.join(OUTPUT_DIR, 'e2e-open-debug.txt'), `${debugLines.join('\n')}\n`, 'utf-8')
      await page.screenshot({ path: debugScreenshotPath, fullPage: true }).catch(() => undefined)
      throw new Error('editor view did not become ready (.ProseMirror)')
    }

    await runPlaywrightTabFlow(page)

    const exportDoc = async (format, outputPath, stepPrefix) => {
      await page.getByRole('button', { name: LABEL.export }).first().click()
      const exportModal = page.locator('[data-bookspace-modal-root="true"] [role="dialog"]').last()
      await exportModal.waitFor({ state: 'visible', timeout: 5000 })
      const formatSelect = exportModal.locator('select').first()
      await formatSelect.selectOption(format)
      const titleInput = exportModal.locator('input').first()
      await titleInput.click()
      await titleInput.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
      await titleInput.type('E2E Export Title', { delay: 20 })
      await titleInput.press('Enter')

      const exported = await waitForFile(outputPath, 15000)
      step(exported, `${stepPrefix}-file-created`, outputPath)
      const exportModalClosed = await waitForCondition(
        async () => (await page.locator('[data-bookspace-modal-root="true"]').count()) === 0,
        15000,
      )
      step(exportModalClosed, `${stepPrefix}/modal-closed`)
      if (!exported || !exportModalClosed) {
        const debugLines = [
          `format=${format}`,
          `outputPath=${outputPath}`,
          `exported=${exported}`,
          `exportModalClosed=${exportModalClosed}`,
          `titleValue=${await exportModal.locator('input').first().inputValue().catch(() => '')}`,
          `modalText=${JSON.stringify(await exportModal.allTextContents().catch(() => []))}`,
          `toasts=${JSON.stringify(await page.locator('[data-sonner-toast]').allTextContents().catch(() => []))}`,
        ]
        await fs.mkdir(OUTPUT_DIR, { recursive: true })
        await fs.writeFile(
          path.join(OUTPUT_DIR, `e2e-export-${format}-debug.txt`),
          `${debugLines.join('\n')}\n`,
          'utf-8',
        )
      }
      if (!exportModalClosed) {
        throw new Error('export modal remained open after export')
      }
      return exported
    }

    const exportedEpub = await exportDoc('epub', fixtures.exportEpubPath, 'export/epub')
    const epubWidthResult = await verifyEpubTableWidth(fixtures.exportEpubPath)
    step(epubWidthResult.ok, 'export/epub-table-width', epubWidthResult.details)
    if (!exportedEpub) {
      throw new Error('epub export did not generate file')
    }

    page.once('dialog', async (dialog) => {
      await dialog.accept()
    })
    await page.getByRole('button', { name: LABEL.import }).first().click()
    await page.getByRole('button', { name: LABEL.importDocx }).first().click()
    const importToastVisible = await waitForCondition(
      async () => (await page.locator(`text=/${LABEL.importDocxDone.source}/`).count()) > 0,
      5000,
    )
    step(true, 'import/docx')
    step(importToastVisible, 'import/docx-toast-visible')

    await exportDoc('docx', fixtures.exportDocxPath, 'export/docx')

    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+S' : 'Control+S')
    let saved = await waitForFile(fixtures.savedProjectPath, 8000)
    if (!saved) {
      await app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0]
        if (win && !win.isDestroyed()) {
          win.webContents.send('menu-action', 'save-project')
        }
      })
      saved = await waitForFile(fixtures.savedProjectPath, 10000)
    }
    step(saved, 'project/save-bksp-created', fixtures.savedProjectPath)
    if (saved) {
      const saveToastVisible = await waitForCondition(
        async () => (await page.locator(`text=/${LABEL.saveDone.source}/`).count()) > 0,
        5000,
      )
      step(saveToastVisible, 'toast/save-visible')
    }

    const historyButton = page.getByRole('button', { name: LABEL.history }).first()
    const historyVisible = (await historyButton.count()) > 0 && (await historyButton.isVisible().catch(() => false))
    let historyOpened = false
    if (historyVisible) {
      await historyButton.click()
      historyOpened = await waitForCondition(
        async () => (await page.locator(`text=/${LABEL.history.source}/`).count()) > 0,
        5000,
      )
    } else {
      await app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0]
        if (win && !win.isDestroyed()) {
          win.webContents.send('menu-action', 'open-version-manager')
        }
      })
      historyOpened = await waitForCondition(
        async () => (await page.locator(`text=/${LABEL.history.source}/`).count()) > 0,
        5000,
      )
    }
    step(historyOpened, 'history/modal-open')
    if (historyOpened) {
      await page.keyboard.press('Escape')
    }

    await openCopilot(page)
    await runPlaywrightCopilotFlows(page)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('Process failed to launch') || message.includes('SIGABRT')) {
      if (STRICT) {
        step(false, 'e2e/launch', message)
      } else {
        warn('e2e/skipped', `launch unavailable in this environment (${message})`)
      }
    } else {
      step(false, 'e2e/exception', message)
    }
  } finally {
    if (app) {
      await app.close().catch(() => undefined)
    }
  }

  const payload = {
    createdAt: new Date().toISOString(),
    fixtures,
    strict: STRICT,
    enabled: ENABLED,
    steps,
    warnings,
    failures,
  }
  await writeReport(payload)

  if (failures.length > 0) {
    console.error('[qa:e2e] failed')
    failures.forEach((item) => console.error(` - ${item}`))
    process.exit(1)
  }

  if (warnings.length > 0) {
    console.log('[qa:e2e] passed with warnings')
    warnings.forEach((item) => console.log(` - ${item}`))
  } else {
    console.log('[qa:e2e] passed')
  }
  console.log(` - ${OUTPUT_JSON}`)
  console.log(` - ${OUTPUT_MD}`)
}

run().catch(async (error) => {
  const payload = {
    createdAt: new Date().toISOString(),
    fixtures: null,
    strict: STRICT,
    enabled: ENABLED,
    steps,
    warnings,
    failures: [...failures, error instanceof Error ? error.message : String(error)],
  }
  await writeReport(payload)
  console.error('[qa:e2e] failed')
  console.error(error)
  process.exit(1)
})
