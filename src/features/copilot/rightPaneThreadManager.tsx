import { Pencil, Trash2 } from 'lucide-react'
import type { TFunction } from 'i18next'
import type { CopilotThreadState } from './rightPaneTypes'
import { isDraftThread } from './rightPaneThreadStorage'

interface RightPaneThreadManagerProps {
    t: TFunction
    shouldShowThreadManager: boolean
    copilotThreads: CopilotThreadState[]
    activeThreadId: string | undefined
    threadRenamingId: string | null
    threadRenameDraft: string
    setThreadRenameDraft: (value: string) => void
    setThreadRenamingId: (id: string | null) => void
    renameThread: (threadId: string, title: string) => void
    setActiveThreadId: (threadId: string) => void
    requestDeleteThread: (thread: CopilotThreadState) => void
    formatThreadUpdatedAt: (value: string) => string
}

export function RightPaneThreadManager({
    t,
    shouldShowThreadManager,
    copilotThreads,
    activeThreadId,
    threadRenamingId,
    threadRenameDraft,
    setThreadRenameDraft,
    setThreadRenamingId,
    renameThread,
    setActiveThreadId,
    requestDeleteThread,
    formatThreadUpdatedAt,
}: RightPaneThreadManagerProps) {
    return (
        <>
            {shouldShowThreadManager ? (
                <div className="space-y-2">
                    <div className="rounded border border-neutral-700 bg-neutral-800/40 px-2 py-2">
                        <div className="max-h-36 overflow-auto space-y-1.5 pr-1">
                            {copilotThreads.slice(0, 12).map((thread) => (
                                <div
                                    key={`thread-list-${thread.id}`}
                                    className={`group rounded border px-2 py-1.5 ${
                                        thread.id === activeThreadId
                                            ? 'border-sky-700/60 bg-sky-900/30 text-sky-100'
                                            : 'border-neutral-700 bg-neutral-900/70 text-neutral-300'
                                    }`}
                                >
                                    <div className="flex items-center gap-1">
                                        {threadRenamingId === thread.id ? (
                                            <input
                                                value={threadRenameDraft}
                                                onChange={(event) => setThreadRenameDraft(event.target.value)}
                                                onKeyDown={(event) => {
                                                    if (event.key === 'Enter') {
                                                        renameThread(thread.id, threadRenameDraft)
                                                        setThreadRenamingId(null)
                                                    }
                                                }}
                                                className="flex-1 rounded border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 text-xs text-neutral-100"
                                            />
                                        ) : (
                                            <button
                                                onClick={() => setActiveThreadId(thread.id)}
                                                className="flex-1 truncate text-left text-xs font-medium"
                                            >
                                                {isDraftThread(thread) ? t('rightPane.threadNew') : thread.title}
                                            </button>
                                        )}
                                        <button
                                            onClick={() => {
                                                setThreadRenamingId(thread.id)
                                                setThreadRenameDraft(thread.title)
                                            }}
                                            title={t('rightPane.threadRename')}
                                            className="h-5 w-5 rounded text-neutral-400 hover:text-white opacity-0 group-hover:opacity-100 flex items-center justify-center"
                                        >
                                            <Pencil size={11} />
                                        </button>
                                        <button
                                            onClick={() => requestDeleteThread(thread)}
                                            title={t('rightPane.threadDelete')}
                                            className="h-5 w-5 rounded text-neutral-400 hover:text-rose-300 opacity-0 group-hover:opacity-100 flex items-center justify-center"
                                        >
                                            <Trash2 size={11} />
                                        </button>
                                    </div>
                                    {!isDraftThread(thread) ? (
                                        <div className="text-[9px] opacity-75">
                                            {formatThreadUpdatedAt(thread.updatedAt)}
                                        </div>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ) : null}
        </>
    )
}
