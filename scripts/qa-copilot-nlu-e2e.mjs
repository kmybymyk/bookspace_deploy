#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveAgentV3PriorityRoute } from '../src/features/copilot/agentV3Routing.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')

const REGISTRY_PATH = path.join(root, 'shared/copilotCapabilityRegistry.v1.json')
const CHAPTER_SLOT_FIXTURE_PATH = path.join(root, 'scripts/fixtures/copilot-create-chapter-slots.v1.json')
const FIXTURE_PATH = path.join(root, 'scripts/fixtures/copilot-nlu-regression.v1.json')
const APPLY_PATH = path.join(root, 'src/features/copilot/applyCopilotCommands.ts')
const MAIN_PATH = path.join(root, 'electron/main.ts')
const COPILOT_RUNTIME_PATH = path.join(root, 'electron/services/copilotRuntimeService.ts')
const RUNTIME_API_PATH = path.join(root, 'scripts/subscription-runtime-api.mjs')
const CHAPTER_PARSER_PATH = path.join(root, 'shared/createChapterPromptParser.ts')
const OUTPUT_DIR = path.join(root, 'reports/qa')
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'copilot-nlu-e2e.latest.json')
const OUTPUT_MD = path.join(OUTPUT_DIR, 'copilot-nlu-e2e.latest.md')

const checks = []
const failures = []

function check(ok, name, details) {
  checks.push({ ok, name, details })
  if (!ok) failures.push(`${name}: ${details}`)
}

function normalizePrompt(prompt) {
  return String(prompt ?? '').toLowerCase().trim()
}

function includesKeyword(prompt, keyword) {
  const normalized = String(keyword ?? '').toLowerCase().trim()
  if (!normalized) return false
  return prompt.includes(normalized)
}

function matchesRule(prompt, rule) {
  const anyKeywords = Array.isArray(rule.keywordsAny) ? rule.keywordsAny : []
  const allKeywords = Array.isArray(rule.keywordsAll) ? rule.keywordsAll : []
  const anyPass = anyKeywords.length === 0 || anyKeywords.some((keyword) => includesKeyword(prompt, keyword))
  const allPass = allKeywords.length === 0 || allKeywords.every((keyword) => includesKeyword(prompt, keyword))
  return anyPass && allPass
}

function resolveIntent(registry, { prompt, hasSelection }) {
  const agentV3Priority = resolveAgentV3PriorityRoute({
    prompt,
    hasSelection,
  })
  if (agentV3Priority) {
    return {
      route: agentV3Priority.route,
      intent: agentV3Priority.intent,
      reason: agentV3Priority.reason,
    }
  }

  const normalizedPrompt = normalizePrompt(prompt)
  if (!normalizedPrompt) return { route: 'chat', intent: null, reason: 'empty-prompt' }
  const sortedRules = [...(registry.capabilities ?? [])].sort((a, b) => Number(b.priority ?? 0) - Number(a.priority ?? 0))
  const matched = sortedRules.find((rule) => matchesRule(normalizedPrompt, rule))
  if (!matched) return { route: 'chat', intent: null, reason: 'no-intent-match' }
  if (matched.requiresSelection && !hasSelection) {
    return { route: 'chat', intent: null, reason: 'rewrite-missing-selection' }
  }
  return { route: 'command', intent: matched.intent, reason: 'intent-match' }
}

function hasApplyIntentExecutionMarker(applySource, intent) {
  const legacyBranchMarker = `command.type === '${intent}'`
  if (applySource.includes(legacyBranchMarker)) return true

  const dispatcherEntryMarker = `${intent}:`
  if (!applySource.includes('commandDispatchers') || !applySource.includes(dispatcherEntryMarker)) {
    return false
  }

  if (intent === 'rewrite_selection') return applySource.includes('applyRewriteSelectionCommand')
  if (intent === 'append_text') return applySource.includes('applyAppendTextCommand')
  if (intent === 'find_replace') return applySource.includes('applyFindReplaceCommand')
  if (intent === 'save_project') return applySource.includes('applySaveProjectCommand')
  if (intent === 'rename_chapter') return applySource.includes('applyRenameChapterCommand')
  if (intent === 'delete_chapter') return applySource.includes('applyDeleteChapterCommand')
  if (intent === 'move_chapter') return applySource.includes('applyMoveChapterCommand')
  if (intent === 'set_chapter_type') return applySource.includes('applySetChapterTypeCommand')
  if (intent === 'set_typography') return applySource.includes('applySetTypographyCommand')
  if (intent === 'set_page_background') return applySource.includes('applySetPageBackgroundCommand')
  if (intent === 'apply_theme') return applySource.includes('applyApplyThemeCommand')
  if (intent === 'update_book_info') return applySource.includes('applyUpdateBookInfoCommand')
  if (intent === 'set_cover_asset') return applySource.includes('applySetCoverAssetCommand')
  if (intent === 'export_project') return applySource.includes('applyExportProjectCommand')
  if (intent === 'restore_snapshot') return applySource.includes('applyRestoreSnapshotCommand')
  if (intent === 'create_chapter') return applySource.includes('applyCreateChapterCommand')
  if (intent === 'insert_table') return applySource.includes('applyInsertTableCommand')
  if (intent === 'insert_illustration') return applySource.includes('applyInsertIllustrationCommand')
  if (intent === 'feedback_report') return applySource.includes('feedback_report')
  return true
}

function evaluateExecutionPathCoverage({ applySource, mainSource, copilotRuntimeSource, runtimeSource }) {
  const intentToNeedles = {
    rewrite_selection: [
      hasApplyIntentExecutionMarker(applySource, 'rewrite_selection'),
      (mainSource.includes('resolveCopilotIntentPlan({') && mainSource.includes("intent === 'rewrite_selection'")) ||
        (copilotRuntimeSource.includes('resolveCopilotIntentPlan({') &&
          copilotRuntimeSource.includes("intent === 'rewrite_selection'")),
      runtimeSource.includes('resolveCopilotIntentPlan({') && runtimeSource.includes("plannedIntent === 'rewrite_selection'"),
    ],
    append_text: [
      hasApplyIntentExecutionMarker(applySource, 'append_text'),
      mainSource.includes("intent === 'append_text'") || copilotRuntimeSource.includes("intent === 'append_text'"),
      runtimeSource.includes("plannedIntent === 'append_text'"),
    ],
    find_replace: [
      hasApplyIntentExecutionMarker(applySource, 'find_replace'),
      mainSource.includes("intent === 'find_replace'") || copilotRuntimeSource.includes("intent === 'find_replace'"),
      runtimeSource.includes("plannedIntent === 'find_replace'"),
    ],
    save_project: [
      hasApplyIntentExecutionMarker(applySource, 'save_project'),
      mainSource.includes("intent === 'save_project'") || copilotRuntimeSource.includes("intent === 'save_project'"),
      runtimeSource.includes("plannedIntent === 'save_project'"),
    ],
    rename_chapter: [
      hasApplyIntentExecutionMarker(applySource, 'rename_chapter'),
      mainSource.includes("intent === 'rename_chapter'") || copilotRuntimeSource.includes("intent === 'rename_chapter'"),
      runtimeSource.includes("plannedIntent === 'rename_chapter'"),
    ],
    delete_chapter: [
      hasApplyIntentExecutionMarker(applySource, 'delete_chapter'),
      mainSource.includes("intent === 'delete_chapter'") || copilotRuntimeSource.includes("intent === 'delete_chapter'"),
      runtimeSource.includes("plannedIntent === 'delete_chapter'"),
    ],
    move_chapter: [
      hasApplyIntentExecutionMarker(applySource, 'move_chapter'),
      mainSource.includes("intent === 'move_chapter'") || copilotRuntimeSource.includes("intent === 'move_chapter'"),
      runtimeSource.includes("plannedIntent === 'move_chapter'"),
    ],
    set_chapter_type: [
      hasApplyIntentExecutionMarker(applySource, 'set_chapter_type'),
      mainSource.includes("intent === 'set_chapter_type'") || copilotRuntimeSource.includes("intent === 'set_chapter_type'"),
      runtimeSource.includes("plannedIntent === 'set_chapter_type'"),
    ],
    set_typography: [
      hasApplyIntentExecutionMarker(applySource, 'set_typography'),
      mainSource.includes("intent === 'set_typography'") || copilotRuntimeSource.includes("intent === 'set_typography'"),
      runtimeSource.includes("plannedIntent === 'set_typography'"),
    ],
    set_page_background: [
      hasApplyIntentExecutionMarker(applySource, 'set_page_background'),
      mainSource.includes("intent === 'set_page_background'") || copilotRuntimeSource.includes("intent === 'set_page_background'"),
      runtimeSource.includes("plannedIntent === 'set_page_background'"),
    ],
    apply_theme: [
      hasApplyIntentExecutionMarker(applySource, 'apply_theme'),
      mainSource.includes("intent === 'apply_theme'") || copilotRuntimeSource.includes("intent === 'apply_theme'"),
      runtimeSource.includes("plannedIntent === 'apply_theme'"),
    ],
    update_book_info: [
      hasApplyIntentExecutionMarker(applySource, 'update_book_info'),
      mainSource.includes("intent === 'update_book_info'") || copilotRuntimeSource.includes("intent === 'update_book_info'"),
      runtimeSource.includes("plannedIntent === 'update_book_info'"),
    ],
    set_cover_asset: [
      hasApplyIntentExecutionMarker(applySource, 'set_cover_asset'),
      mainSource.includes("intent === 'set_cover_asset'") || copilotRuntimeSource.includes("intent === 'set_cover_asset'"),
      runtimeSource.includes("plannedIntent === 'set_cover_asset'"),
    ],
    export_project: [
      hasApplyIntentExecutionMarker(applySource, 'export_project'),
      mainSource.includes("intent === 'export_project'") || copilotRuntimeSource.includes("intent === 'export_project'"),
      runtimeSource.includes("plannedIntent === 'export_project'"),
    ],
    restore_snapshot: [
      hasApplyIntentExecutionMarker(applySource, 'restore_snapshot'),
      mainSource.includes("intent === 'restore_snapshot'") || copilotRuntimeSource.includes("intent === 'restore_snapshot'"),
      runtimeSource.includes("plannedIntent === 'restore_snapshot'"),
    ],
    create_chapter: [
      hasApplyIntentExecutionMarker(applySource, 'create_chapter'),
      mainSource.includes("intent === 'create_chapter'") || copilotRuntimeSource.includes("intent === 'create_chapter'"),
      runtimeSource.includes("plannedIntent === 'create_chapter'"),
    ],
    insert_table: [
      hasApplyIntentExecutionMarker(applySource, 'insert_table'),
      mainSource.includes("intent === 'insert_table'") || copilotRuntimeSource.includes("intent === 'insert_table'"),
      runtimeSource.includes("plannedIntent === 'insert_table'"),
    ],
    insert_illustration: [
      hasApplyIntentExecutionMarker(applySource, 'insert_illustration'),
      mainSource.includes("intent === 'insert_illustration'") || copilotRuntimeSource.includes("intent === 'insert_illustration'"),
      runtimeSource.includes("plannedIntent === 'insert_illustration'"),
    ],
    feedback_report: [
      hasApplyIntentExecutionMarker(applySource, 'feedback_report'),
      mainSource.includes('피드백') ||
        mainSource.includes('feedback_report') ||
        copilotRuntimeSource.includes('피드백') ||
        copilotRuntimeSource.includes('feedback_report'),
      runtimeSource.includes('feedback_report'),
    ],
  }

  const gaps = []
  for (const [intent, markers] of Object.entries(intentToNeedles)) {
    if (markers.every(Boolean)) continue
    gaps.push(intent)
  }
  return {
    ok: gaps.length === 0,
    gaps,
  }
}

function evaluateCreateChapterSlotCoverage({ parserSource, slotFixture }) {
  const parserMarkers = [
    parserSource.includes('parseCreateChapterDraftFromPrompt'),
    parserSource.includes('buildNormalizedCreateChapterPrompt'),
    parserSource.includes('extractField(rawPrompt, [\'종류\''),
    parserSource.includes('extractField(rawPrompt, [\'제목\''),
    parserSource.includes('extractField(rawPrompt, [\'내용\''),
  ]
  const fixtureCases = Array.isArray(slotFixture?.cases) ? slotFixture.cases.length : 0
  const hasKindCase = String(JSON.stringify(slotFixture ?? {})).includes('chapterKind')
  const hasTitleCase = String(JSON.stringify(slotFixture ?? {})).includes('title')
  const hasContentCase = String(JSON.stringify(slotFixture ?? {})).includes('minBlocks')
  const ok = parserMarkers.every(Boolean) && fixtureCases >= 4 && hasKindCase && hasTitleCase && hasContentCase
  const reasons = []
  if (!parserMarkers.every(Boolean)) reasons.push('missing parser markers')
  if (fixtureCases < 4) reasons.push(`insufficient slot fixture cases: ${fixtureCases}`)
  if (!hasKindCase) reasons.push('slot fixture missing kind assertions')
  if (!hasTitleCase) reasons.push('slot fixture missing title assertions')
  if (!hasContentCase) reasons.push('slot fixture missing content assertions')
  return { ok, reasons }
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true })
  const registry = JSON.parse(await fs.readFile(REGISTRY_PATH, 'utf-8'))
  const slotFixture = JSON.parse(await fs.readFile(CHAPTER_SLOT_FIXTURE_PATH, 'utf-8'))
  const fixture = JSON.parse(await fs.readFile(FIXTURE_PATH, 'utf-8'))
  const applySource = await fs.readFile(APPLY_PATH, 'utf-8')
  const mainSource = await fs.readFile(MAIN_PATH, 'utf-8')
  const copilotRuntimeSource = await fs.readFile(COPILOT_RUNTIME_PATH, 'utf-8')
  const runtimeSource = await fs.readFile(RUNTIME_API_PATH, 'utf-8')
  const chapterParserSource = await fs.readFile(CHAPTER_PARSER_PATH, 'utf-8')

  const cases = Array.isArray(fixture.cases) ? fixture.cases : []
  check(cases.length >= 50, 'nlu/case-count', `expected >=50 cases, got ${cases.length}`)

  const caseResults = cases.map((testCase) => {
    const resolved = resolveIntent(registry, {
      prompt: testCase.prompt,
      hasSelection: Boolean(testCase.hasSelection),
    })
    const routeOk = resolved.route === testCase.expectedRoute
    const intentOk = (resolved.intent ?? null) === (testCase.expectedIntent ?? null)
    check(routeOk, `case/${testCase.id}/route`, `expected ${testCase.expectedRoute}, got ${resolved.route}`)
    check(intentOk, `case/${testCase.id}/intent`, `expected ${testCase.expectedIntent}, got ${resolved.intent}`)
    return {
      id: testCase.id,
      prompt: testCase.prompt,
      expectedRoute: testCase.expectedRoute,
      expectedIntent: testCase.expectedIntent ?? null,
      resolvedRoute: resolved.route,
      resolvedIntent: resolved.intent ?? null,
      reason: resolved.reason,
      pass: routeOk && intentOk,
    }
  })

  const coverage = evaluateExecutionPathCoverage({ applySource, mainSource, copilotRuntimeSource, runtimeSource })
  check(coverage.ok, 'execution-path/coverage', `missing execution path for intents: ${coverage.gaps.join(', ') || '(none)'}`)
  const slotCoverage = evaluateCreateChapterSlotCoverage({
    parserSource: chapterParserSource,
    slotFixture,
  })
  check(
    slotCoverage.ok,
    'slot-parser/coverage',
    slotCoverage.reasons.join(', ') || 'ok',
  )

  const report = {
    createdAt: new Date().toISOString(),
    registryVersion: registry.version,
    fixtureVersion: fixture.version,
    summary: {
      totalCases: caseResults.length,
      passedCases: caseResults.filter((item) => item.pass).length,
      failedCases: caseResults.filter((item) => !item.pass).length,
      totalChecks: checks.length,
      failedChecks: failures.length,
      executionPathCoverageOk: coverage.ok,
      executionPathGaps: coverage.gaps,
      slotParserCoverageOk: slotCoverage.ok,
      slotParserCoverageReasons: slotCoverage.reasons,
    },
    checks,
    failures,
    caseResults,
  }

  await fs.writeFile(OUTPUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf-8')
  const md = [
    '# Copilot NLU E2E QA',
    '',
    `- createdAt: ${report.createdAt}`,
    `- registryVersion: ${report.registryVersion}`,
    `- fixtureVersion: ${report.fixtureVersion}`,
    `- totalCases: ${report.summary.totalCases}`,
    `- failedCases: ${report.summary.failedCases}`,
    `- executionPathCoverageOk: ${report.summary.executionPathCoverageOk}`,
    '',
    report.summary.failedChecks > 0 ? '## Result: FAIL' : '## Result: PASS',
    ...failures.map((item) => `- ${item}`),
    '',
  ]
  await fs.writeFile(OUTPUT_MD, `${md.join('\n')}\n`, 'utf-8')

  if (failures.length > 0) {
    console.error('[qa:copilot:nlu-e2e] failed')
    failures.forEach((item) => console.error(` - ${item}`))
    process.exit(1)
  }
  console.log('[qa:copilot:nlu-e2e] passed')
  console.log(` - ${OUTPUT_JSON}`)
  console.log(` - ${OUTPUT_MD}`)
}

main().catch((error) => {
  console.error('[qa:copilot:nlu-e2e] failed')
  console.error(error)
  process.exit(1)
})
