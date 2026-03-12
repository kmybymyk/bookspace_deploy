import type { AiCommandEnvelope } from '../../../shared/aiCommandSchema'
import type { CopilotRiskLevel } from './rightPaneTypes'

export function shouldSkipPreviewReview(input: {
    envelope: AiCommandEnvelope | null
    riskLevel?: CopilotRiskLevel | null
    activeChapterId?: string | null
}): boolean {
    const { envelope, riskLevel, activeChapterId } = input
    if (!envelope || envelope.commands.length === 0) return false
    if (riskLevel === 'high') return false

    const isSamePageCommand = (chapterId?: string | null) => {
        const normalizedTarget = String(chapterId ?? '').trim()
        const normalizedActive = String(activeChapterId ?? '').trim()
        if (!normalizedTarget || !normalizedActive) return false
        return normalizedTarget === normalizedActive
    }

    return envelope.commands.every((command) => {
        if (command.type === 'rewrite_selection') {
            return isSamePageCommand(command.target.chapterId)
        }
        if (command.type === 'append_text') {
            return isSamePageCommand(command.target.chapterId)
        }
        if (command.type === 'rename_chapter') {
            return isSamePageCommand(command.target.chapterId)
        }
        if (command.type === 'find_replace') {
            return (
                command.target.scope === 'chapter' &&
                command.payload.mode === 'one' &&
                isSamePageCommand(command.target.chapterId)
            )
        }
        return false
    })
}
