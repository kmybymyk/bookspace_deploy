#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import JSZip from 'jszip'
import { createQuickStartTemplate } from '../src/features/home/quickStartTemplate.ts'
import { exportDocx } from '../src/features/export/docxExporter.ts'
import { IMPORT_FILE_EXTENSIONS, PROJECT_FILE_EXTENSION, PROJECT_FILE_EXTENSIONS } from '../shared/filePolicy.ts'
import {
  AI_COMMAND_SCHEMA_VERSION,
  MAX_COMMANDS_PER_REQUEST,
  validateAiCommandEnvelope,
} from '../shared/aiCommandSchema.ts'
import {
  parseApplyThemeDraftFromPrompt,
  parseExportProjectDraftFromPrompt,
  parseMoveChapterDraftFromPrompt,
  parseRenameChapterDraftFromPrompt,
  parseSetChapterTypeDraftFromPrompt,
  parseUpdateBookInfoDraftFromPrompt,
} from '../shared/copilotP1P2PromptParser.ts'
import {
  buildNormalizedCreateChapterPrompt,
  parseCreateChapterDraftFromPrompt,
  resolveCreateChapterPlacement,
} from '../shared/createChapterPromptParser.ts'
import {
  buildMissingPageSuggestion,
  buildMissingPageProposal,
  resolvePromptPageReference,
} from '../src/features/copilot/pageReferenceResolver.ts'
import { shouldSkipPreviewReview } from '../src/features/copilot/previewPolicy.ts'
import {
  buildGeneratedDraftFromSpecialistExecutions,
  buildSpecialistArtifactFromChat,
  buildSpecialistArtifactFromEnvelope,
  buildSpecialistExecutionRunState,
  buildSpecialistExecutionsFromChat,
  buildSpecialistHandoffFromChat,
  buildSpecialistHandoffFromEnvelope,
  formatSpecialistArtifactMessage,
  formatSpecialistHandoffMessage,
} from '../src/features/copilot/specialistArtifacts.ts'
import { buildBookspaceChatContextBlock } from '../shared/copilotServiceProfile.ts'
import { createDefaultCopilotRuntimeConfig } from '../src/features/copilot/copilotRuntimeConfig.ts'
import { buildEpubImportPlan } from '../src/features/export/epubImportStructure.ts'

const OUTPUT_DIR = path.resolve('reports/qa')
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'functional.latest.json')
const OUTPUT_MD = path.join(OUTPUT_DIR, 'functional.latest.md')

const failures = []
const warnings = []
const checks = []

function check(ok, name, details) {
  checks.push({ name, ok, details })
  if (!ok) failures.push(`${name}: ${details}`)
}

function warn(ok, name, details) {
  if (!ok) warnings.push(`${name}: ${details}`)
}

function sampleMetadata() {
  return {
    title: 'QA Functional Sample',
    subtitle: 'Roundtrip',
    authors: [{ id: 'qa-author', name: 'QA Bot', role: 'author' }],
    language: 'ko',
    publisher: 'QA',
    isbn: '',
    link: '',
    description: 'functional qa sample',
  }
}

function sampleChapters() {
  return [
    {
      id: 'chapter-1',
      title: 'Chapter 1',
      content: {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '제목' }] },
          { type: 'paragraph', content: [{ type: 'text', text: '기능 QA 본문 텍스트입니다.' }] },
          {
            type: 'bulletList',
            content: [
              { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '항목 1' }] }] },
              { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '항목 2' }] }] },
            ],
          },
        ],
      },
      order: 0,
      fileName: 'chapter-1.xhtml',
      chapterType: 'chapter',
      parentId: null,
    },
  ]
}

function validateProjectShape(project) {
  check(typeof project === 'object' && project !== null, 'project/shape', 'project payload should be object')
  check(typeof project.version === 'string', 'project/version', 'project.version should be string')
  check(project.metadata?.title === '새 원고', 'project/metadata-title', `expected 새 원고, got ${project.metadata?.title}`)
  check(Array.isArray(project.chapters), 'project/chapters-array', 'project.chapters should be array')
}

async function runQuickStartCheck() {
  let seq = 0
  const template = createQuickStartTemplate(() => `id-${++seq}`)
  const chapters = template.chapters
  const part = chapters.find((c) => c.chapterType === 'part')
  const prologue = chapters.find((c) => c.chapterType === 'front')
  const epilogue = chapters.find((c) => c.chapterType === 'back')
  const chapterChildren = chapters.filter((c) => c.chapterType === 'chapter' && c.parentId === part?.id)

  check(chapters.length >= 5, 'quick-start/chapters', `expected >=5 chapters, got ${chapters.length}`)
  check(Boolean(part), 'quick-start/part', 'part chapter missing')
  check(chapterChildren.length >= 2, 'quick-start/parent-link', `expected >=2 child chapters under part, got ${chapterChildren.length}`)
  check(prologue?.chapterKind === 'prologue', 'quick-start/prologue-kind', `expected prologue kind, got ${prologue?.chapterKind ?? 'null'}`)
  check(epilogue?.chapterKind === 'epilogue', 'quick-start/epilogue-kind', `expected epilogue kind, got ${epilogue?.chapterKind ?? 'null'}`)
  check(
    chapterChildren.every((chapter) => chapter.chapterKind === 'chapter'),
    'quick-start/chapter-kind',
    `expected body chapters to default to chapter kind, got ${chapterChildren.map((chapter) => `${chapter.id}:${chapter.chapterKind ?? 'null'}`).join(', ')}`,
  )

  const project = {
    version: '0.1.0',
    metadata: template.metadata,
    chapters: template.chapters,
    designSettings: { theme: 'novel' },
  }
  validateProjectShape(project)
}

async function runDocxStructureCheck() {
  const blob = await exportDocx(sampleChapters(), sampleMetadata())
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  const documentXml = await zip.file('word/document.xml')?.async('string')
  const coreXml = await zip.file('docProps/core.xml')?.async('string')

  check(Boolean(documentXml), 'docx/document-xml', 'word/document.xml missing')
  check(Boolean(coreXml), 'docx/core-xml', 'docProps/core.xml missing')
  check(String(documentXml ?? '').includes('기능 QA 본문 텍스트입니다.'), 'docx/body-text', 'expected body text in document.xml')
  check(String(coreXml ?? '').includes('QA Functional Sample'), 'docx/core-title', 'expected title in core.xml')
}

function runFilePolicyCheck() {
  check(PROJECT_FILE_EXTENSION === 'bksp', 'policy/project-extension', `expected bksp, got ${PROJECT_FILE_EXTENSION}`)
  check(PROJECT_FILE_EXTENSIONS.length === 1, 'policy/single-project-extension', `expected 1 extension, got ${PROJECT_FILE_EXTENSIONS.length}`)
  check(
    IMPORT_FILE_EXTENSIONS.includes('epub') &&
      IMPORT_FILE_EXTENSIONS.includes('docx') &&
      IMPORT_FILE_EXTENSIONS.includes('md') &&
      IMPORT_FILE_EXTENSIONS.includes('markdown'),
    'policy/import-extensions',
    'epub/docx/md/markdown import extension set mismatch',
  )
  warn(!IMPORT_FILE_EXTENSIONS.includes('bksp'), 'policy/import-excludes-project', 'import set should not include bksp')
}

function runEpubStructuredImportPlanCheck() {
  const orderedPaths = [
    'OEBPS/front-prologue.xhtml',
    'OEBPS/front-chapter-01a.xhtml',
    'OEBPS/front-chapter-01b.xhtml',
    'OEBPS/Section0001Q.xhtml',
    'OEBPS/Section0001.xhtml',
    'OEBPS/Section0002Q.xhtml',
    'OEBPS/Section0002.xhtml',
    'OEBPS/Section0003.xhtml',
    'OEBPS/colophon.xhtml',
  ]
  const titleByPath = new Map([
    ['OEBPS/front-prologue.xhtml', '프롤로그'],
    ['OEBPS/front-chapter-01a.xhtml', '01. 사라진 일상, 멈춰버린 심장'],
    ['OEBPS/front-chapter-01b.xhtml', '챕터 01'],
    ['OEBPS/Section0001Q.xhtml', '멈춰 선 심장, 다시 흐르는 우주. (intro)'],
    ['OEBPS/Section0001.xhtml', '멈춰 선 심장, 다시 흐르는 우주.'],
    ['OEBPS/Section0002Q.xhtml', '살기 위해 고독해지기로 했다 (intro)'],
    ['OEBPS/Section0002.xhtml', '살기 위해 고독해지기로 했다'],
    ['OEBPS/Section0003.xhtml', '살기 위해 문을 열었던 남자, 100번째 기적이 되다.'],
    ['OEBPS/colophon.xhtml', 'Colophon'],
  ])

  const plan = buildEpubImportPlan({
    packageInfo: {
      metadata: {
        title: '내 인생의 마지막 날은 여러 번 왔다',
        authors: [{ id: 'author-1', name: '강문영', role: 'author' }],
        language: 'ko',
      },
      tocSource: 'ncx',
      spinePaths: orderedPaths,
      tocTree: [
        {
          title: '01. 사라진 일상, 멈춰버린 심장',
          path: 'OEBPS/front-chapter-01a.xhtml',
          children: [
            { title: '멈춰 선 심장, 다시 흐르는 우주.', path: 'OEBPS/Section0001.xhtml', children: [] },
            { title: '살기 위해 고독해지기로 했다', path: 'OEBPS/Section0002.xhtml', children: [] },
            { title: '살기 위해 문을 열었던 남자, 100번째 기적이 되다.', path: 'OEBPS/Section0003.xhtml', children: [] },
          ],
        },
      ],
    },
    orderedPaths,
    titleByPath,
  })

  const part = plan.items.find((item) => item.chapterType === 'part')
  const children = plan.items.filter((item) => item.chapterType === 'chapter')
  const prologue = plan.items.find((item) => item.chapterType === 'front')
  const colophon = plan.items.find((item) => item.chapterType === 'back')

  check(Boolean(prologue), 'epub-import/prologue-detected', 'expected front matter prologue item')
  check(Boolean(part), 'epub-import/part-detected', 'expected part item from TOC parent')
  check(children.length === 3, 'epub-import/chapter-count', `expected 3 chapters, got ${children.length}`)
  check(
    children.every((item) => item.parentKey === part?.key),
    'epub-import/parent-links',
    `expected all chapters under part, got ${children.map((item) => `${item.title}:${item.parentKey ?? 'null'}`).join(', ')}`,
  )
  check(
    children[0]?.sourcePaths.includes('OEBPS/Section0001Q.xhtml') &&
      children[0]?.sourcePaths.includes('OEBPS/Section0001.xhtml'),
    'epub-import/intro-merged-into-chapter',
    `expected chapter 1 to include intro path, got ${JSON.stringify(children[0]?.sourcePaths ?? [])}`,
  )
  check(
    colophon?.chapterKind === 'colophon',
    'epub-import/colophon-back-matter',
    `expected colophon back matter, got ${colophon?.chapterKind ?? 'null'}`,
  )
  check(
    plan.metadata.title === '내 인생의 마지막 날은 여러 번 왔다' &&
      plan.metadata.authors?.[0]?.name === '강문영',
    'epub-import/metadata-preserved',
    `unexpected metadata: ${JSON.stringify(plan.metadata)}`,
  )
}

function runEpubStructuredImportMixedTopLevelCheck() {
  const orderedPaths = [
    'OEBPS/front-prologue.xhtml',
    'OEBPS/part-1.xhtml',
    'OEBPS/chapter-1.xhtml',
    'OEBPS/chapter-2.xhtml',
    'OEBPS/epilogue.xhtml',
  ]
  const titleByPath = new Map([
    ['OEBPS/front-prologue.xhtml', '프롤로그'],
    ['OEBPS/part-1.xhtml', 'Part 1'],
    ['OEBPS/chapter-1.xhtml', '1장'],
    ['OEBPS/chapter-2.xhtml', '2장'],
    ['OEBPS/epilogue.xhtml', '에필로그'],
  ])

  const plan = buildEpubImportPlan({
    packageInfo: {
      metadata: {
        title: 'Mixed TOC Book',
        authors: [{ id: 'author-1', name: 'QA Bot', role: 'author' }],
        language: 'ko',
        identifier: 'urn:uuid:3A9EBEC5-4FF3-4455-BE5F-22164D8B615E',
        identifierType: 'uuid',
        isbn: '',
      },
      tocSource: 'ncx',
      spinePaths: orderedPaths,
      tocTree: [
        { title: '프롤로그', path: 'OEBPS/front-prologue.xhtml', children: [] },
        {
          title: 'Part 1',
          path: 'OEBPS/part-1.xhtml',
          children: [
            { title: '1장', path: 'OEBPS/chapter-1.xhtml', children: [] },
            { title: '2장', path: 'OEBPS/chapter-2.xhtml', children: [] },
          ],
        },
        { title: '에필로그', path: 'OEBPS/epilogue.xhtml', children: [] },
      ],
    },
    orderedPaths,
    titleByPath,
  })

  const prologue = plan.items.find((item) => item.title === '프롤로그')
  const epilogue = plan.items.find((item) => item.title === '에필로그')
  const part = plan.items.find((item) => item.title === 'Part 1')

  check(
    prologue?.chapterType === 'front',
    'epub-import/mixed-top-level-prologue-front',
    `expected prologue to stay front matter, got ${prologue?.chapterType ?? 'null'}`,
  )
  check(
    epilogue?.chapterType === 'back',
    'epub-import/mixed-top-level-epilogue-back',
    `expected epilogue to stay back matter, got ${epilogue?.chapterType ?? 'null'}`,
  )
  check(
    part?.chapterType === 'part',
    'epub-import/mixed-top-level-part-preserved',
    `expected part to stay part, got ${part?.chapterType ?? 'null'}`,
  )
  check(
    plan.metadata.identifierType === 'uuid' && plan.metadata.isbn === '',
    'epub-import/identifier-type-uuid',
    `expected uuid identifier without isbn, got ${JSON.stringify({
      identifierType: plan.metadata.identifierType,
      isbn: plan.metadata.isbn,
    })}`,
  )
}

function runAiCommandSchemaCheck() {
  const validEnvelope = {
    schemaVersion: AI_COMMAND_SCHEMA_VERSION,
    requestId: 'req-qa-ai-schema-1',
    idempotencyKey: 'copilot-qa-ai-schema-1',
    intent: 'rewrite_selection',
    baseProjectRevision: 'rev_0001',
    generatedAt: '2026-02-22T12:34:56.000Z',
    summary: 'rewrite one paragraph',
    warnings: [],
    commands: [
      {
        type: 'rewrite_selection',
        target: {
          chapterId: 'chapter-1',
          range: {
            from: 10,
            to: 20,
          },
        },
        payload: {
          text: 'updated paragraph text',
          tone: 'formal',
        },
        preview: true,
      },
    ],
    meta: {
      modelId: 'gpt-5',
    },
  }

  const validResult = validateAiCommandEnvelope(validEnvelope)
  check(validResult.ok === true, 'ai-schema/valid-envelope', 'expected valid envelope to pass')
  check(validResult.code === 'OK', 'ai-schema/valid-envelope-code', `expected OK, got ${validResult.code}`)
  check(validResult.normalized?.commands.length === 1, 'ai-schema/commands-count', `expected 1 command, got ${validResult.normalized?.commands.length ?? 0}`)

  const missingCommands = validateAiCommandEnvelope({
    ...validEnvelope,
    commands: [],
  })
  check(missingCommands.ok === false, 'ai-schema/reject-empty-commands', 'expected empty commands to fail')

  const tooManyCommands = validateAiCommandEnvelope({
    ...validEnvelope,
    commands: new Array(MAX_COMMANDS_PER_REQUEST + 1).fill(validEnvelope.commands[0]),
  })
  check(tooManyCommands.ok === false, 'ai-schema/reject-too-many-commands', 'expected too many commands to fail')

  const legacyEnvelope = validateAiCommandEnvelope({
    requestId: 'legacy-req-1',
    intent: 'rewrite_selection',
    generatedAt: '2026-02-22T12:34:56.000Z',
    summary: 'legacy request',
    warnings: [],
    commands: [
      {
        type: 'rewrite_selection',
        target: {
          chapterId: 'chapter-1',
          range: {
            from: 1,
            to: 5,
          },
        },
        payload: {
          text: 'legacy text',
        },
      },
    ],
  })
  check(legacyEnvelope.ok === true, 'ai-schema/legacy-accepted', 'expected legacy 1.0 request to pass')
  check(legacyEnvelope.compatibility.legacySchema === true, 'ai-schema/legacy-flag', 'expected legacySchema compatibility flag')
  check(legacyEnvelope.compatibility.generatedIdempotencyKey === true, 'ai-schema/legacy-idempotency', 'expected auto idempotency key for legacy')
  check(legacyEnvelope.previewOnly === true, 'ai-schema/legacy-preview-only', 'expected previewOnly when baseProjectRevision is missing')
}

function runRollingContextBlockCheck() {
  const block = buildBookspaceChatContextBlock({
    scope: 'chapter',
    chapterId: 'chapter-1',
    projectTitle: '북스페이스 QA',
    chapterCount: 12,
    activePageTitle: '프롤로그',
    activePageType: 'chapter',
    activePageSummary: 'headings=도입, paragraphs=3',
    threadGoal: '프롤로그 톤 조정',
    threadSummary: '최근 specialist 결과를 반영해 프롤로그를 다듬는 중입니다.',
    rollingSummary: '프롤로그 문체 조정 / research note 반영 / publishing checklist 유지',
    contextPins: ['tone=서늘함', 'recent specialist=researcher'],
    sessionMemory: ['tone=서늘함', 'last_approved=append_text'],
    bookMemory: ['책: 항구의 밤', 'tone=서늘함'],
    recentArtifacts: ['Researcher: 조사 결과 정리', 'Publishing Checker: 출간 체크리스트'],
    contextStatus: 'watch',
  })

  check(block.includes('[Stage:SessionMemory]'), 'copilot/context-block-session-memory', 'expected session memory stage')
  check(block.includes('[Stage:BookMemory]'), 'copilot/context-block-book-memory', 'expected book memory stage')
  check(block.includes('[Stage:RecentArtifacts]'), 'copilot/context-block-recent-artifacts', 'expected recent artifacts stage')
  check(block.includes('RollingSummary='), 'copilot/context-block-rolling-summary', 'expected rolling summary line')
}

async function runRuntimeStatusCheck() {
  const defaultConfig = createDefaultCopilotRuntimeConfig()
  check(defaultConfig.mode === 'appserver', 'copilot/runtime-default-mode', `expected appserver default, got ${defaultConfig.mode}`)
  const agentUtilsSource = await fs.readFile(
    path.resolve('src/features/copilot/rightPaneAgentUtils.ts'),
    'utf-8',
  )
  check(
    agentUtilsSource.includes('export function buildRuntimeStatus'),
    'copilot/runtime-status-helper',
    'expected buildRuntimeStatus helper in rightPaneAgentUtils.ts',
  )
  check(
    agentUtilsSource.includes('Direct · OpenAI') && agentUtilsSource.includes('Codex App Server'),
    'copilot/runtime-status-provider-labels',
    'expected provider labels for direct/appserver runtime',
  )
  check(
    agentUtilsSource.includes('새 스레드를 시작하거나 대화를 압축한 뒤 다시 시도하세요.'),
    'copilot/runtime-status-budget-guidance',
    'expected budget recovery guidance in runtime helper',
  )
}

async function runGuardrailStatusCheck() {
  const agentUtilsSource = await fs.readFile(
    path.resolve('src/features/copilot/rightPaneAgentUtils.ts'),
    'utf-8',
  )
  const actionsSource = await fs.readFile(
    path.resolve('src/features/copilot/rightPaneActions.ts'),
    'utf-8',
  )
  const inspectorSource = await fs.readFile(
    path.resolve('src/features/copilot/CopilotInspector.tsx'),
    'utf-8',
  )

  check(
    agentUtilsSource.includes('export function buildGuardrailStatus'),
    'copilot/guardrail-helper',
    'expected buildGuardrailStatus helper in rightPaneAgentUtils.ts',
  )
  check(
    actionsSource.includes('lastGuardrailStatus: buildGuardrailStatus'),
    'copilot/guardrail-state-wired',
    'expected preview gate flow to persist guardrail status',
  )
  check(
    !inspectorSource.includes('data-testid="copilot-guardrail-status"'),
    'copilot/guardrail-inspector-card-hidden',
    'expected paid guardrail status to stay hidden from default Copilot UI',
  )
}

async function runAgentRunLifecycleCheck() {
  const agentUtilsSource = await fs.readFile(
    path.resolve('src/features/copilot/rightPaneAgentUtils.ts'),
    'utf-8',
  )
  const actionsSource = await fs.readFile(
    path.resolve('src/features/copilot/rightPaneActions.ts'),
    'utf-8',
  )

  check(
    agentUtilsSource.includes('export function startAgentRun') &&
      agentUtilsSource.includes('export function updateAgentRun') &&
      agentUtilsSource.includes('export function closeAgentRun'),
    'copilot/agent-run-helpers',
    'expected agent run lifecycle helpers in rightPaneAgentUtils.ts',
  )
  check(
    actionsSource.includes('currentRun: updateAgentRun(thread.currentRun') &&
      actionsSource.includes('recentRuns: prependRecentItem(thread.recentRuns, completedChatRun)') &&
      actionsSource.includes('const shouldKeepRunOpen = allWarnings.length > 0') &&
      actionsSource.includes('currentRun: shouldKeepRunOpen ? nextRun : null'),
    'copilot/agent-run-wiring',
    'expected currentRun/recentRuns lifecycle wiring in rightPaneActions.ts',
  )
}

function runRenameSlotParserCheck() {
  const koParsed = parseRenameChapterDraftFromPrompt('3장 제목을 바다를 건너는 밤으로 바꿔줘')
  check(
    koParsed.title === '바다를 건너는 밤',
    'copilot/rename-slot-ko',
    `expected 바다를 건너는 밤, got ${koParsed.title}`,
  )

  const enParsed = parseRenameChapterDraftFromPrompt('rename chapter to opening')
  check(
    enParsed.title === 'opening',
    'copilot/rename-slot-en',
    `expected opening, got ${enParsed.title}`,
  )

  const quotedParsed = parseRenameChapterDraftFromPrompt('"인사말" 제목을 "여는 글"로 바꿔줘')
  check(
    quotedParsed.sourceTitle === '인사말' && quotedParsed.title === '여는 글',
    'copilot/rename-slot-quoted-old-new',
    `expected source=인사말 title=여는 글, got ${JSON.stringify(quotedParsed)}`,
  )

  const namedParsed = parseRenameChapterDraftFromPrompt('인사말 제목을 여는 글로 바꿔줘')
  check(
    namedParsed.sourceTitle === '인사말' && namedParsed.title === '여는 글',
    'copilot/rename-slot-named-target',
    `expected source=인사말 title=여는 글, got ${JSON.stringify(namedParsed)}`,
  )

  const chapterAliasParsed = parseRenameChapterDraftFromPrompt('챕터1 제목 랜덤뽑기로 바꿔줘')
  check(
    chapterAliasParsed.title === '랜덤뽑기',
    'copilot/rename-slot-chapter-alias',
    `expected 랜덤뽑기, got ${chapterAliasParsed.title}`,
  )
}

function runCommandGroundingParserCheck() {
  const moveTail = parseMoveChapterDraftFromPrompt('챕터1을 맨 뒤로 옮겨줘')
  check(
    moveTail.toIndex === 999,
    'copilot/move-slot-tail',
    `expected tail move toIndex=999, got ${moveTail.toIndex}`,
  )

  const moveAfter = parseMoveChapterDraftFromPrompt('챕터1을 2장 뒤로 옮겨줘')
  check(
    moveAfter.toIndex === 2,
    'copilot/move-slot-after-reference',
    `expected toIndex=2 for after second chapter, got ${moveAfter.toIndex}`,
  )

  const setPrologue = parseSetChapterTypeDraftFromPrompt('인사말을 프롤로그로 바꿔줘')
  check(
    setPrologue.chapterType === 'front' && setPrologue.chapterKind === 'prologue',
    'copilot/set-type-slot-prologue',
    `expected front/prologue, got ${setPrologue.chapterType}/${setPrologue.chapterKind ?? 'null'}`,
  )

  const setPart = parseSetChapterTypeDraftFromPrompt('1장을 파트로 바꿔줘')
  check(
    setPart.chapterType === 'part' && setPart.chapterKind === 'part',
    'copilot/set-type-slot-part',
    `expected part/part, got ${setPart.chapterType}/${setPart.chapterKind ?? 'null'}`,
  )

  const essayTheme = parseApplyThemeDraftFromPrompt('에세이 테마로 바꿔줘')
  check(
    essayTheme.theme === 'essay',
    'copilot/apply-theme-slot-essay',
    `expected essay theme, got ${essayTheme.theme}`,
  )

  const bookTitle = parseUpdateBookInfoDraftFromPrompt('책 제목을 "새 책"으로 바꿔줘')
  check(
    bookTitle.title === '새 책',
    'copilot/book-info-slot-title',
    `expected 새 책 title, got ${bookTitle.title ?? 'null'}`,
  )
  check(
    bookTitle.subtitle === undefined,
    'copilot/book-info-slot-title-does-not-fill-subtitle',
    `expected subtitle to stay undefined, got ${bookTitle.subtitle ?? 'null'}`,
  )

  const publisher = parseUpdateBookInfoDraftFromPrompt('출판사를 "민음사"로 바꿔줘')
  check(
    publisher.publisher === '민음사',
    'copilot/book-info-slot-publisher',
    `expected 민음사 publisher, got ${publisher.publisher ?? 'null'}`,
  )

  const author = parseUpdateBookInfoDraftFromPrompt('저자를 "홍길동"으로 바꿔줘')
  check(
    author.authors?.[0]?.name === '홍길동',
    'copilot/book-info-slot-author',
    `expected author 홍길동, got ${JSON.stringify(author.authors ?? null)}`,
  )

  const exportDocx = parseExportProjectDraftFromPrompt('폰트 포함해서 DOCX로 내보내줘')
  check(
    exportDocx.format === 'docx' && exportDocx.embedFonts === true,
    'copilot/export-slot-docx-embed-fonts',
    `expected docx + embedFonts=true, got ${JSON.stringify(exportDocx)}`,
  )

  const structuredCreate = parseCreateChapterDraftFromPrompt(
    'Part 1 안에 챕터 3 페이지를 새로 만들고 제목은 바다를 건너는 밤으로 해줘',
  )
  check(
    structuredCreate.chapterType === 'chapter' &&
      structuredCreate.title === '바다를 건너는 밤' &&
      structuredCreate.parentLabel === 'Part 1' &&
      structuredCreate.requestedOrdinal === 3 &&
      structuredCreate.requiresStructuredConfirmation === true,
    'copilot/create-slot-structured-parent-ordinal-title',
    `unexpected structured create draft: ${JSON.stringify(structuredCreate)}`,
  )

  const normalizedCreatePrompt = buildNormalizedCreateChapterPrompt(structuredCreate)
  check(
    normalizedCreatePrompt.includes('부모 페이지: Part 1') &&
      normalizedCreatePrompt.includes('원하는 순서: 3') &&
      normalizedCreatePrompt.includes('제목: 바다를 건너는 밤'),
    'copilot/create-slot-normalized-structured-fields',
    `unexpected normalized create prompt: ${normalizedCreatePrompt}`,
  )

  const placement = resolveCreateChapterPlacement({
    draft: structuredCreate,
    pages: [
      { id: 'part-1', title: 'Part 1', order: 0, parentId: null, chapterType: 'part', chapterKind: 'part' },
      { id: 'chapter-1', title: 'Chapter 1', order: 1, parentId: 'part-1', chapterType: 'chapter', chapterKind: 'chapter' },
      { id: 'chapter-2', title: 'Chapter 2', order: 2, parentId: 'part-1', chapterType: 'chapter', chapterKind: 'chapter' },
    ],
    fallbackAfterChapterId: 'chapter-2',
  })
  check(
    placement.parentChapterId === 'part-1' && placement.afterChapterId === 'chapter-2',
    'copilot/create-slot-placement-under-parent',
    `unexpected create placement: ${JSON.stringify(placement)}`,
  )
}

async function runCommandGroundingIntentRoutingCheck() {
  const intentRouterSource = await fs.readFile(
    path.resolve('src/features/copilot/intentRouter.ts'),
    'utf-8',
  )
  const capabilityRegistry = JSON.parse(
    await fs.readFile(path.resolve('shared/copilotCapabilityRegistry.v1.json'), 'utf-8'),
  )

  check(
    intentRouterSource.includes('챕터\\s*\\d+') &&
      intentRouterSource.includes('.+?\\s*(?:페이지|챕터)?\\s*(?:제목|이름)'),
    'copilot/intent-rename-heuristic-expanded',
    'expected direct rename heuristic to recognize chapter aliases and named-page title prompts',
  )

  const rulesByIntent = new Map()
  for (const rule of capabilityRegistry.capabilities ?? []) {
    const entries = rulesByIntent.get(rule.intent) ?? []
    entries.push(rule)
    rulesByIntent.set(rule.intent, entries)
  }

  const flattenedKeywords = (intent) =>
    (rulesByIntent.get(intent) ?? []).flatMap((rule) => rule.keywordsAny ?? [])

  const moveKeywords = flattenedKeywords('move_chapter')
  check(
    moveKeywords.includes('옮겨') && moveKeywords.includes('뒤로'),
    'copilot/intent-move-keywords-expanded',
    `expected move keywords to include 옮겨/뒤로, got ${JSON.stringify(moveKeywords)}`,
  )

  const typeKeywords = flattenedKeywords('set_chapter_type')
  check(
    typeKeywords.includes('프롤로그로') &&
      typeKeywords.includes('에필로그로') &&
      typeKeywords.includes('간지로'),
    'copilot/intent-set-type-keywords-expanded',
    `expected type keywords to include prologue/epilogue/divider phrases, got ${JSON.stringify(typeKeywords)}`,
  )

  const bookInfoKeywords = flattenedKeywords('update_book_info')
  check(
    bookInfoKeywords.includes('부제') &&
      bookInfoKeywords.includes('publisher') &&
      bookInfoKeywords.includes('책 소개'),
    'copilot/intent-book-info-keywords-expanded',
    `expected book-info keywords to include subtitle/publisher/description phrases, got ${JSON.stringify(bookInfoKeywords)}`,
  )

  const exportKeywords = flattenedKeywords('export_project')
  check(
    exportKeywords.includes('docx') &&
      exportKeywords.includes('워드') &&
      exportKeywords.includes('epub'),
    'copilot/intent-export-keywords-expanded',
    `expected export keywords to include docx/워드/epub, got ${JSON.stringify(exportKeywords)}`,
  )
}

function runMissingPageProposalCheck() {
  const proposal = buildMissingPageProposal({
    prompt: '3장 제목을 바다를 건너는 밤으로 바꿔줘',
    intent: 'rename_chapter',
    missingLabel: '3장',
    kind: 'chapter',
  })
  check(Boolean(proposal), 'copilot/missing-page-proposal-exists', 'expected proposal object')
  check(
    proposal?.kind === 'create_missing_page_then_retry',
    'copilot/missing-page-proposal-kind',
    `unexpected proposal kind: ${proposal?.kind ?? 'null'}`,
  )
  check(
    proposal?.suggestedTitle === '바다를 건너는 밤',
    'copilot/missing-page-proposal-title',
    `expected 바다를 건너는 밤, got ${proposal?.suggestedTitle ?? 'null'}`,
  )
  check(
    String(proposal?.followUpPrompt ?? '').includes('새로 만들어줘'),
    'copilot/missing-page-proposal-followup',
    `unexpected followUpPrompt: ${proposal?.followUpPrompt ?? 'null'}`,
  )

  const deleteProposal = buildMissingPageProposal({
    prompt: '3장을 삭제해줘',
    intent: 'delete_chapter',
    missingLabel: '3장',
    kind: 'chapter',
  })
  check(
    deleteProposal === null,
    'copilot/missing-page-delete-proposal-null',
    `expected null for delete missing-target proposal, got ${deleteProposal?.kind ?? 'non-null'}`,
  )

  const deleteSuggestion = buildMissingPageSuggestion({
    prompt: '3장을 삭제해줘',
    intent: 'delete_chapter',
    missingLabel: '3장',
    t: (key) => String(key),
  })
  check(
    !String(deleteSuggestion).includes('새로 만들어'),
    'copilot/missing-page-delete-suggestion-no-create',
    `delete missing-target suggestion should not recommend creation: ${deleteSuggestion}`,
  )
}

function createEnvelope({ intent, command, summary = 'qa summary' }) {
  return {
    schemaVersion: AI_COMMAND_SCHEMA_VERSION,
    requestId: `req-${intent}-qa`,
    idempotencyKey: `qa-${intent}`,
    intent,
    baseProjectRevision: 'rev_qa_0001',
    generatedAt: '2026-03-10T12:34:56.000Z',
    summary,
    warnings: [],
    commands: [{ ...command, preview: true }],
  }
}

function runPreviewPolicyCheck() {
  const samePageAppend = createEnvelope({
    intent: 'append_text',
    command: {
      type: 'append_text',
      target: {
        chapterId: 'chapter-1',
        position: 'current_block_after',
      },
      payload: {
        text: 'same page append',
      },
    },
  })
  check(
    shouldSkipPreviewReview({
      envelope: samePageAppend,
      riskLevel: 'low',
      activeChapterId: 'chapter-1',
    }) === true,
    'copilot/preview-policy-same-page-append',
    'same-page append_text should skip preview review',
  )

  const crossPageAppend = createEnvelope({
    intent: 'append_text',
    command: {
      type: 'append_text',
      target: {
        chapterId: 'chapter-2',
        position: 'current_block_after',
      },
      payload: {
        text: 'cross page append',
      },
    },
  })
  check(
    shouldSkipPreviewReview({
      envelope: crossPageAppend,
      riskLevel: 'low',
      activeChapterId: 'chapter-1',
    }) === false,
    'copilot/preview-policy-cross-page-append',
    'cross-page append_text should require review',
  )

  const samePageRename = createEnvelope({
    intent: 'rename_chapter',
    command: {
      type: 'rename_chapter',
      target: {
        chapterId: 'chapter-1',
      },
      payload: {
        title: '새 제목',
      },
    },
  })
  check(
    shouldSkipPreviewReview({
      envelope: samePageRename,
      riskLevel: 'low',
      activeChapterId: 'chapter-1',
    }) === true,
    'copilot/preview-policy-same-page-rename',
    'same-page rename_chapter should skip preview review',
  )

  const crossPageRename = createEnvelope({
    intent: 'rename_chapter',
    command: {
      type: 'rename_chapter',
      target: {
        chapterId: 'chapter-3',
      },
      payload: {
        title: '다른 페이지 제목',
      },
    },
  })
  check(
    shouldSkipPreviewReview({
      envelope: crossPageRename,
      riskLevel: 'low',
      activeChapterId: 'chapter-1',
    }) === false,
    'copilot/preview-policy-cross-page-rename',
    'cross-page rename_chapter should require review',
  )
}

function runPageReferenceResolverCheck() {
  const structure = {
    activeChapterId: 'chapter-2',
    pages: [
      {
        id: 'front-1',
        title: '프롤로그',
        order: 0,
        parentId: null,
        chapterType: 'front',
        chapterKind: 'prologue',
      },
      {
        id: 'part-1',
        title: 'Part 1',
        order: 1,
        parentId: null,
        chapterType: 'part',
        chapterKind: undefined,
      },
      {
        id: 'chapter-1',
        title: 'Chapter 1',
        order: 2,
        parentId: 'part-1',
        chapterType: 'chapter',
        chapterKind: undefined,
      },
      {
        id: 'chapter-2',
        title: 'Chapter 2',
        order: 3,
        parentId: 'part-1',
        chapterType: 'chapter',
        chapterKind: undefined,
      },
      {
        id: 'back-1',
        title: '에필로그',
        order: 4,
        parentId: null,
        chapterType: 'back',
        chapterKind: 'epilogue',
      },
    ],
  }

  const prologueTarget = resolvePromptPageReference('프롤로그에 글 써줘', structure)
  check(
    prologueTarget.targetChapterId === 'front-1' && prologueTarget.kind === 'prologue',
    'copilot/page-reference-prologue',
    `expected front-1/prologue, got ${prologueTarget.targetChapterId ?? 'null'}/${prologueTarget.kind ?? 'null'}`,
  )

  const frontOnlyStructure = {
    activeChapterId: 'front-1',
    pages: [
      {
        id: 'front-1',
        title: '서문',
        order: 0,
        parentId: null,
        chapterType: 'front',
        chapterKind: undefined,
      },
      {
        id: 'back-1',
        title: '후기',
        order: 1,
        parentId: null,
        chapterType: 'back',
        chapterKind: undefined,
      },
    ],
  }
  const prologueFallbackTarget = resolvePromptPageReference('프롤로그를 다듬어줘', frontOnlyStructure)
  check(
    prologueFallbackTarget.targetChapterId === 'front-1' && prologueFallbackTarget.kind === 'prologue',
    'copilot/page-reference-prologue-front-fallback',
    `expected front-1/prologue fallback, got ${prologueFallbackTarget.targetChapterId ?? 'null'}/${prologueFallbackTarget.kind ?? 'null'}`,
  )
  const epilogueFallbackTarget = resolvePromptPageReference('에필로그를 정리해줘', frontOnlyStructure)
  check(
    epilogueFallbackTarget.targetChapterId === 'back-1' && epilogueFallbackTarget.kind === 'epilogue',
    'copilot/page-reference-epilogue-back-fallback',
    `expected back-1/epilogue fallback, got ${epilogueFallbackTarget.targetChapterId ?? 'null'}/${epilogueFallbackTarget.kind ?? 'null'}`,
  )

  const ordinalCases = [
    {
      name: 'copilot/page-reference-existing-first',
      prompt: '1장 제목을 바꿔줘',
      expectedTargetChapterId: 'chapter-1',
      expectedMissingLabel: null,
    },
    {
      name: 'copilot/page-reference-existing-second-particle',
      prompt: '2장을 삭제해줘',
      expectedTargetChapterId: 'chapter-2',
      expectedMissingLabel: null,
    },
    {
      name: 'copilot/page-reference-existing-chapter-alias-tight',
      prompt: '챕터1 제목 랜덤뽑기로 바꿔줘',
      expectedTargetChapterId: 'chapter-1',
      expectedMissingLabel: null,
    },
    {
      name: 'copilot/page-reference-existing-chapter-alias-spaced',
      prompt: '챕터 1 제목을 랜덤뽑기로 바꿔줘',
      expectedTargetChapterId: 'chapter-1',
      expectedMissingLabel: null,
    },
    {
      name: 'copilot/page-reference-missing-third',
      prompt: '3장 제목을 바다를 건너는 밤으로 바꿔줘',
      expectedTargetChapterId: null,
      expectedMissingLabel: '3장',
    },
    {
      name: 'copilot/page-reference-missing-delete-target',
      prompt: '3장을 삭제해줘',
      expectedTargetChapterId: null,
      expectedMissingLabel: '3장',
    },
  ]

  ordinalCases.forEach((testCase) => {
    const resolved = resolvePromptPageReference(testCase.prompt, structure)
    check(
      resolved.targetChapterId === testCase.expectedTargetChapterId &&
        resolved.missingLabel === testCase.expectedMissingLabel,
      testCase.name,
      `prompt=${testCase.prompt} expected target=${testCase.expectedTargetChapterId ?? 'null'} missing=${testCase.expectedMissingLabel ?? 'null'}, got target=${resolved.targetChapterId ?? 'null'} missing=${resolved.missingLabel ?? 'null'}`,
    )
  })

  const namedStructure = {
    activeChapterId: 'chapter-1',
    pages: [
      {
        id: 'front-1',
        title: '인사말',
        order: 0,
        parentId: null,
        chapterType: 'front',
        chapterKind: undefined,
      },
      {
        id: 'chapter-1',
        title: '1장',
        order: 1,
        parentId: null,
        chapterType: 'chapter',
        chapterKind: undefined,
      },
    ],
  }
  const namedTarget = resolvePromptPageReference('인사말 제목을 여는 글로 바꿔줘', namedStructure)
  check(
    namedTarget.targetChapterId === 'front-1' && namedTarget.missingLabel === null,
    'copilot/page-reference-existing-named-target',
    `expected front-1 target for named page rename, got ${namedTarget.targetChapterId ?? 'null'}`,
  )

  const quotedNamedTarget = resolvePromptPageReference('"인사말" 제목을 "여는 글"로 바꿔줘', namedStructure)
  check(
    quotedNamedTarget.targetChapterId === 'front-1' && quotedNamedTarget.missingLabel === null,
    'copilot/page-reference-existing-quoted-named-target',
    `expected front-1 target for quoted named page rename, got ${quotedNamedTarget.targetChapterId ?? 'null'}`,
  )

  const namedAppendTarget = resolvePromptPageReference('인사말에 한 문단 추가해줘', namedStructure)
  check(
    namedAppendTarget.targetChapterId === 'front-1' && namedAppendTarget.missingLabel === null,
    'copilot/page-reference-existing-named-append-target',
    `expected front-1 target for named page append, got ${namedAppendTarget.targetChapterId ?? 'null'}`,
  )

  const namedDeleteTarget = resolvePromptPageReference('인사말을 삭제해줘', namedStructure)
  check(
    namedDeleteTarget.targetChapterId === 'front-1' && namedDeleteTarget.missingLabel === null,
    'copilot/page-reference-existing-named-delete-target',
    `expected front-1 target for named page delete, got ${namedDeleteTarget.targetChapterId ?? 'null'}`,
  )

  const namedMoveTarget = resolvePromptPageReference('인사말을 뒤로 옮겨줘', namedStructure)
  check(
    namedMoveTarget.targetChapterId === 'front-1' && namedMoveTarget.missingLabel === null,
    'copilot/page-reference-existing-named-move-target',
    `expected front-1 target for named page move, got ${namedMoveTarget.targetChapterId ?? 'null'}`,
  )

  const previousPageTarget = resolvePromptPageReference('이전 페이지도 같이 봐줘', structure)
  check(
    previousPageTarget.targetChapterId === 'chapter-1' && previousPageTarget.missingLabel === null,
    'copilot/page-reference-previous-page',
    `expected previous page target chapter-1, got ${previousPageTarget.targetChapterId ?? 'null'}`,
  )

  const nextPageTarget = resolvePromptPageReference('다음 페이지 흐름도 봐줘', structure)
  check(
    nextPageTarget.targetChapterId === 'back-1' && nextPageTarget.missingLabel === null,
    'copilot/page-reference-next-page',
    `expected next page target back-1, got ${nextPageTarget.targetChapterId ?? 'null'}`,
  )

  const previousChapterTarget = resolvePromptPageReference('이전 장이랑 비교해줘', {
    ...structure,
    activeChapterId: 'chapter-2',
  })
  check(
    previousChapterTarget.targetChapterId === 'chapter-1' && previousChapterTarget.missingLabel === null,
    'copilot/page-reference-previous-chapter',
    `expected previous chapter target chapter-1, got ${previousChapterTarget.targetChapterId ?? 'null'}`,
  )

  const nextChapterTarget = resolvePromptPageReference('다음 장과도 비교해줘', {
    ...structure,
    activeChapterId: 'chapter-1',
  })
  check(
    nextChapterTarget.targetChapterId === 'chapter-2' && nextChapterTarget.missingLabel === null,
    'copilot/page-reference-next-chapter',
    `expected next chapter target chapter-2, got ${nextChapterTarget.targetChapterId ?? 'null'}`,
  )

  const missingNamedStructure = {
    activeChapterId: 'chapter-1',
    pages: [
      {
        id: 'chapter-1',
        title: '1장',
        order: 0,
        parentId: null,
        chapterType: 'chapter',
        chapterKind: undefined,
      },
    ],
  }
  const missingNamedTarget = resolvePromptPageReference('인사말 제목을 여는 글로 바꿔줘', missingNamedStructure)
  check(
    missingNamedTarget.targetChapterId === null && missingNamedTarget.missingLabel === '인사말' && missingNamedTarget.kind === 'title',
    'copilot/page-reference-missing-named-target',
    `expected missing named target 인사말/title, got ${JSON.stringify(missingNamedTarget)}`,
  )
}

function runPublishingArtifactCheck() {
  const envelope = {
    schemaVersion: AI_COMMAND_SCHEMA_VERSION,
    requestId: 'req-feedback-publishing-qa',
    idempotencyKey: 'qa-feedback-publishing',
    intent: 'feedback_report',
    baseProjectRevision: 'rev_qa_0002',
    generatedAt: '2026-03-10T13:00:00.000Z',
    summary: '출간 전 체크리스트를 정리했습니다.',
    warnings: [],
    commands: [
      {
        type: 'feedback_report',
        target: {
          chapterId: 'chapter-1',
        },
        payload: {
          items: [
            {
              issue: '메타데이터 기본값 확인',
              evidence: '제목, 저자, 언어를 점검해야 합니다.',
              suggestion: '책 정보 패널을 확인하세요.',
            },
          ],
        },
        preview: true,
      },
    ],
  }

  const artifact = buildSpecialistArtifactFromEnvelope({
    prompt: 'EPUB 내보내기 전에 체크리스트 점검해줘',
    envelope,
  })
  const handoff = buildSpecialistHandoffFromEnvelope({
    prompt: 'EPUB 내보내기 전에 체크리스트 점검해줘',
    envelope,
    leadSummary: '출간 준비 점검',
  })
  check(Boolean(artifact), 'copilot/publishing-artifact-exists', 'expected publishing artifact')
  check(Boolean(handoff), 'copilot/publishing-handoff-exists', 'expected publishing handoff')
  check(
    artifact?.specialist === 'publishing_checker' && artifact?.kind === 'publishing_checklist',
    'copilot/publishing-artifact-kind',
    `unexpected specialist artifact: ${artifact?.specialist ?? 'null'}/${artifact?.kind ?? 'null'}`,
  )
  check(
    handoff?.specialist === 'publishing_checker' && handoff?.artifactKinds.includes('publishing_checklist'),
    'copilot/publishing-handoff-kind',
    `unexpected handoff specialist/artifacts: ${handoff?.specialist ?? 'null'}/${handoff?.artifactKinds.join(',') ?? 'null'}`,
  )
  check(
    (artifact?.items.length ?? 0) > 0,
    'copilot/publishing-artifact-items',
    'expected publishing artifact items',
  )

  const artifactMessage = artifact ? formatSpecialistArtifactMessage(artifact) : ''
  check(
    artifactMessage.includes('Publishing Checker') && artifactMessage.includes('- [ ]'),
    'copilot/publishing-artifact-message',
    `unexpected artifact message: ${artifactMessage}`,
  )

  const handoffMessage = handoff ? formatSpecialistHandoffMessage(handoff) : ''
  check(
    handoffMessage.includes('Lead Agent -> Publishing Checker') &&
      handoffMessage.includes('project_export_readiness'),
    'copilot/publishing-handoff-message',
    `unexpected handoff message: ${handoffMessage}`,
  )
}

function runResearchArtifactCheck() {
  const replyText = [
    '- 1930년대 경성 항구는 화물선과 여객선이 함께 드나드는 혼합 공간이었습니다.',
    '- 부두 창고와 세관 주변의 소음, 석탄 냄새, 안개 낀 새벽 풍경이 자주 기록됩니다.',
    '- 당시 표지판과 방송 문구는 일본어와 조선어가 섞여 보였을 가능성이 큽니다.',
  ].join('\n')

  const artifact = buildSpecialistArtifactFromChat({
    prompt: '1930년대 경성 항구 분위기 자료를 조사해줘',
    replyText,
    createdAt: '2026-03-10T14:10:00.000Z',
  })
  const handoff = buildSpecialistHandoffFromChat({
    prompt: '1930년대 경성 항구 분위기 자료를 조사해줘',
    replyText,
    leadSummary: '배경 조사',
    createdAt: '2026-03-10T14:10:00.000Z',
  })

  check(Boolean(artifact), 'copilot/research-artifact-exists', 'expected research artifact')
  check(Boolean(handoff), 'copilot/research-handoff-exists', 'expected research handoff')
  check(
    artifact?.specialist === 'researcher' && artifact?.kind === 'research_note',
    'copilot/research-artifact-kind',
    `unexpected research artifact: ${artifact?.specialist ?? 'null'}/${artifact?.kind ?? 'null'}`,
  )
  check(
    handoff?.specialist === 'researcher' && handoff?.artifactKinds.includes('research_note'),
    'copilot/research-handoff-kind',
    `unexpected research handoff: ${handoff?.specialist ?? 'null'}/${handoff?.artifactKinds.join(',') ?? 'null'}`,
  )
  check(
    (artifact?.items.length ?? 0) >= 2,
    'copilot/research-artifact-items',
    'expected research artifact items',
  )

  const handoffMessage = handoff ? formatSpecialistHandoffMessage(handoff) : ''
  check(
    handoffMessage.includes('Lead Agent -> Researcher') &&
      handoffMessage.includes('research_reference_note'),
    'copilot/research-handoff-message',
    `unexpected research handoff message: ${handoffMessage}`,
  )
}

function runSpecialistHistoryCheck() {
  const handoffs = [
    {
      id: 'handoff-1',
      leadSummary: '배경 조사',
      specialist: 'researcher',
      reason: '자료 조사',
      status: 'completed',
      goal: '배경 자료 수집',
      scope: 'research_reference_note',
      createdAt: '2026-03-10T14:10:00.000Z',
      summary: 'research handoff',
      constraints: ['advisory_only'],
      artifactKinds: ['research_note'],
      recommendedNextAction: '초안 작성으로 이어가기',
    },
    {
      id: 'handoff-2',
      leadSummary: '출간 준비 점검',
      specialist: 'publishing_checker',
      reason: '출간 점검',
      status: 'completed',
      goal: '출간 준비 확인',
      scope: 'project_export_readiness',
      createdAt: '2026-03-10T14:20:00.000Z',
      summary: 'publishing handoff',
      constraints: ['preview_only'],
      artifactKinds: ['publishing_checklist'],
      recommendedNextAction: '메타데이터 보완',
    },
  ]
  const artifacts = [
    {
      id: 'artifact-1',
      specialist: 'researcher',
      kind: 'research_note',
      title: 'Researcher',
      summary: '조사 결과 정리',
      createdAt: '2026-03-10T14:10:00.000Z',
      items: [],
    },
    {
      id: 'artifact-2',
      specialist: 'publishing_checker',
      kind: 'publishing_checklist',
      title: 'Publishing Checker',
      summary: '출간 체크리스트',
      createdAt: '2026-03-10T14:20:00.000Z',
      items: [],
    },
  ]

  check(handoffs.length === 2, 'copilot/specialist-history-handoffs', 'expected two handoffs in recent history')
  check(artifacts.length === 2, 'copilot/specialist-history-artifacts', 'expected two artifacts in recent history')
  check(
    handoffs[0].specialist !== handoffs[1].specialist && artifacts[0].kind !== artifacts[1].kind,
    'copilot/specialist-history-mixed',
    'expected mixed specialist history kinds',
  )
}

function runSpecialistChainCheck() {
  const replyText = [
    '- 1부는 프롤로그, 항구 도착, 첫 충돌 장면으로 압축하는 편이 좋습니다.',
    '- 프롤로그 초안은 안개 낀 부두와 냉랭한 내적 독백으로 시작하면 톤이 맞습니다.',
    '- 주인공의 과거 설정과 현재 시점 정보가 충돌하지 않도록 이름 표기를 고정하세요.',
  ].join('\n')

  const chain = buildSpecialistExecutionsFromChat({
    prompt: '1부 구조를 다시 잡고 프롤로그 초안까지 써준 뒤 설정 충돌도 검토해줘',
    replyText,
    leadSummary: 'book run',
    createdAt: '2026-03-10T16:00:00.000Z',
  })

  check(chain.handoffs.length === 3, 'copilot/specialist-chain-handoffs', `expected 3 handoffs, got ${chain.handoffs.length}`)
  check(chain.artifacts.length === 3, 'copilot/specialist-chain-artifacts', `expected 3 artifacts, got ${chain.artifacts.length}`)
  check(
    chain.handoffs.map((item) => item.specialist).join(',') === 'story_architect,drafter,continuity_reviewer',
    'copilot/specialist-chain-order',
    `unexpected specialist order: ${chain.handoffs.map((item) => item.specialist).join(',')}`,
  )
  check(
    chain.artifacts.map((item) => item.kind).join(',') === 'structure_plan,draft_page,continuity_report',
    'copilot/specialist-chain-kinds',
    `unexpected artifact kinds: ${chain.artifacts.map((item) => item.kind).join(',')}`,
  )

  const generatedDraft = buildGeneratedDraftFromSpecialistExecutions({
    prompt: '1부 구조를 다시 잡고 프롤로그 초안까지 써준 뒤 설정 충돌도 검토해줘',
    replyText,
    targetChapterId: 'chapter-1',
    createdAt: '2026-03-10T16:00:00.000Z',
  })
  check(Boolean(generatedDraft), 'copilot/specialist-chain-generated-draft', 'expected generated draft from chain')
  check(
    generatedDraft?.targetChapterId === 'chapter-1' &&
      generatedDraft?.text.includes('프롤로그'),
    'copilot/specialist-chain-generated-draft-target',
    `unexpected generated draft: ${JSON.stringify(generatedDraft)}`,
  )
}

async function runGeneratedDraftSafetyMarkerCheck() {
  const promptFlowSource = await fs.readFile(
    path.resolve('src/features/copilot/useCopilotPromptFlow.ts'),
    'utf-8',
  )
  check(
    promptFlowSource.includes('activeThread.lastGeneratedDraft.targetChapterId ?? undefined'),
    'copilot/generated-draft-target-preserved',
    'generated draft direct-apply follow-up should preserve targetChapterId',
  )
}

async function runStructuredConfirmationCheck() {
  const promptFlowSource = await fs.readFile(
    path.resolve('src/features/copilot/useCopilotPromptFlow.ts'),
    'utf-8',
  )
  const runtimeServiceSource = await fs.readFile(
    path.resolve('electron/services/copilotRuntimeService.ts'),
    'utf-8',
  )
  const inspectorSource = await fs.readFile(
    path.resolve('src/features/copilot/CopilotInspector.tsx'),
    'utf-8',
  )

  check(
    promptFlowSource.includes('confirm_structured_create') &&
      promptFlowSource.includes('buildStructuredCreateConfirmation') &&
      promptFlowSource.includes("resolvedIntent === 'create_chapter'") &&
      promptFlowSource.includes('createDraft?.requiresStructuredConfirmation') &&
      promptFlowSource.includes('!isStructuredCreateFollowUpPrompt'),
    'copilot/structured-confirmation-safe-path-wired',
    'expected create_chapter safe-path downgrade to structured confirmation in prompt flow',
  )

  check(
    runtimeServiceSource.includes('resolveCreateChapterPlacement') &&
      runtimeServiceSource.includes('parentChapterId: placement.parentChapterId ?? undefined') &&
      runtimeServiceSource.includes('afterChapterId: placement.afterChapterId ?? chapterId'),
    'copilot/structured-confirmation-runtime-placement-wired',
    'expected create_chapter runtime to derive parent/after placement from structured draft',
  )

  check(
    inspectorSource.includes('data-testid="copilot-pending-proposal"') &&
      inspectorSource.includes("activeThread.pendingProposal?.kind === 'confirm_structured_create'"),
    'copilot/structured-confirmation-inspector-card',
    'expected structured confirmation card in inspector',
  )
}

async function runPhase5ExecutorSliceCheck() {
  const actionsSource = await fs.readFile(
    path.resolve('src/features/copilot/rightPaneActions.ts'),
    'utf-8',
  )
  const promptFlowSource = await fs.readFile(
    path.resolve('src/features/copilot/useCopilotPromptFlow.ts'),
    'utf-8',
  )

  const advisoryChain = buildSpecialistExecutionsFromChat({
    prompt: '이 설정에 대한 조사 결과를 정리해줘',
    replyText: '핵심 사실 1\n핵심 사실 2',
    leadSummary: '조사 정리',
    createdAt: '2026-03-10T12:34:56.000Z',
  })
  const advisoryRunState = buildSpecialistExecutionRunState(advisoryChain)
  check(Boolean(advisoryRunState), 'copilot/phase5-advisory-runstate-exists', 'expected run state for advisory chain')
  check(
    advisoryRunState?.keepOpen === false && advisoryRunState?.phase === 'completed',
    'copilot/phase5-advisory-runstate-completed',
    `unexpected advisory run state: keepOpen=${advisoryRunState?.keepOpen}, phase=${advisoryRunState?.phase}`,
  )

  const draftChain = buildSpecialistExecutionsFromChat({
    prompt: '1부 구조를 다시 잡고 프롤로그 초안을 써준 뒤 일관성도 검토해줘',
    replyText: '구조안\n초안 문단\n일관성 검토 메모',
    leadSummary: '복합 book run',
    createdAt: '2026-03-10T12:34:56.000Z',
  })
  const draftRunState = buildSpecialistExecutionRunState(draftChain)
  check(Boolean(draftRunState), 'copilot/phase5-draft-runstate-exists', 'expected run state for draft chain')
  check(
    draftRunState?.keepOpen === true && draftRunState?.phase === 'review',
    'copilot/phase5-draft-runstate-review',
    `unexpected draft run state: keepOpen=${draftRunState?.keepOpen}, phase=${draftRunState?.phase}`,
  )
  check(
    draftRunState?.taskIds.join(',') === 'specialist:story_architect,specialist:drafter,specialist:continuity_reviewer',
    'copilot/phase5-draft-runstate-taskids',
    `unexpected task ids: ${draftRunState?.taskIds.join(',') ?? 'null'}`,
  )

  check(
    actionsSource.includes('buildSpecialistExecutionRunState') &&
      actionsSource.includes('currentRun: specialistRun'),
    'copilot/phase5-runstate-wired',
    'expected specialist execution run state to wire into currentRun in rightPaneActions.ts',
  )
  check(
    promptFlowSource.includes('updateAgentRun(thread.currentRun') &&
      promptFlowSource.includes("phase: 'review'"),
    'copilot/phase5-followup-reuses-run',
    'expected direct apply follow-up to reuse currentRun via updateAgentRun',
  )
}

async function runPhase5InterruptionSliceCheck() {
  const agentUtilsSource = await fs.readFile(
    path.resolve('src/features/copilot/rightPaneAgentUtils.ts'),
    'utf-8',
  )
  const actionsSource = await fs.readFile(
    path.resolve('src/features/copilot/rightPaneActions.ts'),
    'utf-8',
  )
  const promptFlowSource = await fs.readFile(
    path.resolve('src/features/copilot/useCopilotPromptFlow.ts'),
    'utf-8',
  )

  check(
    agentUtilsSource.includes('export function markAgentRunInterrupted'),
    'copilot/phase5-interruption-helper',
    'expected markAgentRunInterrupted helper in rightPaneAgentUtils.ts',
  )
  check(
    actionsSource.includes('currentRun: markAgentRunInterrupted(thread.currentRun') &&
      actionsSource.includes("lastRecoveryHint: t('rightPane.turnInterrupted')"),
    'copilot/phase5-interruption-wired',
    'expected interruption paths to keep currentRun resumable and persist recovery hint',
  )
  check(
    promptFlowSource.includes("thread.turnState === 'interrupted' ? thread.lastRecoveryHint : null"),
    'copilot/phase5-interruption-followup-keeps-hint',
    'expected prompt flow to preserve recovery hint across interruption follow-up',
  )
}

async function runPhase5ResumeSliceCheck() {
  const agentUtilsSource = await fs.readFile(
    path.resolve('src/features/copilot/rightPaneAgentUtils.ts'),
    'utf-8',
  )
  const actionsSource = await fs.readFile(
    path.resolve('src/features/copilot/rightPaneActions.ts'),
    'utf-8',
  )
  const inspectorSource = await fs.readFile(
    path.resolve('src/features/copilot/CopilotInspector.tsx'),
    'utf-8',
  )

  check(
    agentUtilsSource.includes('export function buildInterruptedRunResumePrompt'),
    'copilot/phase5-resume-helper',
    'expected interrupted-run resume prompt helper in rightPaneAgentUtils.ts',
  )
  check(
    actionsSource.includes('const resumeInterruptedRun = () =>') &&
      actionsSource.includes("draft: resumePrompt") &&
      actionsSource.includes("label: t('rightPane.activityResumePrepared')"),
    'copilot/phase5-resume-action-wired',
    'expected resumeInterruptedRun action to prepare draft and append recovery activity',
  )
  check(
    inspectorSource.includes('data-testid="copilot-resume-run"') &&
      inspectorSource.includes('copilotActions.resumeInterruptedRun()'),
    'copilot/phase5-resume-inspector-wired',
    'expected inspector to expose interrupted-run resume affordance',
  )
}

async function runPhase5VerifyRecoverySliceCheck() {
  const actionsSource = await fs.readFile(
    path.resolve('src/features/copilot/rightPaneActions.ts'),
    'utf-8',
  )
  const inspectorSource = await fs.readFile(
    path.resolve('src/features/copilot/CopilotInspector.tsx'),
    'utf-8',
  )

  check(
    actionsSource.includes('const shouldKeepRunOpen = allWarnings.length > 0') &&
      actionsSource.includes("phase: 'verify'") &&
      actionsSource.includes('currentRun: shouldKeepRunOpen ? nextRun : null'),
    'copilot/phase5-verify-run-kept-open',
    'expected apply success with warnings to keep currentRun open in verify phase',
  )
  check(
    actionsSource.includes("const recoverySummary = checkpointId") &&
      actionsSource.includes("phase: 'review'") &&
      actionsSource.includes('currentRun: resumableRun'),
    'copilot/phase5-recovery-run-kept-open',
    'expected apply failure to keep currentRun resumable for recovery instead of closing it',
  )
  check(
    !inspectorSource.includes('activeThread.currentRun.lastEvaluationSummary') &&
      !inspectorSource.includes('activeThread.currentRun.checkpointId'),
    'copilot/phase5-current-run-internal-card-hidden',
    'expected current run verify/recovery internals to stay hidden from default Copilot UI',
  )
}

async function runPhase5ResolveContinueSliceCheck() {
  const agentUtilsSource = await fs.readFile(
    path.resolve('src/features/copilot/rightPaneAgentUtils.ts'),
    'utf-8',
  )
  const actionsSource = await fs.readFile(
    path.resolve('src/features/copilot/rightPaneActions.ts'),
    'utf-8',
  )
  const inspectorSource = await fs.readFile(
    path.resolve('src/features/copilot/CopilotInspector.tsx'),
    'utf-8',
  )

  check(
    agentUtilsSource.includes('export function buildOpenRunContinuePrompt'),
    'copilot/phase5-open-run-continue-helper',
    'expected open-run continue prompt helper in rightPaneAgentUtils.ts',
  )
  check(
    actionsSource.includes('const continueCurrentRun = () =>') &&
      actionsSource.includes("label: t('rightPane.activityRunContinuePrepared')") &&
      actionsSource.includes('const resolveCurrentRun = () =>') &&
      actionsSource.includes("label: t('rightPane.activityRunResolved')"),
    'copilot/phase5-open-run-actions-wired',
    'expected continue/resolve actions for current runs in rightPaneActions.ts',
  )
  check(
    !inspectorSource.includes('data-testid="copilot-continue-run"') &&
      !inspectorSource.includes('data-testid="copilot-resolve-run"'),
    'copilot/phase5-open-run-inspector-actions-hidden',
    'expected current run continue/resolve controls to stay hidden from default Copilot UI',
  )
  check(
    actionsSource.includes("agentSteps: advanceAgentSteps(thread.agentSteps, isVerifyRun ? { check: 'in_progress' } : { review: 'in_progress' })") &&
      actionsSource.includes("agentTasks: advanceAgentTasks(") &&
      actionsSource.includes("verify_result: 'in_progress'") &&
      actionsSource.includes("review_changes: 'in_progress'") &&
      actionsSource.includes("apply_changes: 'ready'"),
    'copilot/phase5-open-run-continue-syncs-progress',
    'expected continue action to sync agent step/task progress for verify and review runs',
  )
  check(
    actionsSource.includes("lastApprovedIntent: thread.currentRun?.goalSummary ?? thread.sessionMemory.lastApprovedIntent") &&
      actionsSource.includes("verify_result: 'completed'") &&
      actionsSource.includes("review_changes: 'completed'") &&
      actionsSource.includes("unresolvedChecks: (thread.sessionMemory.unresolvedChecks ?? [])"),
    'copilot/phase5-open-run-resolve-syncs-memory',
    'expected resolve action to sync progress completion and prune session memory',
  )
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true })

  try {
    await runQuickStartCheck()
    await runDocxStructureCheck()
    runFilePolicyCheck()
    runEpubStructuredImportPlanCheck()
    runEpubStructuredImportMixedTopLevelCheck()
    runAiCommandSchemaCheck()
    runRollingContextBlockCheck()
    await runRuntimeStatusCheck()
    await runGuardrailStatusCheck()
    runAgentRunLifecycleCheck()
    await runPhase5ExecutorSliceCheck()
    await runPhase5InterruptionSliceCheck()
    await runPhase5ResumeSliceCheck()
    await runPhase5VerifyRecoverySliceCheck()
    await runPhase5ResolveContinueSliceCheck()
    runRenameSlotParserCheck()
    runCommandGroundingParserCheck()
    await runCommandGroundingIntentRoutingCheck()
    runMissingPageProposalCheck()
    runPreviewPolicyCheck()
    runPageReferenceResolverCheck()
    runPublishingArtifactCheck()
    runResearchArtifactCheck()
    runSpecialistHistoryCheck()
    runSpecialistChainCheck()
    await runGeneratedDraftSafetyMarkerCheck()
    await runStructuredConfirmationCheck()
  } catch (error) {
    failures.push(`unexpected exception: ${error instanceof Error ? error.message : String(error)}`)
  }

  const report = {
    createdAt: new Date().toISOString(),
    checks,
    warnings,
    failures,
  }

  await fs.writeFile(OUTPUT_JSON, JSON.stringify(report, null, 2), 'utf-8')

  const md = [
    '# Functional QA Report',
    '',
    `- createdAt: ${report.createdAt}`,
    `- checks: ${checks.length}`,
    `- failures: ${failures.length}`,
    `- warnings: ${warnings.length}`,
    '',
    '## Checks',
    ...checks.map((c) => `- ${c.ok ? 'PASS' : 'FAIL'} ${c.name}: ${c.details}`),
    '',
    warnings.length > 0 ? '## Warnings' : '## Warnings (none)',
    ...warnings.map((w) => `- ${w}`),
    '',
    failures.length > 0 ? '## Result: FAIL' : '## Result: PASS',
    ...failures.map((f) => `- ${f}`),
    '',
  ]

  await fs.writeFile(OUTPUT_MD, md.join('\n'), 'utf-8')

  if (failures.length > 0) {
    console.error('[qa:functional] failed')
    failures.forEach((item) => console.error(` - ${item}`))
    process.exit(1)
  }

  console.log('[qa:functional] passed')
  console.log(` - ${OUTPUT_JSON}`)
  console.log(` - ${OUTPUT_MD}`)
}

main().catch((error) => {
  console.error('[qa:functional] failed')
  console.error(error)
  process.exit(1)
})
