#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'

const ROOT = process.cwd()
const FIXTURE_PATH = path.join(ROOT, 'scripts/fixtures/copilot-storage-fixtures.v1.json')
const RIGHT_PANE_PATH = path.join(ROOT, 'src/components/layout/RightPane.tsx')
const RIGHT_PANE_RENDERER_PATH = path.join(ROOT, 'src/features/copilot/rightPaneMessageRenderer.tsx')
const RUNTIME_API_PATH = path.join(ROOT, 'scripts/subscription-runtime-api.mjs')
const ELECTRON_MAIN_PATH = path.join(ROOT, 'electron/main.ts')
const COPILOT_RUNTIME_PATH = path.join(ROOT, 'electron/services/copilotRuntimeService.ts')
const REPORT_DIR = path.join(ROOT, 'reports/qa')
const JSON_REPORT_PATH = path.join(REPORT_DIR, 'copilot-workflow-eval.latest.json')
const MD_REPORT_PATH = path.join(REPORT_DIR, 'copilot-workflow-eval.latest.md')

function buildCopilotStorageScope(projectPath, projectSessionId, metadata) {
  const normalizedPath = String(projectPath ?? '').trim()
  if (normalizedPath) return encodeURIComponent(`file:${normalizedPath}`)
  const normalizedSessionId = String(projectSessionId ?? '').trim()
  if (normalizedSessionId) return encodeURIComponent(`draft-session:${normalizedSessionId}`)
  const primaryAuthorId = String(metadata?.authors?.[0]?.id ?? '').trim()
  if (primaryAuthorId) return encodeURIComponent(`draft-author:${primaryAuthorId}`)
  const fallbackIdentity = [
    String(metadata?.title ?? '').trim(),
    String(metadata?.subtitle ?? '').trim(),
    String(metadata?.language ?? '').trim(),
    String(metadata?.isbn ?? '').trim(),
    String(metadata?.publisher ?? '').trim(),
  ].filter(Boolean).join('|')
  const base = fallbackIdentity ? `draft-meta:${fallbackIdentity}` : 'draft:global'
  return encodeURIComponent(base)
}

function decodeScope(scope) {
  try {
    return decodeURIComponent(scope)
  } catch {
    return scope
  }
}

function evaluateStorageCases(fixtures) {
  const failures = []
  let passed = 0
  for (const testCase of fixtures.cases ?? []) {
    const scope = buildCopilotStorageScope(
      testCase.input?.projectPath ?? null,
      testCase.input?.projectSessionId ?? '',
      testCase.input?.metadata ?? null,
    )
    const decoded = decodeScope(scope)
    if (testCase.expectScopePrefix && !decoded.startsWith(testCase.expectScopePrefix)) {
      failures.push({
        name: testCase.name,
        reason: `expected scope prefix '${testCase.expectScopePrefix}', got '${decoded}'`,
      })
      continue
    }
    if (testCase.expectDifferent && testCase.compareWith) {
      const compareScope = buildCopilotStorageScope(
        testCase.compareWith?.projectPath ?? null,
        testCase.compareWith?.projectSessionId ?? '',
        testCase.compareWith?.metadata ?? null,
      )
      if (scope === compareScope) {
        failures.push({
          name: testCase.name,
          reason: 'expected scopes to be different, but they matched',
        })
        continue
      }
    }
    passed += 1
  }
  return {
    total: (fixtures.cases ?? []).length,
    passed,
    failures,
  }
}

function evaluateRendererCapabilities(source) {
  const checks = [
    {
      name: 'inline-bold',
      ok:
        source.includes('\\*\\*([^*]+)\\*\\*') ||
        source.includes('match[5]') ||
        source.includes('key={`${keyPrefix}-bold-${tokenIndex}`}'),
    },
    {
      name: 'inline-strike',
      ok:
        source.includes('~~([^~]+)~~') ||
        source.includes('match[6]') ||
        source.includes('key={`${keyPrefix}-strike-${tokenIndex}`}'),
    },
    {
      name: 'fenced-code',
      ok: /const isFence = \(line: string\) => \/\^```\/\.test\(line(?:\.trim\(\))?\)/.test(source),
    },
    {
      name: 'markdown-table',
      ok: /const isTableLine = \(line: string\)/.test(source),
    },
    {
      name: 'horizontal-rule',
      ok: /const isHr = \(line: string\)/.test(source),
    },
  ]
  const failures = []
  let passed = 0
  for (const check of checks) {
    if (!check.ok) {
      failures.push({
        name: check.name,
        reason: 'required rendering capability pattern was not found',
      })
      continue
    }
    passed += 1
  }
  return {
    total: checks.length,
    passed,
    failures,
  }
}

function evaluateDomainPromptAlignment(runtimeSource, directSource) {
  const checks = [
    {
      name: 'runtime-chat-system-prompt',
      needle: 'Never present yourself as a book recommendation or reading assistant.',
      source: runtimeSource,
    },
    {
      name: 'runtime-domain-term-xhtml',
      needle: 'DomainTerm: "빈 페이지" means new XHTML chapter page.',
      source: runtimeSource,
    },
    {
      name: 'runtime-chat-capability-reply',
      needle: '새 페이지(XHTML 챕터) 생성',
      source: runtimeSource,
    },
    {
      name: 'direct-chat-system-prompt',
      needle: 'Never present yourself as a reading assistant or book recommendation bot.',
      source: directSource,
    },
  ]

  const failures = []
  let passed = 0
  for (const check of checks) {
    if (!check.source.includes(check.needle)) {
      failures.push({
        name: check.name,
        reason: 'required domain prompt marker was not found',
      })
      continue
    }
    passed += 1
  }
  return {
    total: checks.length,
    passed,
    failures,
  }
}

async function main() {
  const fixtures = JSON.parse(await fs.readFile(FIXTURE_PATH, 'utf-8'))
  const rightPaneSource = await fs.readFile(RIGHT_PANE_PATH, 'utf-8')
  const rightPaneRendererSource = await fs.readFile(RIGHT_PANE_RENDERER_PATH, 'utf-8')
  const runtimeSource = await fs.readFile(RUNTIME_API_PATH, 'utf-8')
  const mainSource = await fs.readFile(ELECTRON_MAIN_PATH, 'utf-8')
  const copilotRuntimeSource = await fs.readFile(COPILOT_RUNTIME_PATH, 'utf-8')
  const rendererSource = `${rightPaneSource}\n${rightPaneRendererSource}`
  const directSource = `${mainSource}\n${copilotRuntimeSource}`

  const storage = evaluateStorageCases(fixtures)
  const renderer = evaluateRendererCapabilities(rendererSource)
  const domainPrompt = evaluateDomainPromptAlignment(runtimeSource, directSource)
  const totalFailures = [...storage.failures, ...renderer.failures, ...domainPrompt.failures]
  const ok = totalFailures.length === 0

  await fs.mkdir(REPORT_DIR, { recursive: true })
  const report = {
    ok,
    generatedAt: new Date().toISOString(),
    summary: {
      storage,
      renderer,
      domainPrompt,
    },
    failures: totalFailures,
  }
  await fs.writeFile(JSON_REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf-8')

  const lines = [
    '# Copilot Workflow Eval',
    '',
    `- Result: ${ok ? 'PASS' : 'FAIL'}`,
    `- Generated: ${report.generatedAt}`,
    '',
    '## Storage Scope',
    `- Passed: ${storage.passed}/${storage.total}`,
    '',
    '## Renderer Capability',
    `- Passed: ${renderer.passed}/${renderer.total}`,
    '',
    '## Domain Prompt',
    `- Passed: ${domainPrompt.passed}/${domainPrompt.total}`,
    '',
  ]
  if (!ok) {
    lines.push('## Failures')
    for (const failure of totalFailures) {
      lines.push(`- ${failure.name}: ${failure.reason}`)
    }
  }
  await fs.writeFile(MD_REPORT_PATH, `${lines.join('\n')}\n`, 'utf-8')

  if (!ok) {
    console.error('qa-copilot-workflow-eval: FAIL')
    process.exit(1)
  }
  console.log('qa-copilot-workflow-eval: PASS')
}

main().catch((error) => {
  console.error('qa-copilot-workflow-eval: ERROR', error)
  process.exit(1)
})
