import type { TFunction } from 'i18next'
import type {
    CopilotAgentGoal,
    CopilotAgentStep,
    CopilotAgentTask,
    CopilotCheckResult,
    CopilotEvaluationResult,
    CopilotMemoryNote,
    CopilotSessionMemory,
} from './rightPaneTypes'
interface RightPaneAgentProgressCardProps {
    t: TFunction
    goal: CopilotAgentGoal | null
    steps: CopilotAgentStep[]
    tasks: CopilotAgentTask[]
    memoryNotes: CopilotMemoryNote[]
    sessionMemory: CopilotSessionMemory
    lastCheck: CopilotCheckResult | null
    lastEvaluation: CopilotEvaluationResult | null
}

function stepTone(status: CopilotAgentStep['status']): string {
    if (status === 'completed') return 'border-emerald-700/40 bg-emerald-950/20 text-emerald-100'
    if (status === 'in_progress') return 'border-sky-700/40 bg-sky-950/20 text-sky-100'
    if (status === 'ready') return 'border-violet-700/40 bg-violet-950/20 text-violet-100'
    if (status === 'blocked') return 'border-rose-700/40 bg-rose-950/20 text-rose-100'
    return 'border-neutral-700 bg-neutral-900/70 text-neutral-300'
}

function checkTone(status: CopilotCheckResult['status']): string {
    if (status === 'passed') return 'border-emerald-700/40 bg-emerald-950/20 text-emerald-100'
    if (status === 'warning') return 'border-amber-700/40 bg-amber-950/20 text-amber-100'
    return 'border-neutral-700 bg-neutral-900/70 text-neutral-300'
}

function stepStatusLabel(status: CopilotAgentStep['status'], t: TFunction): string {
    if (status === 'completed') return t('rightPane.agentStepStatusCompleted')
    if (status === 'in_progress') return t('rightPane.agentStepStatusInProgress')
    if (status === 'ready') return t('rightPane.agentStepStatusReady')
    if (status === 'blocked') return t('rightPane.agentStepStatusBlocked')
    return t('rightPane.agentStepStatusPending')
}

function taskTone(status: CopilotAgentTask['status']): string {
    if (status === 'completed') return 'border-emerald-700/40 bg-emerald-950/20 text-emerald-100'
    if (status === 'in_progress') return 'border-sky-700/40 bg-sky-950/20 text-sky-100'
    if (status === 'ready') return 'border-violet-700/40 bg-violet-950/20 text-violet-100'
    if (status === 'blocked') return 'border-rose-700/40 bg-rose-950/20 text-rose-100'
    return 'border-neutral-700 bg-neutral-900/70 text-neutral-300'
}

function taskTypeLabel(type: CopilotAgentTask['type'], t: TFunction): string {
    if (type === 'write') return t('rightPane.agentTaskTypeWrite')
    if (type === 'validate') return t('rightPane.agentTaskTypeValidate')
    if (type === 'ask_user') return t('rightPane.agentTaskTypeAskUser')
    return t('rightPane.agentTaskTypeRead')
}

function policyLabel(policy: CopilotAgentTask['policy'], t: TFunction): string {
    if (policy === 'review_required') return t('rightPane.agentPolicyReview')
    if (policy === 'explicit_high_risk') return t('rightPane.agentPolicyHighRisk')
    if (policy === 'ask_user') return t('rightPane.agentPolicyAskUser')
    return t('rightPane.agentPolicyAuto')
}

function toolLabel(toolId: string, t: TFunction): string {
    if (toolId === 'chapter_context_scan') return t('rightPane.tool.chapterContextScan')
    if (toolId === 'page_structure_read') return t('rightPane.tool.pageStructureRead')
    if (toolId === 'current_block_read') return t('rightPane.tool.currentBlockRead')
    if (toolId === 'command_planner') return t('rightPane.tool.commandPlanner')
    if (toolId === 'review_gate') return t('rightPane.tool.reviewGate')
    if (toolId === 'command_apply') return t('rightPane.tool.commandApply')
    if (toolId === 'current_block_write') return t('rightPane.tool.currentBlockWrite')
    if (toolId === 'snapshot_checkpoint') return t('rightPane.tool.snapshotCheckpoint')
    if (toolId === 'page_content_validate') return t('rightPane.tool.pageContentValidate')
    return t('rightPane.tool.postApplyCheck')
}

export function RightPaneAgentProgressCard({
    t,
    goal,
    steps,
    tasks,
    memoryNotes,
    sessionMemory,
    lastCheck,
    lastEvaluation,
}: RightPaneAgentProgressCardProps) {
    if (
        !goal &&
        steps.length === 0 &&
        tasks.length === 0 &&
        memoryNotes.length === 0 &&
        !lastCheck &&
        !lastEvaluation
    ) {
        return null
    }

    return (
        <div className="rounded-2xl border border-neutral-800/90 bg-[linear-gradient(180deg,rgba(18,24,34,0.94),rgba(10,13,18,0.98))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
                {t('rightPane.agentGoalTitle')}
            </div>

            {goal ? (
                <div className="mt-3 rounded-2xl border border-neutral-800 bg-neutral-950/55 p-3">
                    <div className="text-sm font-semibold text-neutral-50">{goal.summary}</div>
                    <div className="mt-1 text-xs leading-5 text-neutral-400">{goal.outcome}</div>
                </div>
            ) : null}

            {steps.length > 0 ? (
                <div className="mt-3 space-y-2">
                    {steps.map((step) => (
                        <div
                            key={step.id}
                            className={`rounded-xl border px-3 py-2.5 ${stepTone(step.status)}`}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <div className="text-sm font-medium leading-5">{step.title}</div>
                                    <div className="mt-1 text-xs leading-5 opacity-85">{step.detail}</div>
                                </div>
                                <div className="flex shrink-0 flex-col items-end gap-1">
                                    <span className="rounded-full border border-current/15 bg-black/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-current/90">
                                        {stepStatusLabel(step.status, t)}
                                    </span>
                                    {step.requiresApproval ? (
                                        <span className="text-[10px] uppercase tracking-[0.08em] text-current/70">
                                            {t('rightPane.agentApprovalRequired')}
                                        </span>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : null}

            {tasks.length > 0 ? (
                <div className="mt-3 rounded-2xl border border-neutral-800 bg-neutral-950/50 p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
                        {t('rightPane.agentTasksTitle')}
                    </div>
                    <div className="mt-3 space-y-2">
                        {tasks.map((task) => (
                            <div key={task.id} className={`rounded-xl border px-3 py-2.5 ${taskTone(task.status)}`}>
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <div className="text-sm font-medium leading-5">{task.title}</div>
                                        <div className="mt-1 text-xs leading-5 opacity-85">{task.detail}</div>
                                    </div>
                                    <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                                        <span className="rounded-full border border-current/15 bg-black/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-current/90">
                                            {taskTypeLabel(task.type, t)}
                                        </span>
                                        <span className="text-[10px] uppercase tracking-[0.08em] text-current/70">
                                            {policyLabel(task.policy, t)}
                                        </span>
                                    </div>
                                </div>
                                {task.toolIds && task.toolIds.length > 0 ? (
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                        {task.toolIds.map((toolId) => (
                                            <span
                                                key={`${task.id}-${toolId}`}
                                                className="rounded-full border border-current/15 bg-black/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.06em] text-current/80"
                                            >
                                                {toolLabel(toolId, t)}
                                            </span>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}

            {memoryNotes.length > 0 ? (
                <div className="mt-3 rounded-2xl border border-neutral-800 bg-neutral-950/50 p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
                        {t('rightPane.agentMemoryTitle')}
                    </div>
                    <div className="mt-3 space-y-2">
                        {memoryNotes.map((note) => (
                            <div key={note.id} className="rounded-xl border border-neutral-800 bg-neutral-900/75 px-3 py-2">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
                                    {note.label}
                                </div>
                                <div className="mt-1 text-sm leading-5 text-neutral-200">{note.detail}</div>
                            </div>
                        ))}
                    </div>
                    {sessionMemory.preferredTone || sessionMemory.lastApprovedIntent || sessionMemory.unresolvedChecks.length > 0 ? (
                        <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-900/70 px-3 py-2">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
                                {t('rightPane.agentSessionMemoryTitle')}
                            </div>
                            <div className="mt-2 space-y-1 text-xs leading-5 text-neutral-300">
                                {sessionMemory.preferredTone ? (
                                    <div>{t('rightPane.agentSessionTone', { tone: sessionMemory.preferredTone })}</div>
                                ) : null}
                                {sessionMemory.lastApprovedIntent ? (
                                    <div>{t('rightPane.agentSessionLastIntent', { intent: sessionMemory.lastApprovedIntent })}</div>
                                ) : null}
                                {sessionMemory.unresolvedChecks.slice(0, 2).map((item) => (
                                    <div key={item}>{t('rightPane.agentSessionUnresolved', { item })}</div>
                                ))}
                            </div>
                        </div>
                    ) : null}
                </div>
            ) : null}

            {lastCheck ? (
                <div className={`mt-3 rounded-2xl border p-3 ${checkTone(lastCheck.status)}`}>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-current/75">
                        {t('rightPane.agentCheckTitle')}
                    </div>
                    <div className="mt-2 text-sm font-medium leading-5 text-current">{lastCheck.summary}</div>
                    {lastCheck.detail ? (
                        <div className="mt-1 text-xs leading-5 text-current/85">{lastCheck.detail}</div>
                    ) : null}
                </div>
            ) : null}

            {lastEvaluation ? (
                <div className="mt-3 rounded-2xl border border-neutral-800 bg-neutral-950/55 p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
                        {t('rightPane.agentEvaluationTitle')}
                    </div>
                    <div className="mt-2 text-sm font-medium text-neutral-100">{lastEvaluation.summary}</div>
                    {lastEvaluation.detail ? (
                        <div className="mt-1 text-xs leading-5 text-neutral-400">{lastEvaluation.detail}</div>
                    ) : null}
                    {lastEvaluation.recommendedNextAction ? (
                        <div className="mt-2 rounded-xl border border-neutral-800 bg-neutral-900/75 px-3 py-2 text-xs leading-5 text-neutral-200">
                            {lastEvaluation.recommendedNextAction}
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    )
}
