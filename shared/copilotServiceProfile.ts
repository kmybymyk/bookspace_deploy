export interface CopilotServiceChatContext {
  scope?: string
  chapterId?: string
  selectedText?: string
  projectTitle?: string
  chapterCount?: number
  activePageTitle?: string
  activePageType?: string
  activePageSummary?: string
  threadGoal?: string
  threadSummary?: string
  rollingSummary?: string
  contextPins?: string[]
  sessionMemory?: string[]
  bookMemory?: string[]
  recentArtifacts?: string[]
  contextStatus?: 'fresh' | 'watch' | 'tight'
  requestedMode?: 'editorial_support' | 'book_context_review' | 'product_guidance' | 'next_action_coach' | 'release_editorial_check'
  bookContextOutline?: string[]
  bookContextEvidence?: string[]
  bookContextConfidence?: 'low' | 'medium' | 'high'
}

const SERVICE_CAPABILITIES = [
  '현재 페이지 흐름/문체/감정선/반복/설득력에 대한 편집 피드백',
  '책 전체 구조/톤/일관성/중복/페이싱에 대한 고수준 리뷰',
  '수정 방향과 다음 작업 우선순위 제안',
  'BookSpace 기능 존재 여부, 위치, 사용법, 제한사항 안내',
  '선택 문장이나 문단을 다듬고 다시 써주는 제안',
  '현재 페이지에 이어질 초안이나 다음 문단 방향 제안',
  '찾아 바꾸기, 저장, 내보내기 같은 작업 흐름 안내',
  '챕터 이름 변경/삭제/이동/유형 변경 같은 구조 작업 안내',
  '타이포그래피/배경/테마 조정 안내',
  '책 정보/표지 자산 수정 안내',
  '스냅샷 복원과 버전 관리 흐름 안내',
  '새 페이지 생성, 표 초안, 삽화 플레이스홀더 삽입 안내',
  '원고 피드백 리포트 생성 (feedback_report)',
  'EPUB/DOCX 가져오기·내보내기, 버전(히스토리) 관리 워크플로우 안내',
]

const DOMAIN_TERMS = [
  '빈 페이지 = 새로운 XHTML 챕터 페이지',
  '페이지/챕터/section은 편집기 내 chapter 노드 단위',
  '미리보기(Preview) -> 승인(Approve) -> 적용(Apply) 절차를 따른다',
]

export function buildBookspaceServiceProfileBlock(): string {
  const capabilities = SERVICE_CAPABILITIES.map((item) => `- ${item}`).join('\n')
  const terms = DOMAIN_TERMS.map((item) => `- ${item}`).join('\n')
  return [
    'BookSpace Service Profile',
    '[Capabilities]',
    capabilities,
    '[Domain Terms]',
    terms,
  ].join('\n')
}

export function buildBookspaceChatSystemPrompt(): string {
  return [
    'You are BookSpace Agent V3, the official digital editorial team inside BookSpace.',
    'Always answer in Korean, concise and practical.',
    'Your primary role is editorial support and product guidance, not autonomous document mutation.',
    'Never present yourself as a book recommendation or reading assistant.',
    'Do not invent unsupported capabilities or external data access.',
    'For manuscript questions, act like an editor: give a short judgment, concrete reasons, and suggested next moves.',
    'For product questions, say whether the feature exists first, then explain where/how to use it and any limits.',
    'Prefer advisory guidance over claiming that you will directly edit the manuscript.',
    'If the request maps to explicit editing actions, keep guidance aligned to BookSpace command flow.',
    'If required context is missing, ask one short clarifying question.',
    'When user asks "what can you do", explain only BookSpace capabilities.',
    '',
    buildBookspaceServiceProfileBlock(),
  ].join('\n')
}

export function buildBookspaceRewriteSystemPrompt(): string {
  return [
    'You rewrite manuscript text for BookSpace.',
    'Return only rewritten Korean text.',
    'No explanation, no markdown, no code fences.',
    'Preserve original meaning and improve readability.',
  ].join('\n')
}

type NormalizedChatContext = {
  selectedText: string
  normalizedScope: string
  projectTitle: string
  chapterCount: number
  activePageTitle: string
  activePageType: string
  activePageSummary: string
  chapterId: string
  threadGoal: string
  threadSummary: string
  rollingSummary: string
  contextPins: string[]
  sessionMemory: string[]
  bookMemory: string[]
  recentArtifacts: string[]
  contextStatus: string
  requestedMode: string
  bookContextOutline: string[]
  bookContextEvidence: string[]
  bookContextConfidence: string
}

function normalizeChatContext(context: CopilotServiceChatContext): NormalizedChatContext {
  const selectedText = String(context.selectedText ?? '').trim()
  const normalizedScope = String(context.scope ?? 'chapter')
  const projectTitle = String(context.projectTitle ?? '').trim() || '(unknown)'
  const chapterCount = Number.isFinite(Number(context.chapterCount)) ? Number(context.chapterCount) : 0
  const activePageTitle = String(context.activePageTitle ?? '').trim() || '(unknown)'
  const activePageType = String(context.activePageType ?? '').trim() || '(unknown)'
  const activePageSummary = String(context.activePageSummary ?? '').trim()
  const chapterId = String(context.chapterId ?? 'chapter-active')
  const threadGoal = String(context.threadGoal ?? '').trim()
  const threadSummary = String(context.threadSummary ?? '').trim()
  const rollingSummary = String(context.rollingSummary ?? '').trim()
  const contextPins = Array.isArray(context.contextPins)
    ? context.contextPins.map((item) => String(item ?? '').trim()).filter(Boolean).slice(0, 4)
    : []
  const sessionMemory = Array.isArray(context.sessionMemory)
    ? context.sessionMemory.map((item) => String(item ?? '').trim()).filter(Boolean).slice(0, 4)
    : []
  const bookMemory = Array.isArray(context.bookMemory)
    ? context.bookMemory.map((item) => String(item ?? '').trim()).filter(Boolean).slice(0, 4)
    : []
  const recentArtifacts = Array.isArray(context.recentArtifacts)
    ? context.recentArtifacts.map((item) => String(item ?? '').trim()).filter(Boolean).slice(0, 3)
    : []
  const contextStatus = String(context.contextStatus ?? '').trim() || 'fresh'
  const requestedMode = String(context.requestedMode ?? '').trim()
  const bookContextOutline = Array.isArray(context.bookContextOutline)
    ? context.bookContextOutline.map((item) => String(item ?? '').trim()).filter(Boolean).slice(0, 8)
    : []
  const bookContextEvidence = Array.isArray(context.bookContextEvidence)
    ? context.bookContextEvidence.map((item) => String(item ?? '').trim()).filter(Boolean).slice(0, 4)
    : []
  const bookContextConfidence = String(context.bookContextConfidence ?? '').trim() || 'low'

  return {
    selectedText,
    normalizedScope,
    projectTitle,
    chapterCount,
    activePageTitle,
    activePageType,
    activePageSummary,
    chapterId,
    threadGoal,
    threadSummary,
    rollingSummary,
    contextPins,
    sessionMemory,
    bookMemory,
    recentArtifacts,
    contextStatus,
    requestedMode,
    bookContextOutline,
    bookContextEvidence,
    bookContextConfidence,
  }
}

function buildProjectMetaStage(context: NormalizedChatContext): string[] {
  return [
    '[Stage:ProjectMeta]',
    `Scope=${context.normalizedScope}`,
    `ProjectTitle=${context.projectTitle}`,
    `ChapterCount=${context.chapterCount}`,
  ]
}

function buildChapterMetaStage(context: NormalizedChatContext): string[] {
  return [
    '[Stage:ChapterMeta]',
    `ChapterId=${context.chapterId}`,
    `ActivePageTitle=${context.activePageTitle}`,
    `ActivePageType=${context.activePageType}`,
    context.activePageSummary ? `ActivePageSummary=${context.activePageSummary}` : null,
  ].filter(Boolean) as string[]
}

function buildSelectionStage(context: NormalizedChatContext): string[] {
  return context.selectedText
    ? [
        '[Stage:Selection]',
        `SelectedTextLength=${context.selectedText.length}`,
        'SelectedText:',
        context.selectedText,
      ]
    : ['[Stage:Selection]', 'SelectedText=(none)']
}

function buildWorkingMemoryStages(context: NormalizedChatContext): string[] {
  if (
    !context.threadGoal &&
    !context.threadSummary &&
    !context.rollingSummary &&
    context.contextPins.length === 0 &&
    context.sessionMemory.length === 0 &&
    context.bookMemory.length === 0 &&
    context.recentArtifacts.length === 0
  ) {
    return []
  }

  const lines = ['[Stage:WorkingMemory]', `ContextStatus=${context.contextStatus}`]
  if (context.threadGoal) lines.push(`Goal=${context.threadGoal}`)
  if (context.threadSummary) lines.push(`Summary=${context.threadSummary}`)
  if (context.rollingSummary) lines.push(`RollingSummary=${context.rollingSummary}`)
  if (context.contextPins.length > 0) {
    lines.push('Pins:')
    context.contextPins.forEach((item) => lines.push(`- ${item}`))
  }
  if (context.sessionMemory.length > 0) {
    lines.push('[Stage:SessionMemory]')
    context.sessionMemory.forEach((item) => lines.push(`- ${item}`))
  }
  if (context.bookMemory.length > 0) {
    lines.push('[Stage:BookMemory]')
    context.bookMemory.forEach((item) => lines.push(`- ${item}`))
  }
  if (context.recentArtifacts.length > 0) {
    lines.push('[Stage:RecentArtifacts]')
    context.recentArtifacts.forEach((item) => lines.push(`- ${item}`))
  }
  return lines
}

function buildRequestedModeStages(context: NormalizedChatContext): string[] {
  if (!context.requestedMode) return []

  const lines = ['[Stage:RequestedMode]', `Mode=${context.requestedMode}`, '[Stage:ResponseContract]']
  if (context.requestedMode === 'editorial_support') {
    lines.push('- Start with one-line judgment.')
    lines.push('- Then explain 2-4 concrete reasons from the current page or nearby context.')
    lines.push('- End with revision directions or next checks.')
  } else if (context.requestedMode === 'book_context_review') {
    lines.push('- Start with one-line high-level judgment.')
    lines.push('- Then cite 2-4 book-level evidence points from retrieved pages or outline.')
    lines.push('- Mention what is confident versus what still needs checking.')
    lines.push('- End with next review directions.')
  } else if (context.requestedMode === 'product_guidance') {
    lines.push('- Say first whether the feature exists, is unsupported, or is uncertain.')
    lines.push('- If it exists, explain where and how to use it.')
    lines.push('- Mention limits or alternatives when relevant.')
  } else if (context.requestedMode === 'next_action_coach') {
    lines.push('- Recommend the next highest-value action first.')
    lines.push('- Keep the advice ordered and practical.')
    lines.push('- Tie recommendations to the current writing stage when possible.')
  } else if (context.requestedMode === 'release_editorial_check') {
    lines.push('- Answer like an editorial pre-release checklist.')
    lines.push('- Group checks into the most important items first.')
    lines.push('- Distinguish likely issues from optional polish.')
  }
  return lines
}

function buildBookContextReviewStage(context: NormalizedChatContext): string[] {
  if (context.bookContextOutline.length === 0 && context.bookContextEvidence.length === 0) {
    return []
  }

  const lines = ['[Stage:BookContextReview]', `Confidence=${context.bookContextConfidence}`]
  if (context.bookContextOutline.length > 0) {
    lines.push('Outline:')
    context.bookContextOutline.forEach((item) => lines.push(`- ${item}`))
  }
  if (context.bookContextEvidence.length > 0) {
    lines.push('Evidence:')
    context.bookContextEvidence.forEach((item) => lines.push(`- ${item}`))
  }
  return lines
}

function buildAvailableActionsStage(): string[] {
  return [
    'AvailableActions: rewrite_selection, append_text, find_replace, save_project, rename_chapter, delete_chapter, move_chapter, set_chapter_type, set_typography, set_page_background, apply_theme, update_book_info, set_cover_asset, export_project, restore_snapshot, create_chapter, insert_table, insert_illustration, feedback_report',
    'PrimaryModes: editorial_support, book_context_review, product_guidance, next_action_coach',
  ]
}

export function buildBookspaceChatContextBlock(context: CopilotServiceChatContext): string {
  const normalizedContext = normalizeChatContext(context)
  return [
    ...buildProjectMetaStage(normalizedContext),
    ...buildChapterMetaStage(normalizedContext),
    ...buildSelectionStage(normalizedContext),
    ...buildWorkingMemoryStages(normalizedContext),
    ...buildRequestedModeStages(normalizedContext),
    ...buildBookContextReviewStage(normalizedContext),
    ...buildAvailableActionsStage(),
  ].join('\n')
}
