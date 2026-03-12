import type { CopilotIntent } from '../../../shared/copilotIpc'

export interface AgentV3PriorityRouteInput {
    prompt: string
    hasSelection: boolean
}

export interface AgentV3PriorityRouteResult {
    route: 'chat' | 'command'
    intent: CopilotIntent | null
    ruleVersion: string
    confidence: number
    normalizedPrompt?: string
    reason: string
}

export type AgentV3ChatMode =
    | 'editorial_support'
    | 'book_context_review'
    | 'product_guidance'
    | 'next_action_coach'
    | 'release_editorial_check'

type AgentV3RuleContext = {
    prompt: string
    hasSelection: boolean
}

type AgentV3PriorityRule = {
    id: string
    result: Omit<AgentV3PriorityRouteResult, 'normalizedPrompt'>
    matches: (context: AgentV3RuleContext) => boolean
}

type AgentV3ChatModeRule = {
    id: AgentV3ChatMode
    matches: (context: AgentV3RuleContext) => boolean
}

const PRODUCT_GUIDE_QUESTION_PATTERN =
    /(어떻게\s*(해|하죠|하지|써|쓰죠)|어디서|어디에|가능해\?|가능한가|있어\?|있나요|지원해\?|지원하나요|방법|쓸\s*수\s*있어|쓸\s*수\s*있나요|how\s+do\s+i|where\s+is|is\s+there|can\s+i)/i
const PRODUCT_GUIDE_FEATURE_PATTERN =
    /(기능|메뉴|설정|가져오기|import|내보내기|export|epub|docx|표지|cover|theme|테마|저장|snapshot|스냅샷|히스토리|history|bookspace)/i
const NEXT_ACTION_PATTERN =
    /(다음엔|다음에|뭘\s*해야|무엇을\s*해야|뭐부터|무엇부터|어디부터|우선순위|작업\s*순서|순서\s*추천|다음\s*작업|next\s+step|what\s+should\s+i\s+do\s+next)/i
const EDITORIAL_TOPIC_PATTERN =
    /(흐름|감정선|문체|톤|말투|반복|어색|설득력|일관성|충돌|구조|페이싱|pacing|늘어지|호흡|설명(이|이\s*너무)?|피드백|검토|리뷰|review|consistency|style|tone|flow)/i
const EDITORIAL_ASK_PATTERN =
    /(어때\?|어떤가|괜찮아\?|괜찮나|문제|이상해\?|이상한가|고치려면|다듬으려면|어떻게\s*고치|피드백\s*해줘|검토해줘|리뷰해줘|봐줘|점검해줘|정리해줘|부탁해|부탁해요|부탁드립니다|일관돼\?|충돌해\?|늘어지나\?)/i
const EXPLICIT_EXECUTION_PATTERN =
    /(삭제해|이동해|바꿔줘|변경해|적용해|생성해|만들어줘|추가해|삽입해|내보내기\s*해줘|export\s+it|rename|delete|move)/i
const FEEDBACK_OVERRIDE_PATTERN = /피드백|검토|리뷰|봐줘|점검/i
const RELEASE_EDITORIAL_SCOPE_PATTERN = /출간\s*전에|출판\s*전에|epub\s*내보내기\s*전에/i
const RELEASE_EDITORIAL_ASK_PATTERN = /뭘|무엇|점검|확인/i
const BOOK_SCOPE_PATTERN =
    /(책\s*전체|전체\s*흐름|전체\s*구조|앞부분|초반부|중반부|후반부|결말|설정|세계관|복선|주인공|인물|캐릭터|장면이\s*앞|앞\s*장면|이전\s*장면|일관성|일관돼|충돌|반복|페이싱|pacing|비교|같이\s*봐|다른\s*페이지|다른\s*챕터|다른\s*장)/i
const PAGE_SCOPE_PATTERN = /(이\s*페이지|현재\s*페이지|이\s*문단|선택한\s*문장|선택한\s*문단)/i
const SELECTION_PATTERN = /(선택|선택한|selected|selection)\s*(문단|문장|텍스트|본문)?/i
const REWRITE_VERB_PATTERN = /(다듬어|교정해|재작성해|rewrite|rephrase|edit|polish|고쳐줘)/i

function normalizePrompt(prompt: string): string {
    return String(prompt ?? '').trim()
}

function matchesProductGuidance(prompt: string): boolean {
    return PRODUCT_GUIDE_QUESTION_PATTERN.test(prompt) && PRODUCT_GUIDE_FEATURE_PATTERN.test(prompt)
}

function matchesNextAction(prompt: string): boolean {
    return NEXT_ACTION_PATTERN.test(prompt)
}

function matchesReleaseEditorialCheck(prompt: string): boolean {
    return RELEASE_EDITORIAL_SCOPE_PATTERN.test(prompt) && RELEASE_EDITORIAL_ASK_PATTERN.test(prompt)
}

function matchesBookContextReview(prompt: string): boolean {
    return BOOK_SCOPE_PATTERN.test(prompt) && EDITORIAL_ASK_PATTERN.test(prompt) && !PAGE_SCOPE_PATTERN.test(prompt)
}

function matchesEditorialSupport(prompt: string): boolean {
    if (EXPLICIT_EXECUTION_PATTERN.test(prompt) && !FEEDBACK_OVERRIDE_PATTERN.test(prompt)) {
        return false
    }
    if (matchesReleaseEditorialCheck(prompt)) {
        return true
    }
    return EDITORIAL_TOPIC_PATTERN.test(prompt) && EDITORIAL_ASK_PATTERN.test(prompt)
}

function matchesDirectSelectionRewrite(context: AgentV3RuleContext): boolean {
    return context.hasSelection && SELECTION_PATTERN.test(context.prompt) && REWRITE_VERB_PATTERN.test(context.prompt)
}

const PRIORITY_RULES: AgentV3PriorityRule[] = [
    {
        id: 'direct-selection-rewrite',
        result: {
            route: 'command',
            intent: 'rewrite_selection',
            ruleVersion: 'direct-selection-rewrite',
            confidence: 0.91,
            reason: 'direct-selection-rewrite',
        },
        matches: matchesDirectSelectionRewrite,
    },
    {
        id: 'agent-v3-product-guide',
        result: {
            route: 'chat',
            intent: null,
            ruleVersion: 'agent-v3-product-guide',
            confidence: 0.95,
            reason: 'agent-v3-product-guide',
        },
        matches: ({ prompt }) => matchesProductGuidance(prompt),
    },
    {
        id: 'agent-v3-next-action',
        result: {
            route: 'chat',
            intent: null,
            ruleVersion: 'agent-v3-next-action',
            confidence: 0.94,
            reason: 'agent-v3-next-action',
        },
        matches: ({ prompt }) => matchesNextAction(prompt),
    },
    {
        id: 'agent-v3-book-context-review',
        result: {
            route: 'chat',
            intent: null,
            ruleVersion: 'agent-v3-book-context-review',
            confidence: 0.93,
            reason: 'agent-v3-book-context-review',
        },
        matches: ({ prompt }) => matchesBookContextReview(prompt),
    },
    {
        id: 'agent-v3-editorial-support',
        result: {
            route: 'chat',
            intent: null,
            ruleVersion: 'agent-v3-editorial-support',
            confidence: 0.92,
            reason: 'agent-v3-editorial-support',
        },
        matches: ({ prompt }) => matchesEditorialSupport(prompt),
    },
]

const CHAT_MODE_RULES: AgentV3ChatModeRule[] = [
    {
        id: 'release_editorial_check',
        matches: ({ prompt }) => matchesReleaseEditorialCheck(prompt),
    },
    {
        id: 'product_guidance',
        matches: ({ prompt }) => matchesProductGuidance(prompt),
    },
    {
        id: 'next_action_coach',
        matches: ({ prompt }) => matchesNextAction(prompt),
    },
    {
        id: 'book_context_review',
        matches: ({ prompt }) => matchesBookContextReview(prompt),
    },
    {
        id: 'editorial_support',
        matches: ({ prompt }) => matchesEditorialSupport(prompt),
    },
]

export function resolveAgentV3PriorityRoute(input: AgentV3PriorityRouteInput): AgentV3PriorityRouteResult | null {
    const prompt = normalizePrompt(input.prompt)
    if (!prompt) return null

    const context: AgentV3RuleContext = {
        prompt,
        hasSelection: input.hasSelection,
    }
    const matchedRule = PRIORITY_RULES.find((rule) => rule.matches(context))
    if (!matchedRule) return null

    return {
        ...matchedRule.result,
        normalizedPrompt: prompt,
    }
}

export function resolveAgentV3ChatMode(prompt: string): AgentV3ChatMode | null {
    const normalizedPrompt = normalizePrompt(prompt)
    if (!normalizedPrompt) return null

    const context: AgentV3RuleContext = {
        prompt: normalizedPrompt,
        hasSelection: false,
    }
    return CHAT_MODE_RULES.find((rule) => rule.matches(context))?.id ?? null
}
