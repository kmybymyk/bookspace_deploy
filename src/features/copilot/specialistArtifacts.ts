import type { AiCommandEnvelope, FeedbackReportCommand } from '../../../shared/aiCommandSchema'
import type { CopilotGeneratedDraft, CopilotSpecialistArtifact, CopilotSpecialistHandoff } from './rightPaneTypes'

function isPublishingPrompt(prompt: string): boolean {
    const normalized = String(prompt ?? '').toLowerCase()
    return /epub|export|출간|출판|내보내기|메타데이터|metadata|checklist|체크리스트/.test(normalized)
}

function isResearchPrompt(prompt: string): boolean {
    const normalized = String(prompt ?? '').toLowerCase()
    return /조사|검색|레퍼런스|자료|근거|사실관계|확인해|찾아줘|reference|research|source|sources|fact check|fact-check/.test(
        normalized,
    )
}

function isStoryArchitecturePrompt(prompt: string): boolean {
    const normalized = String(prompt ?? '').toLowerCase()
    return /구조|개요|아웃라인|outline|plot|플롯|재구성|재설계|파트|1부|2부|chapter bundle|구성/.test(normalized)
}

function isDraftPrompt(prompt: string): boolean {
    const normalized = String(prompt ?? '').toLowerCase()
    return /초안|써줘|작성|장면|문단|프롤로그|도입부|draft|scene|write/.test(normalized)
}

function isContinuityPrompt(prompt: string): boolean {
    const normalized = String(prompt ?? '').toLowerCase()
    return /일관성|continuity|설정 충돌|모순|충돌 검토|검토해|review|consistency/.test(normalized)
}

function collectFeedbackReportItems(envelope: AiCommandEnvelope): FeedbackReportCommand['payload']['items'] {
    return envelope.commands
        .filter((command): command is FeedbackReportCommand => command.type === 'feedback_report')
        .flatMap((command) => command.payload.items ?? [])
}

function specialistLabel(specialist: CopilotSpecialistHandoff['specialist']): string {
    if (specialist === 'publishing_checker') return 'Publishing Checker'
    if (specialist === 'editor_operator') return 'Editor Operator'
    if (specialist === 'continuity_reviewer') return 'Continuity Reviewer'
    if (specialist === 'story_architect') return 'Story Architect'
    if (specialist === 'drafter') return 'Drafter'
    return 'Researcher'
}

function extractReplyItems(replyText: string, fallbackPrefix: string): CopilotSpecialistArtifact['items'] {
    const normalized = String(replyText ?? '').trim()
    if (!normalized) return []

    const lines = normalized
        .split('\n')
        .map((line) => line.replace(/^[-*]\s*/, '').trim())
        .filter(Boolean)
    const chunks = (lines.length > 0 ? lines : normalized.split(/[.!?]\s+/))
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 4)

    return chunks.map((line, index) => ({
        id: `${fallbackPrefix}-${index + 1}`,
        label: index === 0 ? '핵심 포인트' : `포인트 ${index + 1}`,
        detail: line,
        severity: index === 0 ? 'warning' : 'info',
    }))
}

function buildChatArtifact(args: {
    specialist: CopilotSpecialistHandoff['specialist']
    kind: CopilotSpecialistArtifact['kind']
    title: string
    summary: string
    recommendedNextAction: string
    replyText: string
    createdAt?: string
    itemPrefix: string
}): CopilotSpecialistArtifact | null {
    const items = extractReplyItems(args.replyText, args.itemPrefix)
    if (items.length === 0) return null

    const timestamp = args.createdAt ?? new Date().toISOString()
    return {
        id: `artifact-${args.kind}-${timestamp}`,
        specialist: args.specialist,
        kind: args.kind,
        title: args.title,
        summary: args.summary,
        createdAt: timestamp,
        items,
        recommendedNextAction: args.recommendedNextAction,
    }
}

function buildChatHandoff(args: {
    specialist: CopilotSpecialistHandoff['specialist']
    leadSummary: string
    reason: string
    goal: string
    scope: string
    summary: string
    constraints: string[]
    artifact: CopilotSpecialistArtifact | null
    recommendedNextAction: string
    createdAt?: string
}): CopilotSpecialistHandoff {
    const timestamp = args.createdAt ?? new Date().toISOString()
    return {
        id: `handoff-${args.specialist}-${timestamp}`,
        leadSummary: args.leadSummary,
        specialist: args.specialist,
        reason: args.reason,
        status: 'completed',
        goal: args.goal,
        scope: args.scope,
        createdAt: timestamp,
        summary: args.summary,
        constraints: args.constraints,
        artifactKinds: args.artifact ? [args.artifact.kind] : [],
        recommendedNextAction: args.artifact?.recommendedNextAction ?? args.recommendedNextAction,
    }
}

export function buildSpecialistArtifactFromEnvelope(args: {
    prompt: string
    envelope: AiCommandEnvelope | null
    createdAt?: string
}): CopilotSpecialistArtifact | null {
    const { prompt, envelope, createdAt } = args
    if (!envelope || envelope.intent !== 'feedback_report') return null
    if (!isPublishingPrompt(prompt)) return null

    const reportItems = collectFeedbackReportItems(envelope)
    if (reportItems.length === 0) return null

    return {
        id: `artifact-${createdAt ?? envelope.generatedAt}`,
        specialist: 'publishing_checker',
        kind: 'publishing_checklist',
        title: 'Publishing Checker',
        summary: envelope.summary || '출간 전 확인 체크리스트를 정리했습니다.',
        createdAt: createdAt ?? envelope.generatedAt,
        items: reportItems.slice(0, 5).map((item, index) => ({
            id: `publishing-item-${index + 1}`,
            label: item.issue,
            detail: [item.evidence, item.suggestion].filter(Boolean).join(' / '),
            severity: index === 0 ? 'warning' : 'info',
        })),
        recommendedNextAction: '이 항목을 기준으로 메타데이터와 내보내기 설정을 한 번 더 점검해보세요.',
    }
}

export function buildSpecialistArtifactFromChat(args: {
    prompt: string
    replyText: string
    createdAt?: string
}): CopilotSpecialistArtifact | null {
    const { prompt, replyText, createdAt } = args
    if (!isResearchPrompt(prompt)) return null
    return buildChatArtifact({
        specialist: 'researcher',
        kind: 'research_note',
        title: 'Researcher',
        summary: '조사 결과를 research note 형태로 정리했습니다.',
        recommendedNextAction: '이 조사 결과를 바탕으로 구조안 작성이나 본문 초안 생성으로 이어갈 수 있습니다.',
        replyText,
        createdAt,
        itemPrefix: 'research-item',
    })
}

export function buildSpecialistHandoffFromEnvelope(args: {
    prompt: string
    envelope: AiCommandEnvelope | null
    leadSummary?: string | null
    createdAt?: string
}): CopilotSpecialistHandoff | null {
    const { prompt, envelope, leadSummary, createdAt } = args
    if (!envelope || envelope.intent !== 'feedback_report') return null
    if (!isPublishingPrompt(prompt)) return null

    const artifact = buildSpecialistArtifactFromEnvelope({ prompt, envelope, createdAt })
    const timestamp = createdAt ?? envelope.generatedAt
    return {
        id: `handoff-${timestamp}`,
        leadSummary: String(leadSummary ?? '').trim() || '출간 준비 점검',
        specialist: 'publishing_checker',
        reason: '출간/내보내기 준비 상태를 점검하기 위해 Publishing Checker에 검토를 위임했습니다.',
        status: 'completed',
        goal: envelope.summary || '출간 전 체크리스트를 정리합니다.',
        scope: 'project_export_readiness',
        createdAt: timestamp,
        summary: 'Lead Agent가 Publishing Checker에 출간 준비 점검을 위임하고 체크리스트를 회수했습니다.',
        constraints: ['preview_only', 'no_document_mutation', 'export_readiness_focus'],
        artifactKinds: artifact ? [artifact.kind] : [],
        recommendedNextAction: artifact?.recommendedNextAction ?? '체크리스트 기준으로 메타데이터와 내보내기 설정을 보완합니다.',
    }
}

export function buildSpecialistHandoffFromChat(args: {
    prompt: string
    replyText: string
    leadSummary?: string | null
    createdAt?: string
}): CopilotSpecialistHandoff | null {
    const { prompt, replyText, leadSummary, createdAt } = args
    if (!isResearchPrompt(prompt)) return null

    const artifact = buildSpecialistArtifactFromChat({ prompt, replyText, createdAt })
    return buildChatHandoff({
        specialist: 'researcher',
        leadSummary: String(leadSummary ?? '').trim() || '자료 조사',
        reason: '외부 근거와 레퍼런스 정리가 필요한 요청이라 Researcher에 조사를 위임했습니다.',
        goal: '필요한 배경 자료와 참고 포인트를 수집해 다음 writing step에 넘깁니다.',
        scope: 'research_reference_note',
        summary: 'Lead Agent가 Researcher에 조사를 위임하고 research note를 회수했습니다.',
        constraints: ['advisory_only', 'source_grounding_needed', 'no_document_mutation'],
        artifact,
        recommendedNextAction: '조사 결과를 채택할지 결정한 뒤 초안 작성이나 구조 수정으로 이어갑니다.',
        createdAt,
    })
}

export function buildSpecialistExecutionsFromChat(args: {
    prompt: string
    replyText: string
    leadSummary?: string | null
    createdAt?: string
}): {
    handoffs: CopilotSpecialistHandoff[]
    artifacts: CopilotSpecialistArtifact[]
} {
    const { prompt, replyText, leadSummary, createdAt } = args
    const executions: Array<{
        handoff: CopilotSpecialistHandoff
        artifact: CopilotSpecialistArtifact | null
    }> = []

    if (isResearchPrompt(prompt)) {
        const artifact = buildSpecialistArtifactFromChat({ prompt, replyText, createdAt })
        const handoff = buildSpecialistHandoffFromChat({ prompt, replyText, leadSummary, createdAt })
        if (handoff) executions.push({ handoff, artifact })
    }

    if (isStoryArchitecturePrompt(prompt)) {
        const artifact = buildChatArtifact({
            specialist: 'story_architect',
            kind: 'structure_plan',
            title: 'Story Architect',
            summary: '구조 재설계 포인트를 structure plan으로 정리했습니다.',
            recommendedNextAction: '이 구조안을 기준으로 챕터 재배치나 초안 작성으로 이어갈 수 있습니다.',
            replyText,
            createdAt,
            itemPrefix: 'structure-item',
        })
        executions.push({
            handoff: buildChatHandoff({
                specialist: 'story_architect',
                leadSummary: String(leadSummary ?? '').trim() || '구조 재설계',
                reason: '챕터/파트 흐름을 재구성하기 위해 Story Architect에 구조 설계를 위임했습니다.',
                goal: '파트와 챕터 흐름을 다시 정리할 수 있는 구조안을 만듭니다.',
                scope: 'book_structure_plan',
                summary: 'Lead Agent가 Story Architect에 구조 설계를 위임하고 structure plan을 회수했습니다.',
                constraints: ['advisory_first', 'structure_focus', 'review_before_major_reorder'],
                artifact,
                recommendedNextAction: '구조안을 검토한 뒤 실제 편집 반영이나 초안 작성으로 이어갑니다.',
                createdAt,
            }),
            artifact,
        })
    }

    if (isDraftPrompt(prompt)) {
        const artifact = buildChatArtifact({
            specialist: 'drafter',
            kind: 'draft_page',
            title: 'Drafter',
            summary: '초안 후보를 draft page 형태로 정리했습니다.',
            recommendedNextAction: '이 초안을 현재 페이지나 새 페이지에 반영할 수 있습니다.',
            replyText,
            createdAt,
            itemPrefix: 'draft-item',
        })
        executions.push({
            handoff: buildChatHandoff({
                specialist: 'drafter',
                leadSummary: String(leadSummary ?? '').trim() || '본문 초안 작성',
                reason: '구조안이나 요청 톤을 실제 본문 후보로 전환하기 위해 Drafter에 집필을 위임했습니다.',
                goal: '사용 가능한 장면/페이지 초안을 생성합니다.',
                scope: 'draft_page_generation',
                summary: 'Lead Agent가 Drafter에 집필을 위임하고 draft page를 회수했습니다.',
                constraints: ['draft_only', 'tone_sensitive', 'no_direct_apply_without_user_or_policy'],
                artifact,
                recommendedNextAction: '초안을 검토한 뒤 에디터 반영이나 추가 수정을 진행합니다.',
                createdAt,
            }),
            artifact,
        })
    }

    if (isContinuityPrompt(prompt)) {
        const artifact = buildChatArtifact({
            specialist: 'continuity_reviewer',
            kind: 'continuity_report',
            title: 'Continuity Reviewer',
            summary: '일관성 리스크를 continuity report로 정리했습니다.',
            recommendedNextAction: '충돌 가능성이 높은 포인트부터 우선 수정하는 것이 좋습니다.',
            replyText,
            createdAt,
            itemPrefix: 'continuity-item',
        })
        executions.push({
            handoff: buildChatHandoff({
                specialist: 'continuity_reviewer',
                leadSummary: String(leadSummary ?? '').trim() || '일관성 검토',
                reason: '설정/톤/명칭 충돌 여부를 확인하기 위해 Continuity Reviewer에 검토를 위임했습니다.',
                goal: '앞뒤 장면과 설정의 충돌 가능성을 식별합니다.',
                scope: 'continuity_review',
                summary: 'Lead Agent가 Continuity Reviewer에 검토를 위임하고 continuity report를 회수했습니다.',
                constraints: ['review_only', 'consistency_focus', 'no_document_mutation'],
                artifact,
                recommendedNextAction: '지적된 충돌 포인트를 기준으로 본문 수정이나 구조 조정을 진행합니다.',
                createdAt,
            }),
            artifact,
        })
    }

    return {
        handoffs: executions.map((item) => item.handoff),
        artifacts: executions.map((item) => item.artifact).filter(Boolean) as CopilotSpecialistArtifact[],
    }
}

export function buildGeneratedDraftFromSpecialistExecutions(args: {
    prompt: string
    replyText: string
    targetChapterId?: string | null
    createdAt?: string
}): CopilotGeneratedDraft | null {
    const { prompt, replyText, targetChapterId, createdAt } = args
    if (!isDraftPrompt(prompt)) return null
    const normalized = String(replyText ?? '').trim()
    if (!normalized) return null
    return {
        text: normalized,
        sourcePrompt: prompt,
        createdAt: createdAt ?? new Date().toISOString(),
        targetChapterId: targetChapterId ?? null,
    }
}

export function buildSpecialistExecutionRunState(args: {
    handoffs: CopilotSpecialistHandoff[]
    artifacts: CopilotSpecialistArtifact[]
}): {
    taskIds: string[]
    keepOpen: boolean
    phase: 'review' | 'completed'
    summary: string
} | null {
    const { handoffs, artifacts } = args
    if (handoffs.length === 0) return null

    const taskIds = handoffs.map((handoff) => `specialist:${handoff.specialist}`).slice(0, 8)
    const keepOpen = artifacts.some(
        (artifact) =>
            artifact.kind === 'draft_page' ||
            artifact.kind === 'structure_plan' ||
            artifact.kind === 'continuity_report',
    )

    return {
        taskIds,
        keepOpen,
        phase: keepOpen ? 'review' : 'completed',
        summary: handoffs.map((handoff) => handoff.specialist).join(' -> '),
    }
}

export function formatSpecialistHandoffMessage(handoff: CopilotSpecialistHandoff): string {
    const lines = [
        `### Lead Agent -> ${specialistLabel(handoff.specialist)}`,
        handoff.summary,
        '',
        `- goal: ${handoff.goal}`,
        `- reason: ${handoff.reason}`,
        `- scope: ${handoff.scope}`,
    ]
    if (handoff.constraints.length > 0) {
        lines.push(`- constraints: ${handoff.constraints.join(', ')}`)
    }
    if (handoff.recommendedNextAction) {
        lines.push('', handoff.recommendedNextAction)
    }
    return lines.join('\n').trim()
}

export function formatSpecialistArtifactMessage(artifact: CopilotSpecialistArtifact): string {
    const lines = [
        `### ${artifact.title}`,
        artifact.summary,
        '',
        ...artifact.items.map((item) => `- [ ] ${item.label}: ${item.detail}`),
    ]
    if (artifact.recommendedNextAction) {
        lines.push('', artifact.recommendedNextAction)
    }
    return lines.join('\n').trim()
}
