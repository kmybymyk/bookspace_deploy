import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useDroppable,
    useSensor,
    useSensors,
    DragEndEvent,
} from '@dnd-kit/core'
import {
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useChapterStore } from '../useChapterStore'
import { Chapter, ChapterType } from '../../../types/project'
import { ChevronDown, ChevronRight, GripVertical, Trash2, Check, ListTree, Lightbulb, Sparkles, CircleHelp } from 'lucide-react'
import ConfirmDialog from '../../../components/ui/ConfirmDialog'
import i18n from '../../../i18n'

type FolderType = 'front' | 'body' | 'back'
type ConvertKey = string

type TreeRow =
    | { kind: 'folder'; id: string; label: string; depth: number; folderType: FolderType }
    | { kind: 'folder-drop'; id: string; folderType: FolderType }
    | { kind: 'chapter'; id: string; depth: number; chapter: Chapter; expandable: boolean }

type ConvertOption = {
    key: ConvertKey
    label: string
    description: string
    chapterType: ChapterType
    section: FolderType | 'uncategorized'
}

function buildConvertGroups(): Array<{ title: string; items: ConvertOption[] }> {
    return [
        {
            title: i18n.t('chapterList.convertGroups.uncategorized'),
            items: [{ key: 'uncategorized', label: i18n.t('chapterList.kinds.uncategorized'), description: i18n.t('chapterList.descriptions.uncategorized'), chapterType: 'uncategorized', section: 'uncategorized' }],
        },
        {
            title: i18n.t('chapterList.convertGroups.front'),
            items: [
                { key: 'blurbs', label: i18n.t('chapterList.kinds.blurbs'), description: i18n.t('chapterList.descriptions.blurbs'), chapterType: 'front', section: 'front' },
                { key: 'copyright', label: i18n.t('chapterList.kinds.copyright'), description: i18n.t('chapterList.descriptions.copyright'), chapterType: 'front', section: 'front' },
                { key: 'dedication', label: i18n.t('chapterList.kinds.dedication'), description: i18n.t('chapterList.descriptions.dedication'), chapterType: 'front', section: 'front' },
                { key: 'epigraph', label: i18n.t('chapterList.kinds.epigraph'), description: i18n.t('chapterList.descriptions.epigraph'), chapterType: 'front', section: 'front' },
                { key: 'foreword', label: i18n.t('chapterList.kinds.foreword'), description: i18n.t('chapterList.descriptions.foreword'), chapterType: 'front', section: 'front' },
                { key: 'introduction', label: i18n.t('chapterList.kinds.introduction'), description: i18n.t('chapterList.descriptions.introduction'), chapterType: 'front', section: 'front' },
                { key: 'preface', label: i18n.t('chapterList.kinds.preface'), description: i18n.t('chapterList.descriptions.preface'), chapterType: 'front', section: 'front' },
                { key: 'prologue', label: i18n.t('chapterList.kinds.prologue'), description: i18n.t('chapterList.descriptions.prologue'), chapterType: 'front', section: 'front' },
                { key: 'title-page', label: i18n.t('chapterList.kinds.titlePage'), description: i18n.t('chapterList.descriptions.titlePage'), chapterType: 'front', section: 'front' },
            ],
        },
        {
            title: i18n.t('chapterList.convertGroups.body'),
            items: [
                { key: 'part', label: i18n.t('chapterList.kinds.part'), description: i18n.t('chapterList.descriptions.part'), chapterType: 'part', section: 'body' },
                { key: 'chapter', label: i18n.t('chapterList.kinds.chapterBody'), description: i18n.t('chapterList.descriptions.chapterBody'), chapterType: 'chapter', section: 'body' },
                { key: 'divider', label: i18n.t('chapterList.kinds.divider'), description: i18n.t('chapterList.descriptions.divider'), chapterType: 'divider', section: 'body' },
            ],
        },
        {
            title: i18n.t('chapterList.convertGroups.back'),
            items: [
                { key: 'epilogue', label: i18n.t('chapterList.kinds.epilogue'), description: i18n.t('chapterList.descriptions.epilogue'), chapterType: 'back', section: 'back' },
                { key: 'afterword', label: i18n.t('chapterList.kinds.afterword'), description: i18n.t('chapterList.descriptions.afterword'), chapterType: 'back', section: 'back' },
                { key: 'bibliography', label: i18n.t('chapterList.kinds.bibliography'), description: i18n.t('chapterList.descriptions.bibliography'), chapterType: 'back', section: 'back' },
                { key: 'acknowledgments', label: i18n.t('chapterList.kinds.acknowledgments'), description: i18n.t('chapterList.descriptions.acknowledgments'), chapterType: 'back', section: 'back' },
                { key: 'about-author', label: i18n.t('chapterList.kinds.aboutAuthor'), description: i18n.t('chapterList.descriptions.aboutAuthor'), chapterType: 'back', section: 'back' },
                { key: 'also-by', label: i18n.t('chapterList.kinds.alsoBy'), description: i18n.t('chapterList.descriptions.alsoBy'), chapterType: 'back', section: 'back' },
            ],
        },
    ]
}

function buildKindLabels(): Record<string, string> {
    return {
        uncategorized: i18n.t('chapterList.kinds.uncategorized'),
        part: i18n.t('chapterList.kinds.part'),
        chapter: i18n.t('chapterList.kinds.chapterBody'),
        divider: i18n.t('chapterList.kinds.divider'),
        blurbs: i18n.t('chapterList.kinds.blurbs'),
        copyright: i18n.t('chapterList.kinds.copyright'),
        dedication: i18n.t('chapterList.kinds.dedication'),
        epigraph: i18n.t('chapterList.kinds.epigraph'),
        foreword: i18n.t('chapterList.kinds.foreword'),
        introduction: i18n.t('chapterList.kinds.introduction'),
        preface: i18n.t('chapterList.kinds.preface'),
        prologue: i18n.t('chapterList.kinds.prologue'),
        'title-page': i18n.t('chapterList.kinds.titlePage'),
        epilogue: i18n.t('chapterList.kinds.epilogue'),
        afterword: i18n.t('chapterList.kinds.afterword'),
        bibliography: i18n.t('chapterList.kinds.bibliography'),
        acknowledgments: i18n.t('chapterList.kinds.acknowledgments'),
        'about-author': i18n.t('chapterList.kinds.aboutAuthor'),
        'also-by': i18n.t('chapterList.kinds.alsoBy'),
    }
}

function chapterTypeOf(chapter: Chapter): ChapterType {
    return chapter.chapterType ?? 'chapter'
}
function sectionOfChapter(chapter: Chapter): FolderType | 'uncategorized' {
    const type = chapterTypeOf(chapter)
    if (type === 'front') return 'front'
    if (type === 'back') return 'back'
    if (type === 'uncategorized') return 'uncategorized'
    return 'body'
}

function typeLabelOf(chapter: Chapter): string {
    const kindLabels = buildKindLabels()
    if (chapter.chapterKind && kindLabels[chapter.chapterKind]) {
        return kindLabels[chapter.chapterKind]
    }
    const type = chapterTypeOf(chapter)
    if (type === 'part') return i18n.t('chapterList.kinds.part')
    if (type === 'chapter') return i18n.t('chapterList.kinds.chapterBody')
    if (type === 'divider') return i18n.t('chapterList.kinds.divider')
    if (type === 'front') return i18n.t('chapterList.kinds.frontDocument')
    if (type === 'back') return i18n.t('chapterList.kinds.backDocument')
    return i18n.t('chapterList.kinds.uncategorized')
}

function buildRows(chapters: Chapter[], expanded: Record<string, boolean>): TreeRow[] {
    const rows: TreeRow[] = []
    const byId = new Map(chapters.map((c) => [c.id, c]))
    const hasValidPartParent = (chapter: Chapter) => {
        if (!chapter.parentId) return false
        const parent = byId.get(chapter.parentId)
        return Boolean(parent && chapterTypeOf(parent) === 'part')
    }

    const topFront = chapters.filter((c) => chapterTypeOf(c) === 'front' && !hasValidPartParent(c))
    const topBack = chapters.filter((c) => chapterTypeOf(c) === 'back' && !hasValidPartParent(c))
    const topBody = chapters.filter(
        (c) => chapterTypeOf(c) !== 'front' && chapterTypeOf(c) !== 'back' && !hasValidPartParent(c),
    )
    const childrenByParent = new Map<string, Chapter[]>()

    for (const chapter of chapters) {
        if (!hasValidPartParent(chapter) || typeof chapter.parentId !== 'string') continue
        const arr = childrenByParent.get(chapter.parentId) ?? []
        arr.push(chapter)
        childrenByParent.set(chapter.parentId, arr)
    }

    const pushChapter = (chapter: Chapter, depth: number) => {
        const chapterType = chapterTypeOf(chapter)
        const children = childrenByParent.get(chapter.id) ?? []
        const expandable = chapterType === 'part'
        rows.push({ kind: 'chapter', id: chapter.id, depth, chapter, expandable })
        if (expandable && expanded[chapter.id] !== false) {
            for (const child of children) {
                pushChapter(child, depth + 1)
            }
        }
    }

    rows.push({ kind: 'folder', id: 'folder-front', label: i18n.t('chapterList.folders.front'), depth: 0, folderType: 'front' })
    for (const chapter of topFront) pushChapter(chapter, 1)

    rows.push({ kind: 'folder', id: 'folder-body', label: i18n.t('chapterList.folders.body'), depth: 0, folderType: 'body' })
    for (const chapter of topBody) pushChapter(chapter, 1)
    rows.push({ kind: 'folder-drop', id: 'folder-body-end', folderType: 'body' })

    rows.push({ kind: 'folder', id: 'folder-back', label: i18n.t('chapterList.folders.back'), depth: 0, folderType: 'back' })
    for (const chapter of topBack) pushChapter(chapter, 1)

    return rows
}

function FolderRow({ row }: { row: Extract<TreeRow, { kind: 'folder' }> }) {
    const { isOver, setNodeRef } = useDroppable({ id: row.id })
    const helperText =
        row.folderType === 'front'
            ? i18n.t('chapterList.folderHints.front')
            : row.folderType === 'body'
                ? i18n.t('chapterList.folderHints.body')
                : i18n.t('chapterList.folderHints.back')
    return (
        <div
            ref={setNodeRef}
            className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-xs font-semibold ${
                isOver
                    ? 'bg-[var(--ds-fill-info-weak)] text-[var(--ds-text-info-default)] ring-1 ring-[var(--ds-border-info-weak)]'
                    : 'text-[var(--ds-text-neutral-muted)]'
                }`}
        >
            <span className="inline-flex items-center gap-1.5">
                <span>{row.label}</span>
                <span
                    className="inline-flex h-4 w-4 items-center justify-center rounded text-[var(--ds-text-neutral-muted)] hover:text-[var(--ds-text-neutral-secondary)]"
                    title={helperText}
                    aria-label={helperText}
                >
                    <CircleHelp size={12} />
                </span>
            </span>
        </div>
    )
}

function FolderDropRow({ row }: { row: Extract<TreeRow, { kind: 'folder-drop' }> }) {
    const { isOver, setNodeRef } = useDroppable({ id: row.id })
    return (
        <div
            ref={setNodeRef}
            className={`mx-1 rounded-md transition-all ${
                isOver
                    ? 'h-5 bg-[var(--ds-fill-info-weak)] ring-1 ring-[var(--ds-border-info-weak)]'
                    : 'h-1 bg-transparent'
            }`}
            title={row.folderType === 'body' ? i18n.t('chapterList.bodyDropHint') : ''}
        />
    )
}

function SortableChapterRow({
    row,
    isActive,
    expanded,
    isFirstChild,
    onToggleExpand,
    onOpenConvert,
    pathLabel,
    onRequestDelete,
    registerConvertTrigger,
}: {
    row: Extract<TreeRow, { kind: 'chapter' }>
    isActive: boolean
    expanded: boolean
    isFirstChild: boolean
    onToggleExpand: () => void
    onOpenConvert: (triggerEl: HTMLButtonElement) => void
    pathLabel: string
    onRequestDelete: (chapterId: string) => void
    registerConvertTrigger: (el: HTMLButtonElement | null) => void
}) {
    const { setActiveChapter, renameChapter } = useChapterStore()
    const [isEditingTitle, setIsEditingTitle] = useState(false)
    const [draftTitle, setDraftTitle] = useState('')
    const chapter = row.chapter
    const chapterType = chapterTypeOf(chapter)
    const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({
        id: chapter.id,
    })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : 1,
        paddingLeft: `${row.depth <= 1 ? 12 : 12 + (row.depth - 1) * 8}px`,
    }
    const isPart = chapterType === 'part'
    const isChild = row.depth > 1

    const handleRenameStart = () => {
        setDraftTitle(chapter.title)
        setIsEditingTitle(true)
    }

    const handleRenameCommit = () => {
        const nextTitle = draftTitle.trim()
        if (nextTitle && nextTitle !== chapter.title) {
            renameChapter(chapter.id, nextTitle)
        }
        setIsEditingTitle(false)
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            onClick={() => setActiveChapter(chapter.id)}
            aria-current={isActive ? 'page' : undefined}
            className={`group flex w-full items-center gap-0.5 rounded-md py-1.5 pr-3 text-left transition-all duration-150 ${isActive
                ? 'bg-[var(--ds-fill-info-weak)] text-[var(--ds-text-info-default)] ring-1 ring-[var(--ds-border-info-weak)]'
                : 'text-[var(--ds-text-neutral-secondary)] hover:bg-[var(--ds-fill-neutral-control)]'
                } ${isOver ? 'ring-2 ring-[var(--ds-border-info-weak)] bg-[color-mix(in_srgb,var(--ds-fill-info-weak)_72%,var(--ds-fill-neutral-card))]' : ''} ${isChild ? 'bg-[var(--ds-fill-neutral-card-alt)]' : ''} ${isChild && isFirstChild ? 'mt-1' : ''}`}
        >
            {row.expandable ? (
                <button
                    onClick={(e) => {
                        e.stopPropagation()
                        onToggleExpand()
                    }}
                    className="flex w-4 items-center justify-center p-0.5 text-[var(--ds-text-neutral-muted)] hover:text-[var(--ds-text-neutral-secondary)]"
                    title={expanded ? i18n.t('chapterList.actions.collapse') : i18n.t('chapterList.actions.expand')}
                >
                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
            ) : (
                <span className="w-3" />
            )}
            {isChild ? (
                <span className="w-6 shrink-0 pl-0.5 pr-2 text-xs text-[var(--ds-text-neutral-muted)]">└</span>
            ) : (
                <span className="w-2 shrink-0" />
            )}
            <span className={`min-w-0 flex-1 text-sm ${isPart ? 'font-semibold text-[var(--ds-text-neutral-primary)]' : ''}`} onDoubleClick={handleRenameStart}>
                {isEditingTitle ? (
                    <input
                        autoFocus
                        value={draftTitle}
                        onChange={(e) => setDraftTitle(e.target.value)}
                        onBlur={handleRenameCommit}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault()
                                handleRenameCommit()
                            }
                            if (e.key === 'Escape') {
                                e.preventDefault()
                                setIsEditingTitle(false)
                            }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full rounded border border-[var(--ds-border-neutral-default)] bg-[var(--ds-fill-neutral-control)] px-1 py-0.5 text-sm text-[var(--ds-text-neutral-primary)]"
                    />
                ) : (
                    <>
                        <span className="flex min-h-6 items-center gap-1.5">
                            <span className="block truncate leading-6">{chapter.title}</span>
                            {isActive ? (
                                <span className="inline-flex h-5 shrink-0 items-center rounded bg-[var(--ds-fill-info-weak)] px-1.5 text-[10px] font-semibold leading-none text-[var(--ds-text-info-default)]">
                                    {i18n.t('chapterList.currentBadge')}
                                </span>
                            ) : null}
                        </span>
                        <span className="block truncate text-xs leading-5 text-[var(--ds-text-neutral-muted)]">{pathLabel}</span>
                    </>
                )}
            </span>
            <button
                ref={registerConvertTrigger}
                onClick={(e) => {
                    e.stopPropagation()
                    onOpenConvert(e.currentTarget)
                }}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-[var(--ds-border-neutral-default)] bg-[var(--ds-fill-neutral-control)] text-[var(--ds-text-neutral-secondary)] transition-colors hover:bg-[var(--ds-fill-neutral-control-hover)] hover:text-[var(--ds-text-neutral-primary)]"
                title={i18n.t('chapterList.actions.changePageType')}
                aria-label={i18n.t('chapterList.actions.changePageType')}
            >
                <ListTree size={12} />
            </button>
            <span
                {...attributes}
                {...listeners}
                className="hidden cursor-grab items-center justify-center px-1 text-xs text-[var(--ds-text-neutral-muted)] opacity-70 hover:text-[var(--ds-text-neutral-secondary)] active:cursor-grabbing md:flex"
                onClick={(e) => e.stopPropagation()}
                title={i18n.t('chapterList.actions.dragToReorder')}
            >
                <GripVertical size={14} />
            </span>
            <button
                onClick={(e) => {
                    e.stopPropagation()
                    onRequestDelete(chapter.id)
                }}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded p-0 text-xs text-[var(--ds-text-neutral-muted)] opacity-70 transition-all hover:text-[var(--ds-text-danger-strong)] hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ds-border-danger-weak)]"
                title={i18n.t('chapterList.actions.deleteChapter')}
                aria-label={i18n.t('chapterList.actions.deleteChapter')}
            >
                <Trash2 size={14} />
            </button>
        </div>
    )
}

function isFrontType(type: ChapterType) {
    return type === 'front'
}
function isBackType(type: ChapterType) {
    return type === 'back'
}

function bodyDropTypeOf(activeType: ChapterType): ChapterType {
    if (activeType === 'part' || activeType === 'chapter' || activeType === 'divider') {
        return activeType
    }
    return 'chapter'
}

export default function ChapterList() {
    const { i18n: i18nClient } = useTranslation()
    const languageKey = i18nClient.resolvedLanguage ?? i18nClient.language
    const isKorean = languageKey.startsWith('ko')
    const { chapters, activeChapterId, addChapter, moveChapter, setChapterType, setChapterKind, deleteChapter } = useChapterStore()
    const [expanded, setExpanded] = useState<Record<string, boolean>>({})
    const [convertOpenId, setConvertOpenId] = useState<string | null>(null)
    const [convertMenuStyle, setConvertMenuStyle] = useState<{
        top: number
        left: number
        width: number
        maxHeight: number
    } | null>(null)
    const [dragHint, setDragHint] = useState<string | null>(null)
    const [pendingDeleteChapterId, setPendingDeleteChapterId] = useState<string | null>(null)
    const menuRef = useRef<HTMLDivElement | null>(null)
    const listViewportRef = useRef<HTMLDivElement | null>(null)
    const convertTriggerRefs = useRef(new Map<string, HTMLButtonElement>())

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    )

    const sorted = useMemo(() => [...chapters].sort((a, b) => a.order - b.order), [chapters])
    const chapterById = useMemo(() => new Map(sorted.map((c) => [c.id, c])), [sorted])
    const rows = buildRows(sorted, expanded)
    const convertGroups = buildConvertGroups()
    const visibleChapterIds = useMemo(
        () =>
            rows
                .filter((row): row is Extract<TreeRow, { kind: 'chapter' }> => row.kind === 'chapter')
                .map((row) => row.id),
        [rows],
    )

    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            if (!menuRef.current) return
            if (menuRef.current.contains(e.target as Node)) return
            setConvertOpenId(null)
        }
        document.addEventListener('mousedown', onClick)
        return () => document.removeEventListener('mousedown', onClick)
    }, [])

    useEffect(() => {
        if (!dragHint) return
        const t = window.setTimeout(() => setDragHint(null), 2200)
        return () => window.clearTimeout(t)
    }, [dragHint])

    const updateConvertMenuPosition = (chapterId: string) => {
        const trigger = convertTriggerRefs.current.get(chapterId)
        if (!trigger) return
        const viewportRect = listViewportRef.current?.getBoundingClientRect()
        const rect = trigger.getBoundingClientRect()
        const viewportPadding = 8
        const desiredWidth = 260
        const panelMaxWidth =
            viewportRect && viewportRect.width > 0
                ? Math.max(220, viewportRect.width - 20)
                : desiredWidth
        const width = Math.min(
            desiredWidth,
            panelMaxWidth,
            window.innerWidth - viewportPadding * 2,
        )
        const left = Math.min(
            Math.max(viewportPadding, rect.right - width),
            window.innerWidth - width - viewportPadding,
        )
        const downTop = rect.bottom + 6
        const downMaxHeight = window.innerHeight - downTop - viewportPadding
        if (downMaxHeight >= 220) {
            setConvertMenuStyle({
                top: downTop,
                left,
                width,
                maxHeight: Math.max(160, downMaxHeight),
            })
            return
        }
        const upMaxHeight = rect.top - viewportPadding - 6
        const menuHeight = Math.min(360, Math.max(160, upMaxHeight))
        setConvertMenuStyle({
            top: Math.max(viewportPadding, rect.top - menuHeight - 6),
            left,
            width,
            maxHeight: Math.max(160, upMaxHeight),
        })
    }

    useEffect(() => {
        if (!convertOpenId) {
            setConvertMenuStyle(null)
            return
        }
        updateConvertMenuPosition(convertOpenId)

        const handleReposition = () => {
            if (!convertOpenId) return
            updateConvertMenuPosition(convertOpenId)
        }

        const viewportEl = listViewportRef.current
        viewportEl?.addEventListener('scroll', handleReposition, { passive: true })
        window.addEventListener('resize', handleReposition)
        return () => {
            viewportEl?.removeEventListener('scroll', handleReposition)
            window.removeEventListener('resize', handleReposition)
        }
    }, [convertOpenId])

    const resolveDropTarget = (activeId: string, overId: string) => {
        const active = chapterById.get(activeId)
        if (!active) return null
        const activeType = chapterTypeOf(active)

        const overChapter = chapterById.get(overId)
        if (overChapter) {
            const overType = chapterTypeOf(overChapter)
            const overSection = sectionOfChapter(overChapter)

            if (overType === 'part' && activeType !== 'part') {
                const partIndex = sorted.findIndex((c) => c.id === overChapter.id)
                let insertAt = partIndex + 1
                while (insertAt < sorted.length && sorted[insertAt].parentId === overChapter.id) {
                    insertAt += 1
                }
                const activeParent = active.parentId ? chapterById.get(active.parentId) : null
                const activeParentIsSamePart =
                    activeParent && chapterTypeOf(activeParent) === 'part' && activeParent.id === overChapter.id
                return {
                    toIndex: insertAt,
                    parentId: activeParentIsSamePart ? null : (overChapter.id as string | null),
                    chapterType: bodyDropTypeOf(activeType),
                }
            }

            const parentId = overChapter.parentId ?? null
            const toIndex = sorted.findIndex((c) => c.id === overChapter.id)
            const chapterType =
                overSection === 'front'
                    ? ('front' as ChapterType)
                    : overSection === 'back'
                        ? ('back' as ChapterType)
                        : bodyDropTypeOf(activeType)
            return { toIndex, parentId, chapterType }
        }

        if (overId === 'folder-front') {
            const toIndex = sorted.findIndex((c) => !isFrontType(chapterTypeOf(c)))
            return { toIndex: toIndex < 0 ? sorted.length : toIndex, parentId: null, chapterType: 'front' as ChapterType }
        }

        if (overId === 'folder-back') {
            return { toIndex: sorted.length, parentId: null, chapterType: 'back' as ChapterType }
        }

        if (overId === 'folder-body') {
            const firstBack = sorted.findIndex((c) => isBackType(chapterTypeOf(c)))
            return {
                toIndex: firstBack < 0 ? sorted.length : firstBack,
                parentId: null,
                chapterType: bodyDropTypeOf(activeType),
            }
        }
        if (overId === 'folder-body-end') {
            const firstBack = sorted.findIndex((c) => isBackType(chapterTypeOf(c)))
            return {
                toIndex: firstBack < 0 ? sorted.length : firstBack,
                parentId: null,
                chapterType: bodyDropTypeOf(activeType),
            }
        }
        return null
    }

    const moveBySection = (chapterId: string, chapterType: ChapterType, section: FolderType | 'uncategorized') => {
        if (section === 'front') {
            const toIndex = sorted.findIndex((c) => !isFrontType(chapterTypeOf(c)))
            moveChapter(chapterId, toIndex < 0 ? sorted.length : toIndex, null)
            return
        }
        if (section === 'back') {
            moveChapter(chapterId, sorted.length, null)
            return
        }
        if (section === 'uncategorized') {
            const firstBack = sorted.findIndex((c) => isBackType(chapterTypeOf(c)))
            moveChapter(chapterId, firstBack < 0 ? sorted.length : firstBack, null)
            return
        }

        if (chapterType === 'chapter') {
            const current = chapterById.get(chapterId)
            const currentParent = current?.parentId ? chapterById.get(current.parentId) : null
            // Exclude the converting chapter itself, because it may still look like `part`
            // in the current render snapshot right before type update is committed.
            const bodyParts = sorted.filter((c) => c.id !== chapterId && chapterTypeOf(c) === 'part')
            const parentPartId = currentParent && currentParent.id !== chapterId && chapterTypeOf(currentParent) === 'part'
                ? currentParent.id
                : (bodyParts[0]?.id ?? null)

            if (parentPartId) {
                const partIndex = sorted.findIndex((c) => c.id === parentPartId)
                let insertAt = partIndex + 1
                while (insertAt < sorted.length && sorted[insertAt].parentId === parentPartId) {
                    insertAt += 1
                }
                moveChapter(chapterId, insertAt, parentPartId)
            } else {
                // No part exists: keep the chapter in Body root, never under a stale parentId.
                const firstBack = sorted.findIndex((c) => isBackType(chapterTypeOf(c)))
                moveChapter(chapterId, firstBack < 0 ? sorted.length : firstBack, null)
            }
            return
        }

        const firstBack = sorted.findIndex((c) => isBackType(chapterTypeOf(c)))
        moveChapter(chapterId, firstBack < 0 ? sorted.length : firstBack, null)
    }

    const handleConvert = (chapter: Chapter, option: ConvertOption) => {
        setChapterType(chapter.id, option.chapterType)
        setChapterKind(chapter.id, option.key)
        moveBySection(chapter.id, option.chapterType, option.section)
        setConvertOpenId(null)
    }

    const handleDragEnd = (event: DragEndEvent) => {
        const activeId = String(event.active.id)
        const overId = event.over ? String(event.over.id) : ''
        if (!overId || activeId === overId) return

        const target = resolveDropTarget(activeId, overId)
        if (!target) {
            setDragHint(i18n.t('chapterList.drag.invalidTarget'))
            return
        }
        moveChapter(activeId, target.toIndex, target.parentId)
        setChapterType(activeId, target.chapterType)
    }
    const pendingDeleteChapter = pendingDeleteChapterId ? chapterById.get(pendingDeleteChapterId) : undefined

    const convertMenuChapter = convertOpenId ? chapterById.get(convertOpenId) : undefined
    const hasPages = sorted.length > 0

    const handleAddEmptyPage = () => {
        addChapter(i18n.t('editor.untitled'), { chapterType: 'uncategorized', parentId: null })
    }

    return (
        <div
            ref={listViewportRef}
            data-language={languageKey}
            className={`flex h-full min-h-0 flex-col ${hasPages ? 'overflow-y-auto' : 'overflow-hidden'}`}
        >
            {hasPages ? (
                <div className="px-3 pt-3 pb-1 flex items-center justify-end gap-2">
                    <div className="flex shrink-0 items-center gap-1.5">
                        <button
                            onClick={handleAddEmptyPage}
                            className="rounded-md bg-[var(--ds-fill-neutral-control)] px-2.5 py-1.5 text-xs text-[var(--ds-text-neutral-secondary)] hover:bg-[var(--ds-fill-neutral-control-hover)]"
                            title={i18n.t('chapterList.addEmptyPageTitle')}
                        >
                            {i18n.t('chapterList.addEmptyPage')}
                        </button>
                    </div>
                </div>
            ) : null}

            <div className={`${hasPages ? 'px-2 py-1 gap-0.5' : 'px-3 py-3'} relative flex flex-col ${hasPages ? '' : 'min-h-full flex-1'}`}>
                {sorted.length === 0 ? (
                    <div className="my-auto w-full">
                        <div className="w-full rounded-xl border border-[var(--ds-border-neutral-subtle)] bg-[var(--ds-fill-neutral-card)] p-3.5">
                            <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--ds-border-neutral-default)] bg-[var(--ds-fill-neutral-control)] text-[var(--ds-text-neutral-secondary)]">
                                <Sparkles size={16} />
                            </div>
                            <h3 className="text-sm font-semibold text-[var(--ds-text-neutral-primary)]">{i18n.t('chapterList.emptyTitle')}</h3>
                            <p className="mt-1 text-xs leading-5 text-[var(--ds-text-neutral-muted)]">{i18n.t('chapterList.emptyDescription')}</p>
                            <div className="mt-3 grid gap-2">
                                <button
                                    onClick={handleAddEmptyPage}
                                    className="rounded-md border border-[var(--ds-border-info-weak)] bg-[var(--ds-fill-info-weak)] px-3 py-2 text-xs font-semibold text-[var(--ds-text-info-default)] transition-colors hover:bg-[color-mix(in_srgb,var(--ds-fill-info-weak)_86%,black)]"
                                >
                                    {i18n.t('chapterList.emptyPrimaryAction')}
                                </button>
                            </div>
                            <div className="mt-3 rounded-md border border-[var(--ds-border-neutral-subtle)] bg-[var(--ds-fill-neutral-control)] px-2.5 py-2">
                                <div className="mb-1 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--ds-text-neutral-muted)]">
                                    <Lightbulb size={12} />
                                    <span>{i18n.t('common.tip')}</span>
                                </div>
                                <p className="break-words text-[11px] leading-5 text-[var(--ds-text-neutral-muted)]">
                                    <span>{i18n.t('chapterList.emptyHintBeforeIcon')}</span>{' '}
                                    <span className="inline-flex items-center gap-1 whitespace-nowrap">
                                        <span className="inline-flex h-4 w-4 translate-y-[1px] items-center justify-center rounded border border-[var(--ds-border-neutral-default)] bg-[var(--ds-fill-neutral-card-alt)] text-[var(--ds-text-neutral-secondary)]">
                                            <ListTree size={10} />
                                        </span>
                                        <span>{i18n.t('chapterList.emptyHintAfterIcon')}</span>
                                    </span>
                                    {isKorean ? (
                                        <span className="block">{i18n.t('chapterList.emptyHintSecondLine')}</span>
                                    ) : (
                                        <span> {i18n.t('chapterList.emptyHintSecondLine')}</span>
                                    )}
                                </p>
                            </div>
                        </div>
                    </div>
                ) : (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext items={visibleChapterIds} strategy={verticalListSortingStrategy}>
                            {rows.map((row, rowIndex) => {
                                if (row.kind === 'folder') {
                                    const withSectionGap = row.id !== 'folder-front'
                                    return (
                                        <div key={row.id} className={withSectionGap ? 'pt-2.5 pl-0' : 'pl-0'}>
                                            <FolderRow row={row} />
                                        </div>
                                    )
                                }
                                if (row.kind === 'folder-drop') {
                                    return <FolderDropRow key={row.id} row={row} />
                                }
                                const chapter = row.chapter
                                const isExpanded = expanded[chapter.id] !== false
                                const prevRow = rowIndex > 0 ? rows[rowIndex - 1] : null
                                const isFirstChild =
                                    row.depth > 1 &&
                                    !!prevRow &&
                                    prevRow.kind === 'chapter' &&
                                    (prevRow.depth <= 1 || prevRow.chapter.parentId !== chapter.parentId)
                                return (
                                    <div key={row.id} className="relative">
                                        {(() => {
                                            const pathLabel = typeLabelOf(chapter)
                                            return (
                                                <SortableChapterRow
                                                    row={row}
                                                    isActive={chapter.id === activeChapterId}
                                                    expanded={isExpanded}
                                                    isFirstChild={isFirstChild}
                                                    pathLabel={pathLabel}
                                                    onRequestDelete={setPendingDeleteChapterId}
                                                    onToggleExpand={() =>
                                                        setExpanded((prev) => ({ ...prev, [chapter.id]: !isExpanded }))
                                                    }
                                                    onOpenConvert={(triggerEl) => {
                                                        setConvertOpenId((prev) => {
                                                            const next = prev === chapter.id ? null : chapter.id
                                                            if (next) {
                                                                convertTriggerRefs.current.set(chapter.id, triggerEl)
                                                                window.requestAnimationFrame(() => updateConvertMenuPosition(chapter.id))
                                                            }
                                                            return next
                                                        })
                                                    }}
                                                    registerConvertTrigger={(el) => {
                                                        if (el) convertTriggerRefs.current.set(chapter.id, el)
                                                        else convertTriggerRefs.current.delete(chapter.id)
                                                    }}
                                                />
                                            )
                                        })()}
                                    </div>
                                )
                            })}
                        </SortableContext>
                    </DndContext>
                )}
                {dragHint && (
                    <div className="mx-1 mt-1 rounded-md border border-[var(--ds-border-neutral-default)] bg-[var(--ds-fill-neutral-card)] px-2 py-1.5 text-xs text-[var(--ds-text-neutral-secondary)]">
                        {dragHint}
                    </div>
                )}
            </div>
            {convertMenuChapter && convertMenuStyle
                ? createPortal(
                    <div
                        ref={menuRef}
                        className="fixed z-[200] w-auto rounded-md border border-[var(--ds-border-neutral-default)] bg-[var(--ds-fill-neutral-card)] p-2 shadow-xl"
                        style={{
                            top: `${convertMenuStyle.top}px`,
                            left: `${convertMenuStyle.left}px`,
                            width: `${convertMenuStyle.width}px`,
                            maxHeight: `${convertMenuStyle.maxHeight}px`,
                        }}
                    >
                        <div className="mb-2 rounded border border-[var(--ds-border-neutral-subtle)] bg-[var(--ds-fill-neutral-control)] px-2.5 py-2 text-[11px] leading-4 text-[var(--ds-text-neutral-muted)]">
                            {i18n.t('chapterList.changeTypeHelp')}
                        </div>
                        <div className="overflow-y-auto pr-1" style={{ maxHeight: `${convertMenuStyle.maxHeight - 8}px` }}>
                            {convertGroups.map((group, gi) => (
                                <div key={group.title} className={gi > 0 ? 'mt-2 border-t border-[var(--ds-border-neutral-default)] pt-2' : ''}>
                                    <div className="px-2 pb-1 text-xs text-[var(--ds-text-neutral-muted)]">
                                        {group.title}
                                    </div>
                                    {group.items.map((item) => {
                                        const selected =
                                            convertMenuChapter.chapterKind === item.key ||
                                            (!convertMenuChapter.chapterKind &&
                                                ['uncategorized', 'part', 'chapter', 'divider'].includes(item.key) &&
                                                chapterTypeOf(convertMenuChapter) === item.chapterType &&
                                                sectionOfChapter(convertMenuChapter) === item.section)
                                        return (
                                            <button
                                                key={item.key}
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleConvert(convertMenuChapter, item)
                                                }}
                                                className={`w-full rounded-md px-2.5 py-2 text-left transition-colors ${selected
                                                    ? 'bg-[var(--ds-fill-info-weak)] text-[var(--ds-text-info-default)]'
                                                    : 'text-[var(--ds-text-neutral-secondary)] hover:bg-[var(--ds-fill-neutral-control)]'
                                                    }`}
                                            >
                                                <span className="grid grid-cols-[14px_minmax(0,1fr)] items-center gap-x-1.5">
                                                    <span className="inline-flex h-[14px] w-[14px] shrink-0 items-center justify-center self-center">
                                                        {selected ? <Check size={14} className="text-[var(--ds-text-info-default)]" /> : null}
                                                    </span>
                                                    <span className="min-w-0">
                                                        <span className="block text-sm">{item.label}</span>
                                                        <span className="mt-0.5 block text-xs text-[var(--ds-text-neutral-muted)]">{item.description}</span>
                                                    </span>
                                                </span>
                                            </button>
                                        )
                                    })}
                                </div>
                            ))}
                        </div>
                    </div>,
                    document.body,
                )
                : null}
            <ConfirmDialog
                open={Boolean(pendingDeleteChapter)}
                title={i18n.t('chapterList.confirmDeleteTitle', { title: pendingDeleteChapter?.title ?? '' })}
                description={i18n.t('chapterList.confirmDeleteDescription')}
                confirmLabel={i18n.t('common.delete')}
                cancelLabel={i18n.t('common.cancel')}
                onConfirm={() => {
                    if (pendingDeleteChapterId) deleteChapter(pendingDeleteChapterId)
                    setPendingDeleteChapterId(null)
                }}
                onCancel={() => setPendingDeleteChapterId(null)}
            />
        </div>
    )
}
