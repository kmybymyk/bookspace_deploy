import type { CopilotIntent } from '../../../shared/copilotIpc'
import { resolveCopilotIntentPlan } from '../../../shared/copilotIntentPlanner.ts'
import {
    buildNormalizedCreateChapterBundlePrompt,
    buildNormalizedCreateChapterPrompt,
    looksLikeStructuredCreateRequest,
    parseCreateChapterBundleFromPrompt,
    parseCreateChapterDraftFromPrompt,
    type ParsedCreateChapterDraft,
} from '../../../shared/createChapterPromptParser.ts'
import {
    buildNormalizedInsertIllustrationPrompt,
    buildNormalizedInsertTablePrompt,
    parseInsertIllustrationDraftFromPrompt,
    parseInsertTableDraftFromPrompt,
    type ParsedInsertIllustrationDraft,
    type ParsedInsertTableDraft,
} from '../../../shared/copilotStructuredPromptParser.ts'
import {
    buildNormalizedAppendTextPrompt,
    buildNormalizedFindReplacePrompt,
    buildNormalizedSaveProjectPrompt,
    parseAppendTextDraftFromPrompt,
    parseFindReplaceDraftFromPrompt,
    parseSaveProjectDraftFromPrompt,
} from '../../../shared/copilotP0PromptParser.ts'
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
} from '../../../shared/copilotP1P2PromptParser.ts'
import { resolveAgentV3PriorityRoute } from './agentV3Routing'

export type CopilotRoute = 'chat' | 'command'

export interface ResolveCopilotIntentInput {
    prompt: string
    hasSelection: boolean
}

export interface ResolvedCopilotSlots {
    createChapter?: ParsedCreateChapterDraft
    insertTable?: ParsedInsertTableDraft
    insertIllustration?: ParsedInsertIllustrationDraft
    appendText?: ReturnType<typeof parseAppendTextDraftFromPrompt>
    findReplace?: ReturnType<typeof parseFindReplaceDraftFromPrompt>
    saveProject?: ReturnType<typeof parseSaveProjectDraftFromPrompt>
    renameChapter?: ReturnType<typeof parseRenameChapterDraftFromPrompt>
    moveChapter?: ReturnType<typeof parseMoveChapterDraftFromPrompt>
    setChapterType?: ReturnType<typeof parseSetChapterTypeDraftFromPrompt>
    setTypography?: ReturnType<typeof parseSetTypographyDraftFromPrompt>
    setPageBackground?: ReturnType<typeof parseSetPageBackgroundDraftFromPrompt>
    applyTheme?: ReturnType<typeof parseApplyThemeDraftFromPrompt>
    updateBookInfo?: ReturnType<typeof parseUpdateBookInfoDraftFromPrompt>
    setCoverAsset?: ReturnType<typeof parseSetCoverAssetDraftFromPrompt>
    exportProject?: ReturnType<typeof parseExportProjectDraftFromPrompt>
    restoreSnapshot?: ReturnType<typeof parseRestoreSnapshotDraftFromPrompt>
}

export interface ResolveCopilotIntentResult {
    route: CopilotRoute
    intent: CopilotIntent | null
    ruleVersion: string
    matchedIntent?: CopilotIntent
    confidence: number
    normalizedPrompt?: string
    slots?: ResolvedCopilotSlots
    reason: string
}

function prefersDirectPageWriting(prompt: string): 'append_text' | 'create_chapter' | null {
    const rawPrompt = String(prompt ?? '').trim()
    if (!rawPrompt) return null

    const lowered = rawPrompt.toLowerCase()
    const explicitEditPattern =
        /(수정|고쳐|다듬|교정|재작성|rewrite|rephrase|edit|polish|맞춤법|바꿔|치환|replace)/i
    if (explicitEditPattern.test(rawPrompt)) {
        return null
    }

    const writeVerbPattern =
        /(작성해|작성해줘|작성해 줘|작성해줘요|써줘|써 줘|써봐|써봐줘|만들어줘|만들어 줘|생성해줘|생성해 줘|compose|draft|write)/i
    if (!writeVerbPattern.test(rawPrompt)) {
        return null
    }

    const existingPagePattern =
        /(현재\s*페이지에|프롤로그\s*페이지에|에필로그\s*페이지에|프롤로그에|에필로그에|\d+\s*장에|파트\s*\d+에|part\s*\d+에|페이지에|chapter에|xhtml에|page에|현재\s*페이지\b)/i
    if (existingPagePattern.test(rawPrompt)) {
        return 'append_text'
    }

    const newPagePattern =
        /((새로|새\s*로|새\s*페이지|새\s*챕터|새\s*chapter|새\s*part|빈\s*페이지|new\s*(page|chapter|part)|blank\s*page).*(만들|생성|추가|작성))|((만들|생성|추가).*(페이지|챕터|chapter|part|프롤로그|에필로그|파트\s*\d+|part\s*\d+))/i
    if (newPagePattern.test(rawPrompt)) {
        return 'create_chapter'
    }

    const pageWritingPattern =
        /(페이지|chapter|page|xhtml|본문|글|문단|문장|원고|세\s*문장|세\s*문단|short\s+paragraph|paragraph|content|text)/i
    if (pageWritingPattern.test(rawPrompt) || lowered.includes('write')) {
        return 'append_text'
    }

    return null
}

function prefersDirectRename(prompt: string): boolean {
    const rawPrompt = String(prompt ?? '').trim()
    if (!rawPrompt) return false

    const metadataPattern =
        /(책\s*제목|book\s*title|대표\s*저자|저자|언어|출판사|메타데이터|book\s*info|metadata)/i
    if (metadataPattern.test(rawPrompt)) return false

    const renameVerbPattern = /(바꿔|바꿔줘|변경|rename)/i
    if (!renameVerbPattern.test(rawPrompt)) return false

    const titleTargetPattern =
        /((?:\d+\s*장|챕터\s*\d+|chapter\s*\d+)\s*(?:제목|이름)|.+?\s*(?:페이지|챕터)?\s*(?:제목|이름)|chapter\s*(?:title|name)|page\s*(?:title|name))/i
    return titleTargetPattern.test(rawPrompt)
}

export function resolveCopilotIntent(input: ResolveCopilotIntentInput): ResolveCopilotIntentResult {
    const rawPrompt = String(input.prompt ?? '').trim()
    const agentV3Priority = resolveAgentV3PriorityRoute({
        prompt: rawPrompt,
        hasSelection: input.hasSelection,
    })
    if (agentV3Priority) {
        return {
            route: agentV3Priority.route,
            intent: agentV3Priority.intent,
            matchedIntent: agentV3Priority.intent ?? undefined,
            ruleVersion: agentV3Priority.ruleVersion,
            confidence: agentV3Priority.confidence,
            normalizedPrompt: agentV3Priority.normalizedPrompt,
            reason: agentV3Priority.reason,
        }
    }

    if (prefersDirectRename(rawPrompt)) {
        const draft = parseRenameChapterDraftFromPrompt(rawPrompt)
        return {
            route: 'command',
            intent: 'rename_chapter',
            matchedIntent: 'rename_chapter',
            ruleVersion: 'direct-rename-heuristic',
            confidence: 0.9,
            normalizedPrompt: rawPrompt,
            slots: {
                renameChapter: draft,
            },
            reason: 'direct-rename-targeted',
        }
    }

    if (looksLikeStructuredCreateRequest(rawPrompt)) {
        const draft = parseCreateChapterDraftFromPrompt(rawPrompt)
        return {
            route: 'command',
            intent: 'create_chapter',
            matchedIntent: 'create_chapter',
            ruleVersion: 'structured-create-heuristic',
            confidence: 0.93,
            normalizedPrompt: buildNormalizedCreateChapterPrompt(draft),
            slots: {
                createChapter: draft,
            },
            reason: 'structured-create-request',
        }
    }

    const preferredWritingIntent = prefersDirectPageWriting(rawPrompt)
    if (preferredWritingIntent === 'create_chapter') {
        const draft = parseCreateChapterDraftFromPrompt(rawPrompt)
        const bundle = parseCreateChapterBundleFromPrompt(rawPrompt)
        return {
            route: 'command',
            intent: 'create_chapter',
            matchedIntent: 'create_chapter',
            ruleVersion: 'direct-writing-heuristic',
            confidence: 0.9,
            normalizedPrompt: bundle
                ? buildNormalizedCreateChapterBundlePrompt(bundle)
                : buildNormalizedCreateChapterPrompt(draft),
            slots: {
                createChapter: draft,
            },
            reason: 'direct-writing-create-page',
        }
    }
    if (preferredWritingIntent === 'append_text') {
        const draft = parseAppendTextDraftFromPrompt(rawPrompt)
        return {
            route: 'command',
            intent: 'append_text',
            matchedIntent: 'append_text',
            ruleVersion: 'direct-writing-heuristic',
            confidence: 0.88,
            normalizedPrompt: buildNormalizedAppendTextPrompt(draft),
            slots: {
                appendText: draft,
            },
            reason: 'direct-writing-current-page',
        }
    }

    const planned = resolveCopilotIntentPlan({
        prompt: rawPrompt,
        hasSelection: input.hasSelection,
    })
    if (planned.route === 'chat' || !planned.intent) {
        return {
            route: 'chat',
            intent: null,
            ruleVersion: planned.version,
            confidence: planned.confidence,
            reason: planned.reason,
        }
    }

    const slots: ResolvedCopilotSlots = {}
    let normalizedPrompt = rawPrompt
    const primaryIntent = planned.intent
    if (primaryIntent === 'create_chapter') {
        const draft = parseCreateChapterDraftFromPrompt(rawPrompt)
        const bundle = parseCreateChapterBundleFromPrompt(rawPrompt)
        slots.createChapter = draft
        normalizedPrompt = bundle
            ? buildNormalizedCreateChapterBundlePrompt(bundle)
            : buildNormalizedCreateChapterPrompt(draft)
    } else if (primaryIntent === 'append_text') {
        const draft = parseAppendTextDraftFromPrompt(rawPrompt)
        slots.appendText = draft
        normalizedPrompt = buildNormalizedAppendTextPrompt(draft)
    } else if (primaryIntent === 'find_replace') {
        const draft = parseFindReplaceDraftFromPrompt(rawPrompt)
        slots.findReplace = draft
        normalizedPrompt = buildNormalizedFindReplacePrompt(draft)
    } else if (primaryIntent === 'save_project') {
        const draft = parseSaveProjectDraftFromPrompt(rawPrompt)
        slots.saveProject = draft
        normalizedPrompt = buildNormalizedSaveProjectPrompt(draft)
    } else if (primaryIntent === 'rename_chapter') {
        slots.renameChapter = parseRenameChapterDraftFromPrompt(rawPrompt)
    } else if (primaryIntent === 'move_chapter') {
        slots.moveChapter = parseMoveChapterDraftFromPrompt(rawPrompt)
    } else if (primaryIntent === 'set_chapter_type') {
        slots.setChapterType = parseSetChapterTypeDraftFromPrompt(rawPrompt)
    } else if (primaryIntent === 'set_typography') {
        slots.setTypography = parseSetTypographyDraftFromPrompt(rawPrompt)
    } else if (primaryIntent === 'set_page_background') {
        slots.setPageBackground = parseSetPageBackgroundDraftFromPrompt(rawPrompt)
    } else if (primaryIntent === 'apply_theme') {
        slots.applyTheme = parseApplyThemeDraftFromPrompt(rawPrompt)
    } else if (primaryIntent === 'update_book_info') {
        slots.updateBookInfo = parseUpdateBookInfoDraftFromPrompt(rawPrompt)
    } else if (primaryIntent === 'set_cover_asset') {
        slots.setCoverAsset = parseSetCoverAssetDraftFromPrompt(rawPrompt)
    } else if (primaryIntent === 'export_project') {
        slots.exportProject = parseExportProjectDraftFromPrompt(rawPrompt)
    } else if (primaryIntent === 'restore_snapshot') {
        slots.restoreSnapshot = parseRestoreSnapshotDraftFromPrompt(rawPrompt)
    } else if (primaryIntent === 'insert_table') {
        const draft = parseInsertTableDraftFromPrompt(rawPrompt)
        slots.insertTable = draft
        normalizedPrompt = buildNormalizedInsertTablePrompt(draft)
    } else if (primaryIntent === 'insert_illustration') {
        const draft = parseInsertIllustrationDraftFromPrompt(rawPrompt)
        slots.insertIllustration = draft
        normalizedPrompt = buildNormalizedInsertIllustrationPrompt(draft)
    }

    return {
        route: 'command',
        intent: primaryIntent,
        matchedIntent: primaryIntent,
        ruleVersion: planned.version,
        confidence: planned.confidence,
        normalizedPrompt,
        slots,
        reason: planned.reason,
    }
}
