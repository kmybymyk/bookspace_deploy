import {
    AI_COMMAND_SCHEMA_VERSION,
    type AiCommandEnvelope,
} from '../../shared/aiCommandSchema'
import type {
    CopilotDirectChatRequest,
    CopilotDirectChatResponse,
    CopilotIntent,
} from '../../shared/copilotIpc'
import {
    buildDirectCompletionBody,
    buildDirectCompletionUrl,
    classifyDirectError,
    formatDirectError,
    readDirectCompletionText,
} from '../../shared/copilotDirect'
import {
    parseCreateChapterBundleFromPrompt,
    parseCreateChapterDraftFromPrompt,
    resolveCreateChapterPlacement,
} from '../../shared/createChapterPromptParser'
import {
    parseInsertIllustrationDraftFromPrompt,
    parseInsertTableDraftFromPrompt,
} from '../../shared/copilotStructuredPromptParser'
import {
    parseAppendTextDraftFromPrompt,
    parseFindReplaceDraftFromPrompt,
    parseSaveProjectDraftFromPrompt,
} from '../../shared/copilotP0PromptParser'
import {
    parseRenameChapterDraftFromPrompt,
    parseMoveChapterDraftFromPrompt,
    parseSetChapterTypeDraftFromPrompt,
    parseSetTypographyDraftFromPrompt,
    parseSetPageBackgroundDraftFromPrompt,
    parseApplyThemeDraftFromPrompt,
    parseUpdateBookInfoDraftFromPrompt,
    parseSetCoverAssetDraftFromPrompt,
    parseExportProjectDraftFromPrompt,
    parseRestoreSnapshotDraftFromPrompt,
} from '../../shared/copilotP1P2PromptParser'
import { resolveCopilotIntentPlan } from '../../shared/copilotIntentPlanner'

export interface CopilotGenerateRequestLike {
    requestId: string
    idempotencyKey: string
    intent: CopilotIntent
    baseProjectRevision?: string
    preview: boolean
    context: {
        chapterId?: string
        targetChapterId?: string
        pageStructure?: Array<{
            id: string
            title: string
            order: number
            parentId?: string | null
            chapterType?: string
            chapterKind?: string
        }>
        selectedText?: string
        selectedRange?: {
            from?: number
            to?: number
        }
        userPrompt?: string
    }
}

export function createCopilotRuntimeService() {
    function buildStubCopilotEnvelope(request: CopilotGenerateRequestLike): AiCommandEnvelope | null {
        const chapterId = request.context.targetChapterId ?? request.context.chapterId ?? 'chapter-active'
        const selectedText = request.context.selectedText ?? ''
        const userPrompt = request.context.userPrompt ?? ''
        const generatedAt = new Date().toISOString()
        const projectTitle = String((request.context as { projectTitle?: string }).projectTitle ?? '').trim() || '현재 원고'
        const isPublishingCheckPrompt = /epub|export|출간|출판|내보내기|메타데이터|metadata|checklist|체크리스트/i.test(userPrompt)

        if (request.intent === 'rewrite_selection' && selectedText.length === 0) {
            return null
        }

        const planned = resolveCopilotIntentPlan({
            prompt: userPrompt,
            hasSelection: selectedText.length > 0,
            fallbackIntent: request.intent,
        })
        void planned

        const plannedIntents = [request.intent]
        const commands: AiCommandEnvelope['commands'] = []

        for (const intent of plannedIntents) {
            if (intent === 'rewrite_selection') {
                const selectionFrom = Math.max(1, Math.floor(Number(request.context.selectedRange?.from ?? 0)))
                const selectionTo = Math.max(1, Math.floor(Number(request.context.selectedRange?.to ?? 0)))
                if (!Number.isFinite(selectionFrom) || !Number.isFinite(selectionTo) || selectionTo <= selectionFrom) {
                    return null
                }
                const rewrittenText = selectedText.replace(/\s+/g, ' ').trim()
                const finalText = rewrittenText.endsWith('.') ? rewrittenText : `${rewrittenText}.`
                commands.push({
                    type: 'rewrite_selection',
                    target: {
                        chapterId,
                        range: {
                            from: selectionFrom,
                            to: selectionTo,
                        },
                    },
                    payload: {
                        text: finalText,
                        tone: 'clear',
                        lengthPolicy: 'shorter',
                    },
                    preview: request.preview,
                })
                continue
            }

            if (intent === 'append_text') {
                const draft = parseAppendTextDraftFromPrompt(userPrompt)
                commands.push({
                    type: 'append_text',
                    target: {
                        chapterId,
                        position: draft.position,
                    },
                    payload: {
                        text: draft.mode === 'generate' ? '사용자 요청을 반영한 새 본문 초안입니다.' : draft.text,
                        tone: 'clear',
                        lengthPolicy: 'medium',
                    },
                    preview: request.preview,
                })
                continue
            }

            if (intent === 'find_replace') {
                const draft = parseFindReplaceDraftFromPrompt(userPrompt)
                commands.push({
                    type: 'find_replace',
                    target: {
                        scope: 'chapter',
                        chapterId,
                    },
                    payload: {
                        find: draft.find,
                        replace: draft.replace,
                        mode: draft.mode,
                        matchCase: draft.matchCase,
                    },
                    preview: request.preview,
                })
                continue
            }

            if (intent === 'save_project') {
                const draft = parseSaveProjectDraftFromPrompt(userPrompt)
                commands.push({
                    type: 'save_project',
                    target: {
                        mode: draft.mode,
                    },
                    payload: {
                        suggestedPath: draft.suggestedPath,
                    },
                    preview: request.preview,
                })
                continue
            }

            if (intent === 'rename_chapter') {
                const draft = parseRenameChapterDraftFromPrompt(userPrompt)
                commands.push({
                    type: 'rename_chapter',
                    target: { chapterId },
                    payload: { title: draft.title },
                    preview: request.preview,
                })
                continue
            }

            if (intent === 'delete_chapter') {
                commands.push({
                    type: 'delete_chapter',
                    target: { chapterId },
                    payload: {},
                    preview: request.preview,
                })
                continue
            }

            if (intent === 'move_chapter') {
                const draft = parseMoveChapterDraftFromPrompt(userPrompt)
                commands.push({
                    type: 'move_chapter',
                    target: { chapterId },
                    payload: {
                        toIndex: draft.toIndex,
                        parentId: draft.parentId,
                    },
                    preview: request.preview,
                })
                continue
            }

            if (intent === 'set_chapter_type') {
                const draft = parseSetChapterTypeDraftFromPrompt(userPrompt)
                commands.push({
                    type: 'set_chapter_type',
                    target: { chapterId },
                    payload: {
                        chapterType: draft.chapterType,
                        chapterKind: draft.chapterKind,
                    },
                    preview: request.preview,
                })
                continue
            }

            if (intent === 'set_typography') {
                const draft = parseSetTypographyDraftFromPrompt(userPrompt)
                commands.push({
                    type: 'set_typography',
                    target: { section: draft.section },
                    payload: {
                        slot: draft.slot,
                        fontFamily: draft.fontFamily,
                        fontScale: draft.fontScale,
                        lineHeight: draft.lineHeight,
                        letterSpacing: draft.letterSpacing,
                        textIndent: draft.textIndent,
                    },
                    preview: request.preview,
                })
                continue
            }

            if (intent === 'set_page_background') {
                const draft = parseSetPageBackgroundDraftFromPrompt(userPrompt)
                commands.push({
                    type: 'set_page_background',
                    target: { chapterId },
                    payload: { color: draft.color },
                    preview: request.preview,
                })
                continue
            }

            if (intent === 'apply_theme') {
                const draft = parseApplyThemeDraftFromPrompt(userPrompt)
                commands.push({
                    type: 'apply_theme',
                    target: { scope: 'project' },
                    payload: { theme: draft.theme },
                    preview: request.preview,
                })
                continue
            }

            if (intent === 'update_book_info') {
                const draft = parseUpdateBookInfoDraftFromPrompt(userPrompt)
                commands.push({
                    type: 'update_book_info',
                    target: { scope: 'project' },
                    payload: draft,
                    preview: request.preview,
                })
                continue
            }

            if (intent === 'set_cover_asset') {
                const draft = parseSetCoverAssetDraftFromPrompt(userPrompt)
                commands.push({
                    type: 'set_cover_asset',
                    target: { assetType: draft.assetType },
                    payload: {
                        source: draft.source,
                        value: draft.value || 'generated://cover-asset',
                    },
                    preview: request.preview,
                })
                continue
            }

            if (intent === 'export_project') {
                const draft = parseExportProjectDraftFromPrompt(userPrompt)
                commands.push({
                    type: 'export_project',
                    target: { format: draft.format },
                    payload: { embedFonts: draft.embedFonts },
                    preview: request.preview,
                })
                continue
            }

            if (intent === 'restore_snapshot') {
                const draft = parseRestoreSnapshotDraftFromPrompt(userPrompt)
                commands.push({
                    type: 'restore_snapshot',
                    target: { snapshotId: draft.snapshotId || 'latest' },
                    payload: { mode: draft.mode },
                    preview: request.preview,
                })
                continue
            }

            if (intent === 'create_chapter') {
                const bundle = parseCreateChapterBundleFromPrompt(userPrompt)
                if (bundle) {
                    const parentRef = 'create-part-1'
                    commands.push({
                        type: 'create_chapter',
                        target: {
                            commandRef: parentRef,
                            afterChapterId: chapterId,
                        },
                        payload: {
                            title: bundle.parent.title,
                            chapterType: bundle.parent.chapterType,
                            chapterKind: bundle.parent.chapterKind,
                            blocks: bundle.parent.blocks,
                        },
                        preview: request.preview,
                    })
                    for (let index = 0; index < bundle.children.length; index += 1) {
                        const child = bundle.children[index]
                        const childRef = `create-child-${index + 1}`
                        commands.push({
                            type: 'create_chapter',
                            target: {
                                commandRef: childRef,
                                afterCommandRef:
                                    index === 0 ? parentRef : `create-child-${index}`,
                                parentCommandRef: parentRef,
                            },
                            payload: {
                                title: child.title,
                                chapterType: child.chapterType,
                                chapterKind: child.chapterKind,
                                blocks: child.blocks,
                            },
                            preview: request.preview,
                        })
                    }
                    continue
                }
                const draft = parseCreateChapterDraftFromPrompt(userPrompt)
                const placement = resolveCreateChapterPlacement({
                    draft,
                    pages: Array.isArray(request.context.pageStructure)
                        ? request.context.pageStructure.map((page) => ({
                              id: String(page.id ?? ''),
                              title: String(page.title ?? ''),
                              order: Number(page.order ?? 0),
                              parentId: page.parentId ? String(page.parentId) : null,
                              chapterType:
                                  page.chapterType === 'front' ||
                                  page.chapterType === 'part' ||
                                  page.chapterType === 'chapter' ||
                                  page.chapterType === 'divider' ||
                                  page.chapterType === 'back' ||
                                  page.chapterType === 'uncategorized'
                                      ? page.chapterType
                                      : 'chapter',
                              chapterKind: typeof page.chapterKind === 'string' ? page.chapterKind : undefined,
                          }))
                        : [],
                    fallbackAfterChapterId: chapterId,
                })
                commands.push({
                    type: 'create_chapter',
                    target: {
                        afterChapterId: placement.afterChapterId ?? chapterId,
                        parentChapterId: placement.parentChapterId ?? undefined,
                    },
                    payload: {
                        title: draft.title,
                        chapterType: draft.chapterType,
                        chapterKind: draft.chapterKind,
                        blocks: draft.blocks,
                    },
                    preview: request.preview,
                })
                continue
            }

            if (intent === 'insert_table') {
                const draft = parseInsertTableDraftFromPrompt(userPrompt)
                commands.push({
                    type: 'insert_table',
                    target: {
                        chapterId,
                        position: draft.position,
                    },
                    payload: {
                        headers: draft.headers,
                        rows: draft.rows,
                        style: draft.style,
                    },
                    preview: request.preview,
                })
                continue
            }

            if (intent === 'insert_illustration') {
                const draft = parseInsertIllustrationDraftFromPrompt(userPrompt)
                commands.push({
                    type: 'insert_illustration',
                    target: {
                        chapterId,
                        position: draft.position,
                    },
                    payload: {
                        imageSource: draft.imageSource,
                        alt: draft.alt,
                        caption: draft.caption || 'AI 생성 일러스트(미리보기)',
                        width: draft.width,
                    },
                    preview: request.preview,
                })
                continue
            }

            commands.push({
                type: 'feedback_report',
                target: {
                    chapterId,
                },
                payload: {
                    items: isPublishingCheckPrompt
                        ? [
                              {
                                  issue: '메타데이터 기본값 확인',
                                  evidence: `${projectTitle}의 제목, 대표 저자, 언어 코드가 출간 전 필수 항목입니다.`,
                                  suggestion: '책 정보 패널에서 제목, 저자, 언어를 먼저 점검하세요.',
                              },
                              {
                                  issue: '구조/페이지 흐름 확인',
                                  evidence: '프롤로그/본문/에필로그 순서와 누락 페이지가 없는지 확인이 필요합니다.',
                                  suggestion: '내보내기 전에 목차 구조와 빈 페이지를 다시 확인하세요.',
                              },
                              {
                                  issue: '내보내기 직전 복구 지점 확보',
                                  evidence: '출간 직전에는 복구 가능한 체크포인트가 있으면 안전합니다.',
                                  suggestion: '저장 또는 스냅샷을 만든 뒤 EPUB/DOCX 내보내기를 진행하세요.',
                              },
                          ]
                        : [
                              {
                                  issue: '문단 길이가 길어 가독성이 떨어질 수 있습니다.',
                                  evidence: '한 문단이 5문장 이상으로 이어집니다.',
                                  suggestion: '핵심 메시지 단위로 문단을 분리하세요.',
                              },
                          ],
                },
                preview: true,
            })
        }

        if (commands.length === 0) return null

        return {
            schemaVersion: AI_COMMAND_SCHEMA_VERSION,
            requestId: request.requestId,
            idempotencyKey: request.idempotencyKey,
            intent: request.intent,
            baseProjectRevision: request.baseProjectRevision,
            generatedAt,
            warnings: [],
            summary:
                commands.length > 1
                    ? `복합 작업 미리보기를 생성했습니다. (${commands.length}개 명령)`
                    : request.intent === 'append_text'
                        ? '본문 덧붙이기 미리보기를 생성했습니다.'
                        : request.intent === 'find_replace'
                            ? '찾아 바꾸기 미리보기를 생성했습니다.'
                            : request.intent === 'save_project'
                                ? '프로젝트 저장 미리보기를 생성했습니다.'
                                : request.intent === 'rename_chapter'
                                    ? '챕터 이름 변경 미리보기를 생성했습니다.'
                                    : request.intent === 'delete_chapter'
                                        ? '챕터 삭제 미리보기를 생성했습니다.'
                                        : request.intent === 'move_chapter'
                                            ? '챕터 이동 미리보기를 생성했습니다.'
                                            : request.intent === 'set_chapter_type'
                                                ? '챕터 유형 변경 미리보기를 생성했습니다.'
                                                : request.intent === 'set_typography'
                                                    ? '타이포그래피 변경 미리보기를 생성했습니다.'
                                                    : request.intent === 'set_page_background'
                                                        ? '페이지 배경 변경 미리보기를 생성했습니다.'
                                                        : request.intent === 'apply_theme'
                                                            ? '테마 적용 미리보기를 생성했습니다.'
                                                            : request.intent === 'update_book_info'
                                                                ? '책 정보 변경 미리보기를 생성했습니다.'
                                                                : request.intent === 'set_cover_asset'
                                                                    ? '표지 자산 변경 미리보기를 생성했습니다.'
                                                                    : request.intent === 'export_project'
                                                                        ? '내보내기 미리보기를 생성했습니다.'
                                                                        : request.intent === 'restore_snapshot'
                                                                            ? '스냅샷 복원 미리보기를 생성했습니다.'
                    : request.intent === 'create_chapter'
                        ? '새 챕터 초안 미리보기를 생성했습니다.'
                        : request.intent === 'insert_table'
                            ? '표 미리보기 생성 결과입니다.'
                            : request.intent === 'insert_illustration'
                                ? '일러스트 삽입 미리보기 생성 결과입니다.'
                                : request.intent === 'feedback_report'
                                    ? '원고 피드백 미리보기를 생성했습니다.'
                                    : '선택 문단 미리보기 교정안을 생성했습니다.',
            commands,
            meta: {
                modelId: 'bookspace-local-stub',
                modelVersion: 'v0',
                promptTemplateVersion: 'copilot-stub-1',
            },
        }
    }

    function parseJsonObject(text: string): Record<string, unknown> | null {
        const raw = String(text ?? '').trim()
        if (!raw) return null
        const normalized = raw
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/i, '')
            .replace(/```$/i, '')
            .trim()
        try {
            const parsed = JSON.parse(normalized)
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
                ? (parsed as Record<string, unknown>)
                : null
        } catch {
            return null
        }
    }

    function buildDirectRewriteEnvelope(
        request: CopilotGenerateRequestLike,
        rewrittenText: string,
    ): AiCommandEnvelope {
        const selectedText = String(request.context.selectedText ?? '').trim()
        const chapterId = String(request.context.chapterId ?? '').trim() || 'active-chapter'
        const selectionFrom = Math.max(1, Math.floor(Number(request.context.selectedRange?.from ?? 0)))
        const selectionTo = Math.max(1, Math.floor(Number(request.context.selectedRange?.to ?? 0)))
        const generatedAt = new Date().toISOString()
        return {
            schemaVersion: AI_COMMAND_SCHEMA_VERSION,
            requestId: request.requestId,
            idempotencyKey: request.idempotencyKey,
            intent: request.intent,
            baseProjectRevision: request.baseProjectRevision || 'rev_direct_runtime',
            generatedAt,
            summary: 'Direct rewrite preview generated.',
            warnings: [],
            commands: [
                {
                    type: 'rewrite_selection',
                    target: {
                        chapterId,
                        range: {
                            from: selectionFrom,
                            to: selectionTo > selectionFrom ? selectionTo : Math.max(selectionFrom + 1, selectionFrom + selectedText.length),
                        },
                    },
                    payload: {
                        text: rewrittenText,
                    },
                    preview: request.preview,
                },
            ],
            meta: {
                modelId: 'direct',
                promptTemplateVersion: 'direct-v1',
            },
        }
    }

    async function runDirectCompletion(
        request: CopilotDirectChatRequest,
    ): Promise<CopilotDirectChatResponse> {
        const baseUrl = String(request?.baseUrl ?? '').trim().replace(/\/+$/, '')
        const apiKey = String(request?.apiKey ?? '').trim()
        const model = String(request?.model ?? '').trim()
        const prompt = String(request?.prompt ?? '').trim()
        const contextHint = String(request?.contextHint ?? '').trim()
        const systemPrompt = String(
            request?.systemPrompt ??
                [
                    'You are the official BookSpace Copilot for a desktop EPUB editor.',
                    'Always answer in Korean, concise and practical.',
                    'Never present yourself as a reading assistant or book recommendation bot.',
                    'Only discuss BookSpace editing workflows and capabilities.',
                ].join('\n'),
        ).trim()

        if (!baseUrl) return { ok: false, error: 'baseUrl is required' }
        if (!apiKey) return { ok: false, error: 'apiKey is required' }
        if (!model) return { ok: false, error: 'model is required' }
        if (!prompt) return { ok: false, error: 'prompt is required' }

        const performOnce = async (): Promise<CopilotDirectChatResponse> => {
            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), 20_000)
            try {
                const response = await fetch(buildDirectCompletionUrl(baseUrl), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify(
                        buildDirectCompletionBody({
                            baseUrl,
                            apiKey,
                            model,
                            prompt: contextHint ? `${contextHint}\n\nUserPrompt:\n${prompt}` : prompt,
                            systemPrompt,
                            temperature: 0.5,
                        }),
                    ),
                    signal: controller.signal,
                })
                if (!response.ok) {
                    const detail = await response.text().catch(() => '')
                    const errorInfo = classifyDirectError(detail || response.statusText, response.status)
                    return { ok: false, error: formatDirectError(errorInfo), errorInfo }
                }
                const payload = (await response.json()) as Record<string, unknown>
                const text = readDirectCompletionText(payload)
                if (!text) return { ok: false, error: 'empty chat response' }
                return { ok: true, text }
            } catch (error) {
                const errorInfo = classifyDirectError(error)
                return {
                    ok: false,
                    error: formatDirectError(errorInfo),
                    errorInfo,
                }
            } finally {
                clearTimeout(timeout)
            }
        }

        const firstAttempt = await performOnce()
        if (
            firstAttempt.ok ||
            (firstAttempt.errorInfo?.code !== 'NETWORK_FETCH_FAILED' &&
                firstAttempt.errorInfo?.code !== 'TIMEOUT')
        ) {
            return firstAttempt
        }
        await new Promise((resolve) => setTimeout(resolve, 300))
        return performOnce()
    }

    return {
        buildStubCopilotEnvelope,
        parseJsonObject,
        buildDirectRewriteEnvelope,
        runDirectCompletion,
    }
}
