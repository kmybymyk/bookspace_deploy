#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { validateAiCommandEnvelope } from '../shared/aiCommandSchema.ts'

const ROOT = process.cwd()
const FIXTURE_PATH = path.join(ROOT, 'scripts/fixtures/copilot-action-fixtures.v1.json')
const APPLY_PATH = path.join(ROOT, 'src/features/copilot/applyCopilotCommands.ts')
const OUTPUT_DIR = path.join(ROOT, 'reports/qa')
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'copilot-action-eval.latest.json')
const OUTPUT_MD = path.join(OUTPUT_DIR, 'copilot-action-eval.latest.md')

function hasApplyIntentExecutionMarker(applySource, intent) {
  if (applySource.includes(`command.type === '${intent}'`)) return true
  if (!applySource.includes('commandDispatchers') || !applySource.includes(`${intent}:`)) return false
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
  return true
}

async function main() {
  const fixture = JSON.parse(await fs.readFile(FIXTURE_PATH, 'utf-8'))
  const applySource = await fs.readFile(APPLY_PATH, 'utf-8')
  const failures = []
  const checks = []

  for (const item of fixture.cases ?? []) {
    const result = validateAiCommandEnvelope(item.envelope)
    const ok = Boolean(result.ok && result.normalized)
    checks.push({ name: `schema/${item.name}`, ok })
    if (!ok) {
      failures.push(`schema/${item.name}: ${result.errors.join('; ') || 'invalid envelope'}`)
    }
  }

  const applyNeedles = [
    { name: 'apply/rewrite', ok: hasApplyIntentExecutionMarker(applySource, 'rewrite_selection') },
    { name: 'apply/append', ok: hasApplyIntentExecutionMarker(applySource, 'append_text') },
    { name: 'apply/find-replace', ok: hasApplyIntentExecutionMarker(applySource, 'find_replace') },
    { name: 'apply/save-project', ok: hasApplyIntentExecutionMarker(applySource, 'save_project') },
    { name: 'apply/rename-chapter', ok: hasApplyIntentExecutionMarker(applySource, 'rename_chapter') },
    { name: 'apply/delete-chapter', ok: hasApplyIntentExecutionMarker(applySource, 'delete_chapter') },
    { name: 'apply/move-chapter', ok: hasApplyIntentExecutionMarker(applySource, 'move_chapter') },
    { name: 'apply/set-chapter-type', ok: hasApplyIntentExecutionMarker(applySource, 'set_chapter_type') },
    { name: 'apply/set-typography', ok: hasApplyIntentExecutionMarker(applySource, 'set_typography') },
    { name: 'apply/set-page-background', ok: hasApplyIntentExecutionMarker(applySource, 'set_page_background') },
    { name: 'apply/apply-theme', ok: hasApplyIntentExecutionMarker(applySource, 'apply_theme') },
    { name: 'apply/update-book-info', ok: hasApplyIntentExecutionMarker(applySource, 'update_book_info') },
    { name: 'apply/set-cover-asset', ok: hasApplyIntentExecutionMarker(applySource, 'set_cover_asset') },
    { name: 'apply/export-project', ok: hasApplyIntentExecutionMarker(applySource, 'export_project') },
    { name: 'apply/restore-snapshot', ok: hasApplyIntentExecutionMarker(applySource, 'restore_snapshot') },
    { name: 'apply/create', ok: hasApplyIntentExecutionMarker(applySource, 'create_chapter') },
    { name: 'apply/table', ok: hasApplyIntentExecutionMarker(applySource, 'insert_table') },
    { name: 'apply/illustration', ok: hasApplyIntentExecutionMarker(applySource, 'insert_illustration') },
    { name: 'apply/rollback-chapters', ok: applySource.includes('rollbackChapters') },
    { name: 'apply/rollback-project-store', ok: applySource.includes('rollbackMetadata') && applySource.includes('rollbackProjectSessionId') },
    { name: 'apply/rollback-design-store', ok: applySource.includes('rollbackDesignSettings') },
    { name: 'apply/transaction-safety', ok: applySource.includes('validateEnvelopeTransactionSafety') && applySource.includes('비가역 워크플로우 명령') },
  ]
  for (const check of applyNeedles) {
    checks.push({ name: check.name, ok: check.ok })
    if (!check.ok) {
      failures.push(`${check.name}: missing apply handler marker`)
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    ok: failures.length === 0,
    checks,
    failures,
  }
  await fs.mkdir(OUTPUT_DIR, { recursive: true })
  await fs.writeFile(OUTPUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf-8')
  const md = [
    '# Copilot Action Eval',
    '',
    `- generatedAt: ${report.generatedAt}`,
    `- checks: ${checks.length}`,
    `- failures: ${failures.length}`,
    '',
    report.ok ? '## Result: PASS' : '## Result: FAIL',
    ...failures.map((item) => `- ${item}`),
    '',
  ]
  await fs.writeFile(OUTPUT_MD, `${md.join('\n')}\n`, 'utf-8')

  if (!report.ok) {
    console.error('[qa:copilot:action] failed')
    failures.forEach((item) => console.error(` - ${item}`))
    process.exit(1)
  }
  console.log('[qa:copilot:action] passed')
  console.log(` - ${OUTPUT_JSON}`)
  console.log(` - ${OUTPUT_MD}`)
}

main().catch((error) => {
  console.error('[qa:copilot:action] failed')
  console.error(error)
  process.exit(1)
})
