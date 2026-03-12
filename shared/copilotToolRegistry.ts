import type { CopilotIntent } from './copilotIpc'

export type CopilotToolKind = 'read' | 'write' | 'validate'

export interface CopilotToolDescriptor {
    id: string
    kind: CopilotToolKind
    label: string
    description: string
}

export const COPILOT_TOOL_REGISTRY: Record<string, CopilotToolDescriptor> = {
    chapter_context_scan: {
        id: 'chapter_context_scan',
        kind: 'read',
        label: 'Chapter Context Scan',
        description: 'Reads the active chapter, selection, and nearby structure before planning.',
    },
    page_structure_read: {
        id: 'page_structure_read',
        kind: 'read',
        label: 'Page Structure Read',
        description: 'Reads top-level blocks, headings, and current page shape before planning.',
    },
    current_block_read: {
        id: 'current_block_read',
        kind: 'read',
        label: 'Current Block Read',
        description: 'Reads the active block around the cursor before writing into the page.',
    },
    command_planner: {
        id: 'command_planner',
        kind: 'validate',
        label: 'Command Planner',
        description: 'Turns the user goal into reviewable command candidates.',
    },
    review_gate: {
        id: 'review_gate',
        kind: 'validate',
        label: 'Review Gate',
        description: 'Pauses for approval when policy or risk requires review.',
    },
    command_apply: {
        id: 'command_apply',
        kind: 'write',
        label: 'Command Apply',
        description: 'Applies the approved command envelope into the editor state.',
    },
    snapshot_checkpoint: {
        id: 'snapshot_checkpoint',
        kind: 'write',
        label: 'Snapshot Checkpoint',
        description: 'Creates a recovery point before mutations.',
    },
    post_apply_check: {
        id: 'post_apply_check',
        kind: 'validate',
        label: 'Post-Apply Check',
        description: 'Reviews warnings, recovery availability, and next actions after apply.',
    },
    page_content_validate: {
        id: 'page_content_validate',
        kind: 'validate',
        label: 'Page Validation',
        description: 'Checks the current page for empty or structurally weak content after writing.',
    },
    current_block_write: {
        id: 'current_block_write',
        kind: 'write',
        label: 'Current Block Write',
        description: 'Inserts or replaces prose around the active block instead of appending only at page end.',
    },
}

export function resolveIntentToolIds(intent: CopilotIntent): string[] {
    const base = [
        'chapter_context_scan',
        'page_structure_read',
        'current_block_read',
        'command_planner',
        'review_gate',
        'command_apply',
        'current_block_write',
        'post_apply_check',
        'page_content_validate',
    ]
    if (intent === 'delete_chapter' || intent === 'restore_snapshot' || intent === 'move_chapter') {
        return [
            'chapter_context_scan',
            'page_structure_read',
            'current_block_read',
            'command_planner',
            'review_gate',
            'snapshot_checkpoint',
            'command_apply',
            'current_block_write',
            'post_apply_check',
            'page_content_validate',
        ]
    }
    if (intent === 'save_project' || intent === 'export_project') {
        return ['chapter_context_scan', 'page_structure_read', 'command_planner', 'review_gate', 'command_apply', 'post_apply_check']
    }
    return base
}
